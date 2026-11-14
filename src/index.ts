import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { getBalance } from './services/economy/index.js';
import { handleAutocomplete, handleMessage, handleSlash } from './discord/dispatch.js';
import { commands } from './commands/index.js';
import { slashCommandData } from './discord/slash.js';
import { CONFIG, validateConfig } from './config.js';
import { NEWSLETTER, SETTINGS_REFRESH_MS, validateConstants } from './constants/index.js';
import { validateItems } from './data/items.js';
import { validateWheel } from './perks/index.js';
import { closeDb, connectDb } from './db.js';
import { validateEvents } from './events/registry.js';
import { resumeOpenEvents } from './events/runner.js';
import { startEventScheduler } from './events/scheduler.js';
import { handleRoleReaction } from './newsletter/roles.js';
import { startNewsletterScheduler } from './newsletter/send.js';
import { requireEnv } from './env.js';
import { prepareShootingStars } from './animations/gacha-reply.js';
import { STARS } from './types.js';
import { resolvePrefixSource, slashCommandsEnabled } from './lib/prefix-source.js';
import { refundLiveBets, startBetSweeper } from './services/casino/blackjack.js';
import { cashOutLiveRuns, startMineSweeper } from './services/casino/mines.js';
import { cashOutLiveSeats, startPokerSweeper } from './services/casino/poker.js';
import type { ApiDeps } from './web/api.js';
import { readWebConfig, setWebConfig, type WebConfig } from './web/config.js';
import { startWebServer } from './web/server.js';
import { pauseBatches, resumeBatches } from './services/tm-batches.js';
import { workerFights } from './web/games/technomagic/fight.js';
import { syncBio } from './discord/bio.js';
import { startStatus } from './discord/status.js';
import { raidGearSnapshot, raidWeekInfo, settleUnfinishedRaids, startRaidFromWeb } from './commands/raid.js';
import { announceTechnoMagic } from './commands/technomagic.js';
import { announceDragon } from './commands/dragon.js';
import { backfillVaultClaims, clearOpenVaults, lowerSelectorPrice, migrateInventory, renameClauseToKlaus, renameEventChannelField, renameMinesData, retireItems, rollMissingTmArmorDefs, rollMissingTmPotentials, rollMissingTmSkills, roundTmPotentials, syncGearSlots, syncTreasureSlot } from './services/migrate.js';
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

  // Every start: keeps weapons and armor in the right field, after an item moves between the two
  // (see syncGearSlots). After the treasure sync, which has already taken treasure items out.
  const gearSync = await syncGearSlots();
  if (gearSync.moved > 0 || gearSync.cleared > 0) {
    console.log(`Gear slot sync: moved ${gearSync.moved} worn item(s) into their new slot, took off ${gearSync.cleared} that no longer fit.`);
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

  // Every start: moves what was stored under Clause's old id to Klaus's (see renameClauseToKlaus).
  const klaus = await renameClauseToKlaus();
  if (klaus.members > 0 || klaus.runs > 0 || klaus.ledger > 0) {
    console.log(`Renamed Clause to Klaus: ${klaus.members} member(s)' hero, ${klaus.runs} raid run(s), ${klaus.ledger} ledger entries.`);
  }

  // Every start: clears any vault breaker left open by the old event (see clearOpenVaults).
  const clearedVaults = await clearOpenVaults();
  if (clearedVaults > 0) console.log(`Cleared ${clearedVaults} vault breaker(s) left open by the removed event.`);

  // Once: the tickets' komaDust price stored at its old 10,000 is lowered to 1,000 (see lowerSelectorPrice).
  if (await lowerSelectorPrice()) console.log('Lowered the Unique Weapon and Unique Treasure Tickets to 1,000 komaDust.');

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

  // Every start: turns copies of items taken out of the catalog into the raid drops that replace them (see retireItems).
  const retired = await retireItems();
  if (retired > 0) console.log(`Retired items: turned ${retired} copy(ies) into the raid drop that replaces them.`);

  // Every start: gives TechnoMagic copies without an additional skill one (see rollMissingTmSkills). After retiring items, which may make some.
  const skilled = await rollMissingTmSkills();
  if (skilled > 0) console.log(`TechnoMagic skills: rolled an additional skill for ${skilled} copy(ies) that had none.`);
  // Every start: gives TechnoMagic copies without potentials theirs (see rollMissingTmPotentials). After the settings are loaded, whose ranges they roll in.
  const rolled = await rollMissingTmPotentials();
  if (rolled > 0) console.log(`TechnoMagic potentials: rolled potentials for ${rolled} copy(ies) that had none.`);
  // Every start: rounds TechnoMagic copies' potentials to whole percents (see roundTmPotentials).
  const rounded = await roundTmPotentials();
  if (rounded > 0) console.log(`TechnoMagic potentials: rounded ${rounded} copy(ies)' potentials to whole percents.`);
  // Every start: gives TechnoMagic armor without its main stat's DEF one (see rollMissingTmArmorDefs).
  const armored = await rollMissingTmArmorDefs();
  if (armored > 0) console.log(`TechnoMagic armor: rolled P.DEF or M.DEF for ${armored} copy(ies) that had neither.`);

  // MessageContent is a privileged intent: it must also be switched on in the Developer Portal
  // (your application > Bot > Privileged Gateway Intents > Message Content Intent).
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
    // The role message (newsletter/roles.ts) was usually posted before this start, so it isn't in
    // the cache: without these, reactions to it would never be heard of.
    partials: [Partials.Message, Partials.Reaction, Partials.User],
  });

  let stopEvents: () => void = () => {};
  let stopNewsletter: () => void = () => {};
  let stopBetSweeper: () => void = () => {};
  let stopMineSweeper: () => void = () => {};
  let stopPokerSweeper: () => void = () => {};
  let stopWebServer: () => Promise<void> = async () => {};
  let stopStatus: () => void = () => {};

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}. Commands start with "${getPrefix()}"${slashOn ? ' or "/"' : ''}.`);
    // How long the bot has been up, in a joke line under its name.
    stopStatus = startStatus(readyClient);

    // Random events in the servers that chose an events channel (see the event command). An event
    // that was still open when the bot last stopped (a restart, a deploy) is picked up again first.
    await resumeOpenEvents(readyClient);
    stopEvents = startEventScheduler(readyClient);

    // A raid that was being played when the bot last stopped is called off, and its points given back.
    await settleUnfinishedRaids(readyClient).catch((err) => console.error('Could not settle unfinished raids:', err));

    // The weekly newsletter, in the servers that chose a newsletter channel: it goes out when the raid
    // week resets, or as soon as the bot is back if it was down then (unless NEWSLETTER.weeklyDigest is off).
    if (NEWSLETTER.weeklyDigest) stopNewsletter = startNewsletterScheduler(readyClient);

    // Points that were on a blackjack table when the bot last stopped are given back.
    stopBetSweeper = startBetSweeper();
    // Runs in the mine that were being played when the bot last stopped are cashed out.
    stopMineSweeper = startMineSweeper();
    // Chips left at poker tables when the bot last stopped go back to their players.
    stopPokerSweeper = startPokerSweeper();
    // Background raids that were being fought when the bot last stopped go on where they were.
    resumeBatches(workerFights).catch((err) => console.error('Could not pick up the background raids:', err));
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

  // Reactions put on and taken off the role message give and take its roles.
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    void handleRoleReaction(reaction, user, true);
  });
  client.on(Events.MessageReactionRemove, (reaction, user) => {
    void handleRoleReaction(reaction, user, false);
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
    stopNewsletter();
    stopStatus();
    stopBetSweeper();
    stopMineSweeper();
    stopPokerSweeper();
    pauseBatches();
    await stopWebServer();
    // Tables are being closed with the bot: give their bets back now instead of waiting for the sweeper.
    await refundLiveBets();
    // And runs in the mine are cashed out at the multiplier they reached.
    await cashOutLiveRuns();
    // And everyone at a poker table gets their chips back (as of the last hand finished).
    await cashOutLiveSeats();
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
    technomagic: {
      announce: (guildId, host, _boss, room) => {
        announceTechnoMagic(client, guildId, host, room).catch((err) => console.error('Could not say a TechnoMagic Raid room was opened:', err));
      },
    },
    dragon: {
      announce: (guildId, host, boss, room) => {
        announceDragon(client, guildId, host, boss, room).catch((err) => console.error('Could not say a Dragon Raid room was opened:', err));
      },
    },
    raid: {
      start: (guildId, userId, level) => startRaidFromWeb(client, guildId, userId, level),
      week: raidWeekInfo,
      gear: raidGearSnapshot,
      avatar,
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
