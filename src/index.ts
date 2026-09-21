import { Client, Events, GatewayIntentBits } from 'discord.js';
import { commandMap } from './commands/index.js';
import { reply } from './commands/reply.js';
import { validateConfig } from './config.js';
import { SETTINGS_REFRESH_MS, TEXT, validateConstants } from './constants.js';
import { validateItems } from './data/items.js';
import { validateWheel } from './data/wheel.js';
import { closeDb, connectDb } from './db.js';
import { requireEnv } from './env.js';
import { parseCommand } from './lib/parse.js';
import { resolvePrefixSource } from './lib/prefix-source.js';
import { migrateInventory } from './services/migrate.js';
import { getPrefix, loadSettings, refreshSettings, setEnvPrefix } from './services/settings.js';

async function main(): Promise<void> {
  validateConstants();
  validateConfig();
  validateItems();
  validateWheel();

  // With ENV=LOCAL the prefix comes from .env (DS_PREFIX); otherwise it is read from MongoDB.
  const prefixSource = resolvePrefixSource(process.env);
  if (prefixSource.source === 'env') {
    setEnvPrefix(prefixSource.prefix);
    console.log(`ENV=LOCAL: using the prefix "${prefixSource.prefix}" from .env. The prefix stored in MongoDB is ignored.`);
  } else {
    console.log('Using the prefix stored in MongoDB.');
  }

  // Fail fast on a missing token, before opening the database connection.
  const token = requireEnv('DS_TOKEN');

  await connectDb();
  console.log('Connected to MongoDB.');

  // One time only: turn the old item counts into one document per copy. Later starts skip it.
  const migration = await migrateInventory();
  if (!migration.skipped) {
    console.log(
      `Moved ${migration.stacks} item stacks into ${migration.copies} item copies and updated ${migration.equipped} equipped items.`,
    );
  }

  // Unless ENV=LOCAL, the command prefix lives in the database (settings collection, default
  // "k!"). Re-read it every minute so an edit in MongoDB takes effect without restarting the bot.
  await loadSettings();
  const settingsTimer = setInterval(() => {
    refreshSettings().catch((err) => console.error('Failed to refresh settings:', err));
  }, SETTINGS_REFRESH_MS);
  settingsTimer.unref();

  // MessageContent is a privileged intent: it must also be switched on in the Developer Portal
  // (your application > Bot > Privileged Gateway Intents > Message Content Intent).
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}. Commands start with "${getPrefix()}"`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;

    const parsed = parseCommand(message.content, getPrefix());
    if (!parsed) return;

    const command = commandMap.get(parsed.name);
    if (!command) return;

    try {
      await command.execute({ message, args: parsed.args });
    } catch (err) {
      console.error(`Error running ${getPrefix()}${parsed.name}:`, err);
      try {
        await reply(message, TEXT.common.error);
      } catch (replyErr) {
        console.error('Could not send the error message:', replyErr);
      }
    }
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down.`);
    await client.destroy();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await client.login(token);
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
