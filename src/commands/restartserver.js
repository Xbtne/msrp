const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../config.json');
const { triggerRestart } = require('../utils/restartState');

function getConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading config:', e);
  }
  return {};
}

const DEFAULT_WEBHOOK_URL = "https://discord.com/api/webhooks/1552564456213717002/SlEPp6M7sBG0FacsFHuubFhCoz3yBnr1eNbx8MQWQZx7I6LdKth0IJPY1EnTxsDEPZoR";

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restartserver')
    .setDescription('Restart the Roblox game servers and broadcast restart alerts')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('Reason for restarting the Roblox server (e.g., Update, Maintenance)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (e) {}

    const reason = interaction.options.getString('reason') || 'Server Update / Maintenance';
    const config = getConfig();

    // 0. Trigger in-memory restart queue for HTTP polling
    triggerRestart(interaction.user.tag, reason);

    const webhookUrl = config.robloxWebhookUrl || DEFAULT_WEBHOOK_URL;
    const universeId = process.env.ROBLOX_UNIVERSE_ID || config.robloxUniverseId;
    const apiKey = process.env.ROBLOX_API_KEY || config.robloxApiKey;

    let openCloudSuccess = false;
    let openCloudMessage = 'Active via Relay & Webhook';

    // 1. If Open Cloud API is configured, publish to Roblox MessagingService
    if (universeId && apiKey) {
      try {
        const response = await fetch(
          `https://apis.roblox.com/messaging-service/v1/universes/${universeId}/topics/GlobalServerRestart`,
          {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: JSON.stringify({
                initiator: `${interaction.user.tag} (${interaction.user.id})`,
                reason: reason
              })
            })
          }
        );

        if (response.ok || response.status === 200) {
          openCloudSuccess = true;
          openCloudMessage = 'Published to all active game servers via Open Cloud MessagingService';
        } else {
          const errText = await response.text();
          openCloudMessage = `Roblox Open Cloud error: ${errText}`;
        }
      } catch (err) {
        openCloudMessage = `Network error contacting Roblox API: ${err.message}`;
      }
    }

    // 2. Post alert to Discord Webhook
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [
              {
                title: '🔄 Remote Server Restart Command',
                description: `A server restart was triggered via Discord slash command \`/restartserver\`.`,
                color: 16753920, // Amber
                fields: [
                  { name: '👤 Moderator / Staff', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                  { name: '📝 Reason', value: reason, inline: true },
                  { name: '🌐 Scope', value: 'All Active Game Instances', inline: true },
                  { name: '📡 Status', value: openCloudSuccess ? '✅ Signal Dispatched' : '⚠️ Webhook Alert Sent', inline: false }
                ],
                footer: {
                  text: 'Monroe County Bot • Restart System'
                },
                timestamp: new Date().toISOString()
              }
            ]
          })
        });
      } catch (e) {
        console.error('Error posting to restart webhook:', e);
      }
    }

    // 3. Reply to the slash command in Discord
    const replyEmbed = new EmbedBuilder()
      .setTitle('🔄 Roblox Server Restart Dispatched')
      .setColor(openCloudSuccess ? 0x57F287 : 0xFEE75C)
      .setDescription(`Server restart command has been processed for **Monroe County**.`)
      .addFields(
        { name: 'Staff Member', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason, inline: true },
        { name: 'Webhook Log', value: `[Delivered to Discord](<${webhookUrl}>)`, inline: false },
        { name: 'Open Cloud Status', value: `\`${openCloudMessage}\``, inline: false }
      )
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({ text: 'Monroe County Support & Management' })
      .setTimestamp();

    return interaction.editReply({ embeds: [replyEmbed] });
  }
};
