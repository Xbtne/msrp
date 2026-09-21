const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isStaff } = require('../utils/ticketHandler');

const securityDataPath = path.join(__dirname, '../../data/security.json');

function getSecurityData() {
  try {
    if (!fs.existsSync(securityDataPath)) {
      fs.writeFileSync(securityDataPath, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(securityDataPath, 'utf8'));
  } catch (err) {
    console.error('Error reading security.json:', err);
    return {};
  }
}

function saveSecurityData(data) {
  try {
    fs.writeFileSync(securityDataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving security.json:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupcomp')
    .setDescription('Deploy an anti-compromised account honeypot trap channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt
        .setName('action')
        .setDescription('Action to take when a compromised account speaks')
        .setRequired(false)
        .addChoices(
          { name: 'Timeout for 28 Days (Recommended)', value: 'timeout' },
          { name: 'Ban Account Permanently', value: 'ban' },
          { name: 'Kick Account', value: 'kick' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('channel_name')
        .setDescription('Custom name for the honeypot channel (default: do-not-type-here)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        content: '❌ You do not have permission to configure security commands.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const action = interaction.options.getString('action') || 'timeout';
    const channelNameRaw = interaction.options.getString('channel_name') || 'do-not-type-here';
    const channelName = `⛔-${channelNameRaw}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');

    try {
      // Create Honeypot Channel with @everyone allowed to send messages (to trap automated bots)
      const honeypotChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: '🚨 SECURITY HONEYPOT: DO NOT TYPE HERE. Automatic quarantine enabled.',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ],
            deny: [
              PermissionFlagsBits.AddReactions,
              PermissionFlagsBits.CreatePublicThreads,
              PermissionFlagsBits.CreatePrivateThreads
            ]
          },
          {
            id: interaction.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ]
      });

      // Cool embedded warning message
      const warningEmbed = new EmbedBuilder()
        .setTitle('🛡️ Monroe County Security • Compromised Account Trap')
        .setDescription(
          `### ⛔ **DO NOT SEND ANY MESSAGES IN THIS CHANNEL!**\n\n` +
          `> This channel is an active **Security Honeypot** designed to protect the server by automatically detecting and neutralizing **compromised Discord accounts**, **spam bots**, and **phishing self-bots**.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `### 🤖 **How This Protection Works:**\n` +
          `• When Discord accounts get hacked (token-grabbed or phishing), malicious scripts automatically blast scam links across every channel visible in every server.\n` +
          `• **Human members** can easily read this warning and ignore this channel.\n` +
          `• **Automated bots & compromised accounts** will blindly post here.\n\n` +
          `### ⚡ **Automated Penalty:**\n` +
          `If anyone types any message in this channel, the bot will **INSTANTLY**:\n` +
          `1. 🗑️ **Purge and delete** the message immediately.\n` +
          `2. 🔨 **${action === 'ban' ? 'Ban the account permanently' : action === 'kick' ? 'Kick the account from the server' : 'Place the account on maximum 28-day Timeout / Quarantine'}**.\n` +
          `3. 📢 **Alert Server Staff** in the private logs.\n` +
          `4. 📬 **Send a DM notification** to the user alerting them that their account may be compromised.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ *Legitimate members: please mute/collapse this channel and do not type here!*`
        )
        .setColor(0xED4245)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({
          text: 'Monroe County Automated Threat Defense System',
          iconURL: interaction.client.user.displayAvatarURL({ dynamic: true })
        })
        .setTimestamp();

      const pinnedMsg = await honeypotChannel.send({ embeds: [warningEmbed] });
      await pinnedMsg.pin().catch(() => {});

      // Save to security.json
      const securityData = getSecurityData();
      securityData[guild.id] = {
        honeypotChannelId: honeypotChannel.id,
        action: action,
        enabled: true,
        setupBy: interaction.user.tag,
        setupAt: new Date().toISOString()
      };
      saveSecurityData(securityData);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Compromised Account Trap Deployed!')
        .setDescription(
          `The security honeypot has been created successfully:\n\n` +
          `• **Channel:** ${honeypotChannel} (\`${honeypotChannel.id}\`)\n` +
          `• **Trigger Action:** \`${action.toUpperCase()}\`\n` +
          `• **Status:** 🟢 **Active & Armed**\n\n` +
          `Any compromised account or spam bot that sends a message in that channel will be immediately quarantined!`
        )
        .setColor(0x57F287)
        .setTimestamp();

      return interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('Error deploying honeypot:', error);
      return interaction.editReply({
        content: `❌ Failed to setup compromised account trap: ${error.message}`
      });
    }
  },

  getSecurityData,
  saveSecurityData
};
