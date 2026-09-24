require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
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

const { renderDashboard } = require('./utils/dashboard');
const { getPendingRestart, triggerRestart } = require('./utils/restartState');

// Web Dashboard & HTTP API Server for Roblox & Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Roblox-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://localhost:${port}`);

  if (reqUrl.pathname === '/api/roblox/poll-restart' || reqUrl.pathname === '/poll-restart') {
    const lastId = reqUrl.searchParams.get('lastId');
    const pending = getPendingRestart(lastId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      hasRestart: !!pending,
      restart: pending || null,
      timestamp: Date.now()
    }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderDashboard(client));
}).listen(port, () => {
  console.log(`🌐 Web Dashboard & Roblox API listening on port ${port}`);
});

// Auto keep-alive ping to prevent Render free tier from sleeping
const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
if (externalUrl) {
  console.log(`📡 Auto keep-alive enabled for URL: ${externalUrl}`);
  setInterval(async () => {
    try {
      await fetch(externalUrl);
    } catch (e) {}
  }, 8 * 60 * 1000); // Ping every 8 minutes
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  presence: {
    activities: [{ name: 'Monroe County', type: ActivityType.Watching }],
    status: 'online'
  }
});

// Explicitly set tokens to prevent unauthenticated REST requests
client.rest.setToken(token);
client.token = token;

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

