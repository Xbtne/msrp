require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes,
  ActivityType,
  Events
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('❌ Error: DISCORD_TOKEN is not defined in .env file!');
  process.exit(1);
}

const { handleDashboardRequest } = require('./utils/dashboard');

// Web Dashboard & HTTP health check server for Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  handleDashboardRequest(req, res, client);
}).listen(port, () => {
  console.log(`🌐 Web Dashboard listening on port ${port}`);
});

// Auto keep-alive ping to prevent Render / hosting platform from sleeping (24/7 active)
const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
setInterval(async () => {
  try {
    if (externalUrl) {
      await fetch(externalUrl).catch(() => null);
    }
    // Ping local server
    await fetch(`http://127.0.0.1:${port}/api/status`).catch(() => null);
  } catch (e) {}
}, 3.5 * 60 * 1000); // Ping every 3.5 minutes

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember
  ],
  presence: {
    activities: [{ name: 'Monroe County • 24/7', type: ActivityType.Watching }],
    status: 'online'
  }
});

// Explicitly set tokens to prevent unauthenticated REST requests
client.rest.setToken(token);
client.token = token;

// 24/7 Shard and Gateway lifecycle resilience
client.on('error', err => console.error('⚠️ [Client Error]:', err.message));
client.on('shardError', (err, shardId) => console.error(`⚠️ [Shard ${shardId} Error]:`, err.message));
client.on('shardDisconnect', (event, shardId) => console.warn(`⚠️ [Shard ${shardId} Disconnected]:`, event?.reason || event));
client.on('shardReconnecting', shardId => console.log(`🔄 [Shard ${shardId} Reconnecting...]`));
client.on('shardResume', (shardId, replayedEvents) => console.log(`✅ [Shard ${shardId} Resumed] (${replayedEvents} events replayed)`));

// Process-level error protection
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});

client.commands = new Collection();

// Load Commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const slashCommandsData = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    slashCommandsData.push(command.data.toJSON());
    console.log(`[Command] Loaded: /${command.data.name}`);
  } else {
    console.warn(`[Command Warning] The file ${file} is missing "data" or "execute" property.`);
  }
}

// Load Events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`[Event] Loaded: ${event.name}`);
}

// Ready event
client.once(Events.ClientReady, async () => {
  // Re-verify token on rest
  client.rest.setToken(token);
  client.token = token;

  console.log(`=========================================`);
  console.log(`🤖 Logged in as: ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log(`🌐 Connected to ${client.guilds.cache.size} server(s)`);
  console.log(`=========================================`);

  // Register Slash Commands Globally
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('🔄 Registering global application (/) commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommandsData }
    );
    console.log('✅ Successfully registered global slash commands!');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }

  // Periodic refresh for Clocky Duty panels (every 2 minutes)
  const { updateLivePanels, getShiftsData } = require('./utils/shiftHandler');
  setInterval(() => {
    try {
      const data = getShiftsData();
      for (const guildId of Object.keys(data)) {
        if (data[guildId]?.panels?.length > 0) {
          updateLivePanels(client, guildId);
        }
      }
    } catch (e) {}
  }, 2 * 60 * 1000);
});

async function startBot() {
  try {
    await client.login(token);
  } catch (err) {
    console.error('❌ Login error, retrying in 4 seconds...', err.message);
    setTimeout(startBot, 4000);
  }
}

startBot();

