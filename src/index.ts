import { Client, Events, GatewayIntentBits } from 'discord.js';
import { getBalance } from './services/economy/index.js';
import { handleAutocomplete, handleMessage, handleSlash } from './discord/dispatch.js';
import { commands } from './commands/index.js';
import { slashCommandData } from './discord/slash.js';
import { CONFIG, validateConfig } from './config.js';
import { SETTINGS_REFRESH_MS, validateConstants } from './constants/index.js';
import { validateItems } from './data/items.js';
import { validateWheel } from './perks/index.js';
import { closeDb, connectDb } from './db.js';
import { validateEvents } from './events/registry.js';
import { resumeOpenEvents } from './events/runner.js';
import { startEventScheduler } from './events/scheduler.js';
import { requireEnv } from './env.js';
import { prepareShootingStars } from './animations/gacha-reply.js';
import { STARS } from './types.js';
import { resolvePrefixSource, slashCommandsEnabled } from './lib/prefix-source.js';
import { refundLiveBets, startBetSweeper } from './services/casino/blackjack.js';
import { cashOutLiveRuns, startMineSweeper } from './services/casino/mines.js';
import type { ApiDeps } from './web/api.js';
import { readWebConfig, setWebConfig, type WebConfig } from './web/config.js';
import { startWebServer } from './web/server.js';
import { syncBio } from './discord/bio.js';
import { raidGearSnapshot, raidWeekInfo, settleUnfinishedRaids, startRaidFromWeb } from './commands/raid.js';
import { backfillVaultClaims, clearOpenVaults, migrateInventory, renameEventChannelField, renameMinesData, syncTreasureSlot } from './services/migrate.js';
import { getPrefix, loadSettings, refreshSettings, setEnvPrefix } from './services/settings.js';

