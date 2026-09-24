const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const GAME_URL = 'https://www.roblox.com/games/81671593422999/MSRC-Monroe-County#!/about';
const DEFAULT_WEBHOOK_URL = 'https://discord.com/api/webhooks/1552564456213717002/SlEPp6M7sBG0FacsFHuubFhCoz3yBnr1eNbx8MQWQZx7I6LdKth0IJPY1EnTxsDEPZoR';

const configPath = path.join(__dirname, '../../config.json');
function getConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {}
  return {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstartup')
    .setDescription('Announce a game server startup and invite players to join Monroe County')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt
        .setName('notes')
        .setDescription('Custom notes or session details (e.g. Special Patrol, Active Staff, Event)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('ping')
        .setDescription('Choose who to ping for the startup announcement')
        .setRequired(false)
        .addChoices(
          { name: '@everyone', value: '@everyone' },
          { name: '@here', value: '@here' },
          { name: 'No Ping', value: 'none' }
        )
    ),

  async execute(interaction) {
    const notes = interaction.options.getString('notes') || 'Staff are in-game! Join now for realistic roleplay and active patrols.';
    const pingChoice = interaction.options.getString('ping') || '@everyone';
    const config = getConfig();

    let pingContent = '';
    if (pingChoice === '@everyone') {
      pingContent = '@everyone';
    } else if (pingChoice === '@here') {
      pingContent = '@here';
    }

    const startupEmbed = new EmbedBuilder()
      .setTitle('🚨 MSRC • SERVER STARTUP IN PROGRESS!')
      .setDescription(
        `### 🚓 Monroe County Roleplay is now LIVE & ACTIVE!\n\n` +
        `Come join the server! State Patrol, Sheriff's Office, Fire/EMS, and DOT are actively patrolling.\n\n` +
        `**Session Details:**\n> ${notes}\n\n` +
        `**Hosted By:** <@${interaction.user.id}>\n` +
        `**Status:** 🟢 **SERVER OPEN & ONLINE**\n\n` +
        `Click the **Join Game** button below to hop straight into the server!`
      )
      .setColor(0x0284C7) // Vibrant Blue / Police Cyan
      .addFields(
        { name: '🎮 Game Link', value: `[Click Here to Play MSRC](<${GAME_URL}>)`, inline: true },
        { name: '👮 Host / Supervisor', value: `${interaction.user.tag}`, inline: true },
        { name: '⚡ Quick Join', value: `\`roblox://experiences/start?placeId=81671593422999\``, inline: false }
      )
      .setImage('https://cdn.discordapp.com/attachments/1393788513811693689/1393788513811693689/banner.png')
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({
        text: 'MSRC Monroe County • Click Join Game below to play',
        iconURL: interaction.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    const joinButton = new ButtonBuilder()
      .setLabel('🚀 Join Monroe County Now')
      .setStyle(ButtonStyle.Link)
      .setURL(GAME_URL)
      .setEmoji('🎮');

    const row = new ActionRowBuilder().addComponents(joinButton);

    // Send public announcement in channel
    await interaction.reply({
      content: pingContent !== '' ? pingContent : undefined,
      embeds: [startupEmbed],
      components: [row]
    });

    // Also dispatch to webhook if configured
    const webhookUrl = config.robloxWebhookUrl || DEFAULT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [
              {
                title: '🟢 Game Server Startup Announced',
                description: `A server startup announcement was posted by **${interaction.user.tag}** in <#${interaction.channelId}>.`,
                color: 3066993, // Green
                fields: [
                  { name: 'Host', value: `<@${interaction.user.id}>`, inline: true },
                  { name: 'Notes', value: notes, inline: true },
                  { name: 'Game Link', value: `[Play MSRC](<${GAME_URL}>)`, inline: false }
                ],
                footer: { text: 'MSRC Monroe County System' },
                timestamp: new Date().toISOString()
              }
            ]
          })
        });
      } catch (e) {}
    }
  }
};
