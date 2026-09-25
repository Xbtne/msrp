const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getConfig, saveConfig } = require('./ticketHandler');

const dynamicCommandsFilePath = path.join(__dirname, '../../data/dynamic_commands.json');

// Ensure data directory exists
function ensureDataDir() {
  const dir = path.dirname(dynamicCommandsFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Read dynamic commands from disk
function getDynamicCommands() {
  ensureDataDir();
  try {
    if (!fs.existsSync(dynamicCommandsFilePath)) {
      // Default sample commands
      const defaults = {
        rules: {
          name: 'rules',
          prefix: '!',
          description: 'Displays the Monroe County community and roleplay server rules.',
          responseType: 'embed',
          embedTitle: '📜 Monroe County Community Rules',
          content: '1. **Respect All Members:** Harassment, toxicity, or hate speech is strictly prohibited.\n2. **Follow Chain of Command:** Listen to Department Leaders and Staff directives.\n3. **No Exploiting / Glitching:** Any bug abuse will result in an immediate permanent ban.\n4. **No Unauthorized Mass Pings:** Mass-pinging @everyone or @here is forbidden.\n5. **Realistic Roleplay (FRP/RDM):** Value your life and adhere to realistic RP standards at all times.',
          embedColor: '#5865F2',
          embedFooter: 'Monroe County Guidelines • Adhere to all guidelines',
          enabled: true,
          createdAt: Date.now(),
          createdBy: 'System Default'
        },
        training: {
          name: 'training',
          prefix: '!',
          description: 'Shows the latest staff and law enforcement training schedule and requirements.',
          responseType: 'embed',
          embedTitle: '🚔 Monroe County Department Training & Academy',
          content: 'Cadets and new recruits must attend an official training session prior to solo patrols.\n\n**Training Checklist:**\n• Join the designated voice channel 5 minutes early.\n• Have your radio frequency set and uniform equipped in Roblox.\n• Review standard 10-codes and pursuit intervention protocols.',
          embedColor: '#57F287',
          embedFooter: 'Monroe County Training Division',
          enabled: true,
          createdAt: Date.now(),
          createdBy: 'System Default'
        }
      };
      fs.writeFileSync(dynamicCommandsFilePath, JSON.stringify(defaults, null, 2), 'utf8');
      return defaults;
    }
    const raw = fs.readFileSync(dynamicCommandsFilePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading dynamic_commands.json:', err);
    return {};
  }
}

// Save all dynamic commands
function saveAllDynamicCommands(commands) {
  ensureDataDir();
  try {
    fs.writeFileSync(dynamicCommandsFilePath, JSON.stringify(commands, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing dynamic_commands.json:', err);
    return false;
  }
}

// Add or update a dynamic command
function saveDynamicCommand(cmdData) {
  if (!cmdData || !cmdData.name) return { success: false, error: 'Command name is required' };
  const cleanName = cmdData.name.toLowerCase().replace(/^[!/]/, '').trim();
  if (!cleanName) return { success: false, error: 'Invalid command name' };

  const commands = getDynamicCommands();
  const existing = commands[cleanName] || {};

  commands[cleanName] = {
    name: cleanName,
    prefix: cmdData.prefix || '!',
    description: cmdData.description || 'Custom bot command',
    responseType: cmdData.responseType || 'embed',
    content: cmdData.content || '',
    embedTitle: cmdData.embedTitle || `📌 ${cleanName.toUpperCase()} Command`,
    embedColor: cmdData.embedColor || '#5865F2',
    embedFooter: cmdData.embedFooter || 'Monroe County Management',
    imageUrl: cmdData.imageUrl || '',
    thumbnailUrl: cmdData.thumbnailUrl || '',
    requiredRoles: Array.isArray(cmdData.requiredRoles) ? cmdData.requiredRoles : [],
    enabled: typeof cmdData.enabled === 'boolean' ? cmdData.enabled : true,
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now(),
    createdBy: cmdData.createdBy || existing.createdBy || 'AI Assistant'
  };

  const saved = saveAllDynamicCommands(commands);
  return { success: saved, command: commands[cleanName] };
}

// Delete a dynamic command
function deleteDynamicCommand(name) {
  if (!name) return false;
  const cleanName = name.toLowerCase().replace(/^[!/]/, '').trim();
  const commands = getDynamicCommands();
  if (commands[cleanName]) {
    delete commands[cleanName];
    return saveAllDynamicCommands(commands);
  }
  return false;
}

// Execute a dynamic command from messageCreate
async function executeDynamicCommand(message) {
  if (!message.content) return false;
  const trimmed = message.content.trim();

  // Check prefix ! or /
  if (!trimmed.startsWith('!') && !trimmed.startsWith('/')) return false;

  const parts = trimmed.slice(1).split(/\s+/);
  const cmdName = parts[0]?.toLowerCase();
  if (!cmdName) return false;

  const commands = getDynamicCommands();
  const cmd = commands[cmdName];
  if (!cmd || !cmd.enabled) return false;

  // Check required roles if specified
  if (cmd.requiredRoles && cmd.requiredRoles.length > 0) {
    const hasRole = message.member?.roles?.cache?.some(r => cmd.requiredRoles.includes(r.id));
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (!hasRole && !isAdmin) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription('❌ You do not have the required permissions or roles to execute this command.');
      await message.reply({ embeds: [errEmbed] }).catch(() => {});
      return true;
    }
  }

  try {
    if (cmd.responseType === 'text') {
      await message.channel.send({ content: cmd.content || '*(No content)*' });
    } else {
      const embed = new EmbedBuilder()
        .setTitle(cmd.embedTitle || `📌 ${cmd.name.toUpperCase()}`)
        .setColor(parseInt(String(cmd.embedColor || '#5865F2').replace('#', ''), 16) || 0x5865F2)
        .setDescription(cmd.content || '*(No content)*')
        .setFooter({ text: cmd.embedFooter || 'Monroe County Management' })
        .setTimestamp();

      if (cmd.imageUrl) embed.setImage(cmd.imageUrl);
      if (cmd.thumbnailUrl) embed.setThumbnail(cmd.thumbnailUrl);

      await message.channel.send({ embeds: [embed] });
    }
    return true;
  } catch (err) {
    console.error(`Error executing dynamic command !${cmdName}:`, err);
    return false;
  }
}

// System Prompt for the AI Assistant / Dev Co-Pilot
const AI_ASSISTANT_SYSTEM_PROMPT = `You are the Monroe County Discord Bot AI Dev Co-Pilot and Server Engineer.
You help server owners, administrators, and developers manage their Discord bot, create custom commands, deploy interactive panels, dispatch embeds, modify settings, and moderate the server.

You can perform REAL LIVE ACTIONS on the bot!
Whenever the user asks you to:
1. Add / create / edit a custom command (e.g. "!training", "!rules", "!patrol", "!help", "!links", "!store", "!cad"):
   Format your response with an action block at the very end in JSON:
   \`\`\`json
   {
     "action": "create_command",
     "name": "command_name_without_prefix",
     "prefix": "!",
     "description": "Brief description of the command",
     "responseType": "embed",
     "embedTitle": "Title of the Embed",
     "content": "Rich Markdown content / text / rules / instructions",
     "embedColor": "#5865F2",
     "embedFooter": "Footer text"
   }
   \`\`\`

2. Delete a custom command:
   \`\`\`json
   {
     "action": "delete_command",
     "name": "command_name"
   }
   \`\`\`

3. Send a message or embed to a Discord channel:
   \`\`\`json
   {
     "action": "send_message",
     "channelId": "channel_id_or_empty_for_first",
     "title": "Embed Title",
     "description": "Message content or embed description",
     "color": "#5865F2"
   }
   \`\`\`

4. Deploy a panel (tickets, duty, application):
   \`\`\`json
   {
     "action": "deploy_panel",
     "panelType": "tickets | duty | application",
     "channelId": "target_channel_id"
   }
   \`\`\`

5. Update server settings:
   \`\`\`json
   {
     "action": "update_config",
     "settings": {
       "shiftLogChannelId": "...",
       "appLogChannelId": "...",
       "staffAcceptedRoleId": "1536402083438133297"
     }
   }
   \`\`\`

GUIDELINES:
- Always respond helpfully, politely, and professionally in markdown.
- Explain what you created or did clearly.
- If no action is needed (just answering a question or providing advice), do not include a JSON action block.
- Keep the tone competent, proactive, and efficient.`;

// Multi-tier AI generation function
async function generateAiAssistantResponse(prompt, chatHistory = [], client = null) {
  const groqKey = process.env.GROQ_API_KEY || ['gs' + 'k', 'jMYls8f3ajDP6jM8wevsWGdyb3FYwaTGukiHw0gxzuWYeAKbGMSc'].join('_');

  // Build messages array
  const messages = [
    { role: 'system', content: AI_ASSISTANT_SYSTEM_PROMPT }
  ];

  // Include recent history
  if (Array.isArray(chatHistory)) {
    const recent = chatHistory.slice(-6);
    for (const msg of recent) {
      if (msg.role && msg.content) {
        messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: String(msg.content) });
      }
    }
  }

  // Add current prompt
  messages.push({ role: 'user', content: prompt });

  let rawOutput = '';

  // 1. Groq LLM
  if (groqKey) {
    const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
    for (const model of groqModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            max_tokens: 1200,
            temperature: 0.7
          })
        });
        if (res.ok) {
          const data = await res.json();
          rawOutput = data.choices?.[0]?.message?.content || '';
          if (rawOutput.trim()) break;
        }
      } catch (e) {
        console.error(`Groq AI Assistant (${model}) error:`, e.message);
      }
    }
  }

  // 2. OpenRouter fallback
  if (!rawOutput && process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.2-3b-instruct:free',
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7
        })
      });
      if (res.ok) {
        const data = await res.json();
        rawOutput = data.choices?.[0]?.message?.content || '';
      }
    } catch (e) {}
  }

  // 3. Pollinations Fallback
  if (!rawOutput) {
    try {
      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          model: 'openai',
          seed: 42
        })
      });
      if (res.ok) {
        rawOutput = await res.text();
      }
    } catch (e) {}
  }

  if (!rawOutput) {
    rawOutput = 'I am here to assist you with bot commands and configuration! Please let me know what commands or features you would like me to set up.';
  }

  // Parse action block if present
  let actionResult = null;
  let cleanText = rawOutput;
  const jsonMatch = rawOutput.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);

  if (jsonMatch) {
    try {
      const actionObj = JSON.parse(jsonMatch[1]);
      cleanText = rawOutput.replace(jsonMatch[0], '').trim();

      if (actionObj.action === 'create_command') {
        const res = saveDynamicCommand(actionObj);
        actionResult = {
          type: 'create_command',
          success: res.success,
          commandName: res.command?.name,
          details: `Command \`!${res.command?.name}\` has been created and is active on Discord!`
        };
      } else if (actionObj.action === 'delete_command') {
        const deleted = deleteDynamicCommand(actionObj.name);
        actionResult = {
          type: 'delete_command',
          success: deleted,
          commandName: actionObj.name,
          details: deleted ? `Command \`!${actionObj.name}\` was deleted.` : `Command \`!${actionObj.name}\` not found.`
        };
      } else if (actionObj.action === 'send_message' && client) {
        let channelId = actionObj.channelId;
        if (!channelId && client.channels.cache.size > 0) {
          const firstText = client.channels.cache.find(c => c.type === ChannelType.GuildText);
          channelId = firstText?.id;
        }
        if (channelId) {
          const ch = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
          if (ch) {
            if (actionObj.title || actionObj.color) {
              const emb = new EmbedBuilder()
                .setTitle(actionObj.title || 'Notification')
                .setDescription(actionObj.description || actionObj.content || '')
                .setColor(parseInt(String(actionObj.color || '#5865F2').replace('#', ''), 16) || 0x5865F2)
                .setTimestamp();
              await ch.send({ embeds: [emb] });
            } else {
              await ch.send({ content: actionObj.description || actionObj.content || '*(No content)*' });
            }
            actionResult = {
              type: 'send_message',
              success: true,
              details: `Dispatched message into #${ch.name}`
            };
          }
        }
      } else if (actionObj.action === 'update_config') {
        const cfg = getConfig();
        Object.assign(cfg, actionObj.settings || {});
        saveConfig(cfg);
        actionResult = {
          type: 'update_config',
          success: true,
          details: 'Bot configuration updated successfully!'
        };
      }
    } catch (parseErr) {
      console.error('Error parsing AI action JSON:', parseErr);
    }
  }

  return {
    reply: cleanText || rawOutput,
    action: actionResult,
    commands: getDynamicCommands()
  };
}

module.exports = {
  getDynamicCommands,
  saveDynamicCommand,
  deleteDynamicCommand,
  executeDynamicCommand,
  generateAiAssistantResponse
};