async function main(): Promise<void> {
  validateConstants();
  validateConfig();
  validateItems();
  validateWheel();
  validateEvents();

  // With ENV=LOCAL the prefix comes from .env (DS_PREFIX); otherwise it is read from MongoDB.
  const prefixSource = resolvePrefixSource(process.env);
  if (prefixSource.source === 'env') {
    setEnvPrefix(prefixSource.prefix);
    console.log(`ENV=LOCAL: using the prefix "${prefixSource.prefix}" from .env. The prefix stored in MongoDB is ignored.`);
  } else {
    console.log('Using the prefix stored in MongoDB.');
  }

  // A local test bot shares the Discord application (and so the slash commands) with the real bot, so
  // with ENV=LOCAL it neither registers nor answers slash commands; the prefix commands still work.
  const slashOn = slashCommandsEnabled(process.env);
  if (!slashOn) console.log('ENV=LOCAL: slash commands are off (not registered, not answered), so this bot does not interfere with the real one.');

  // Fail fast on a missing token, before opening the database connection.
  const token = requireEnv('DS_TOKEN');

  // The games' web site (the mine and Pinecraft) when WEB_URL and WEB_API_URL are set. Without it the
  // mine is played with buttons in Discord, and Pinecraft isn't played.
  const web = readWebConfig();
  setWebConfig(web);
  if (!web) console.log('WEB_URL is not set: the mine is played with buttons in Discord, and Pinecraft is off.');

  await connectDb();
  console.log('Connected to MongoDB.');

  // One time only: turn the old item counts into one document per copy. Later starts skip it.
  const migration = await migrateInventory();
  if (!migration.skipped) {
    console.log(
      `Moved ${migration.stacks} item stacks into ${migration.copies} item copies and updated ${migration.equipped} equipped items.`,
    );
  }

  // Every start: keeps unique-treasure items in equipment.treasure, since a catalog item's
  // slot can change after members already have it equipped (see migrate.ts for why this isn't
  // a one-time migration).
  const treasureSync = await syncTreasureSlot();
  if (treasureSync.renamed > 0 || treasureSync.moved > 0 || treasureSync.cleared > 0) {
    console.log(
      `Treasure slot sync: renamed ${treasureSync.renamed} old field(s), moved ${treasureSync.moved} equipped item(s) into the treasure slot` +
        (treasureSync.dropped > 0 ? ` (${treasureSync.dropped} had to drop a second one that no longer fit)` : '') +
        (treasureSync.cleared > 0 ? `, cleared ${treasureSync.cleared} stale item(s) that already had a different treasure equipped.` : '.'),
    );
  }

  // Every start: renames the old eventChannelId field to channelId (see services/channel.ts) in
  // any server still holding it. Cheap and a no-op once every server has been renamed.
  const channelFieldRenames = await renameEventChannelField();
  if (channelFieldRenames > 0) {
    console.log(`Renamed the dedicated-channel field (eventChannelId -> channelId) in ${channelFieldRenames} server(s).`);
  }

  // Every start: moves what was stored under the mine's old names to Mines' (see renameMinesData).
  // Before the settings are loaded, so the Mines settings keep the values they were set to.
  const minesRename = await renameMinesData();
  if (minesRename.settings || minesRename.rounds > 0 || minesRename.ledger > 0) {
    console.log(
      `Renamed the mine to Mines: settings ${minesRename.settings ? 'moved' : 'were already moved'}, ${minesRename.rounds} round(s) carried over, ${minesRename.ledger} ledger entries renamed.`,
    );
  }

  // Every start: clears any vault breaker left open by the old event (see clearOpenVaults).
  const clearedVaults = await clearOpenVaults();
  if (clearedVaults > 0) console.log(`Cleared ${clearedVaults} vault breaker(s) left open by the removed event.`);

  // Unless ENV=LOCAL, the command prefix lives in the database (settings collection, default
  // "k!"). Re-read it every minute so an edit in MongoDB takes effect without restarting the bot.
  await loadSettings();
  const settingsTimer = setInterval(() => {
    refreshSettings().catch((err) => console.error('Failed to refresh settings:', err));
  }, SETTINGS_REFRESH_MS);
  settingsTimer.unref();

  // Every start: dates the last vault claim for servers claimed before claims were saved (see
  // backfillVaultClaims). After the settings, so it has the vault's hourly growth.
  const vaultClaims = await backfillVaultClaims(CONFIG.events.vault.hourlyGrowth);
  if (vaultClaims > 0) console.log(`Dated the last vault claim in ${vaultClaims} server(s) from the ledger.`);

  // MessageContent is a privileged intent: it must also be switched on in the Developer Portal
  // (your application > Bot > Privileged Gateway Intents > Message Content Intent).
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  let stopEvents: () => void = () => {};
  let stopBetSweeper: () => void = () => {};
  let stopMineSweeper: () => void = () => {};
  let stopWebServer: () => Promise<void> = async () => {};

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}. Commands start with "${getPrefix()}"${slashOn ? ' or "/"' : ''}.`);

    // Random events in the servers that chose an events channel (see the event command). An event
    // that was still open when the bot last stopped (a restart, a deploy) is picked up again first.
    await resumeOpenEvents(readyClient);
    stopEvents = startEventScheduler(readyClient);

    // A raid that was being played when the bot last stopped is called off, and its points given back.
    await settleUnfinishedRaids(readyClient).catch((err) => console.error('Could not settle unfinished raids:', err));

    // Points that were on a blackjack table when the bot last stopped are given back.
    stopBetSweeper = startBetSweeper();
    // Runs in the mine that were being played when the bot last stopped are cashed out.
    stopMineSweeper = startMineSweeper();
    if (web) stopWebServer = startWebServer({ port: web.port, api: siteDeps(readyClient, web) });
    // The bio links to the site. Not from a local test bot: it shares the application (and so the
    // bio) with the real bot, and its site is usually localhost.
    if (web && slashOn) void syncBio(readyClient, web.siteUrl);

    // The gacha's shooting stars take a moment to draw, so draw them now rather than on the first pulls.
    prepareShootingStars(STARS);

    // Tell Discord which slash commands exist. This replaces the whole list every start, so a
    // command removed from the code disappears from Discord too. A failure here only costs the
    // slash commands; the prefix commands keep working.
    if (!slashOn) return;
    try {
      const data = slashCommandData(commands);
      await readyClient.application.commands.set(data);
      console.log(`Registered ${data.length} slash commands.`);
    } catch (err) {
      console.error('Could not register the slash commands:', err);
    }
  });

  client.on(Events.MessageCreate, (message) => {
    void handleMessage(message, getPrefix());
  });

  // Slash commands and the suggestion lists of their options. Button presses are handled where the
  // buttons are made (see discord/confirm.ts), so they are ignored here.
  client.on(Events.InteractionCreate, (interaction) => {
    if (!slashOn) return;
    if (interaction.isChatInputCommand()) void handleSlash(interaction);
    else if (interaction.isAutocomplete()) void handleAutocomplete(interaction);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down.`);
    stopEvents();
    stopBetSweeper();
    stopMineSweeper();
    await stopWebServer();
    // Tables are being closed with the bot: give their bets back now instead of waiting for the sweeper.
    await refundLiveBets();
    // And runs in the mine are cashed out at the multiplier they reached.
    await cashOutLiveRuns();
    await client.destroy();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await client.login(token);
}

/** What the site's requests (web/api.ts) need to know from Discord and the database. */
function siteDeps(client: Client<true>, config: WebConfig): ApiDeps {
  const avatar = (guildId: string, userId: string): string | null =>
    client.guilds.cache.get(guildId)?.members.cache.get(userId)?.displayAvatarURL({ size: 64 }) ?? client.users.cache.get(userId)?.displayAvatarURL({ size: 64 }) ?? null;
  return {
    config,
    clientId: () => client.application.id,
    guild: (guildId) => {
      const guild = client.guilds.cache.get(guildId);
      return guild ? { name: guild.name, icon: guild.icon } : null;
    },
    memberName: async (guildId, userId) => {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return null;
      try {
        return (await guild.members.fetch(userId)).displayName;
      } catch {
        return null;
      }
    },
    balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
    avatar,
    raid: {
      start: (guildId, userId) => startRaidFromWeb(client, guildId, userId),
      week: raidWeekInfo,
      gear: raidGearSnapshot,
      avatar,
      name: async (guildId, userId) => {
        const guild = client.guilds.cache.get(guildId);
        return guild ? ((await guild.members.fetch(userId).catch(() => null))?.displayName ?? null) : null;
      },
    },
  };
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  if (err instanceof Error && /disallowed intents/i.test(err.message)) {
    console.error(
      'Turn on "Message Content Intent" in the Discord Developer Portal: ' +
        'your application > Bot > Privileged Gateway Intents.',
    );
  }
  process.exit(1);
});
