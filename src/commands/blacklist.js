const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isStaff, getConfig } = require('../utils/ticketHandler');

const blacklistPath = path.join(__dirname, '../../data/blacklist.json');

function getBlacklist() {
  try {
    if (!fs.existsSync(blacklistPath)) {
      fs.writeFileSync(blacklistPath, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
  } catch (err) {
    console.error('Error reading blacklist.json:', err);
    return {};
  }
}

function saveBlacklist(data) {
  try {
    fs.writeFileSync(blacklistPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving blacklist.json:', err);
  }
}

function isUserBlacklisted(guildId, userId) {
  const blacklist = getBlacklist();
  return blacklist[guildId]?.[userId] || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Submit a blacklist record or view blacklisted users')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Submit a blacklist record with reason & screenshot proof')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The user to blacklist').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for the blacklist').setRequired(true)
        )
        .addAttachmentOption(opt =>
          opt.setName('proof').setDescription('Attach screenshot / image proof').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('proof_url').setDescription('Link to screenshot / image proof').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a user from the blacklist')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The user to unblacklist').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for removal').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('View all blacklisted users in this server')
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (deferErr) {}

    if (!isStaff(interaction.member)) {
      return interaction.editReply({
        content: '❌ You do not have permission to manage blacklist records.'
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const blacklist = getBlacklist();
    if (!blacklist[guildId]) blacklist[guildId] = {};

    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');

      if (!targetUser) {
        return interaction.editReply({
          content: '❌ Please specify a valid user.'
        });
      }

      const reason = interaction.options.getString('reason');
      const proofAttachment = interaction.options.getAttachment('proof');
      const proofUrlInput = interaction.options.getString('proof_url');
      const proofUrl = proofAttachment?.url || proofUrlInput || null;

      blacklist[guildId][targetUser.id] = {
        userId: targetUser.id,
        tag: targetUser.tag,
        reason: reason,
        proof: proofUrl,
        moderator: interaction.user.tag,
        moderatorId: interaction.user.id,
        timestamp: new Date().toISOString()
      };

      saveBlacklist(blacklist);

      // DM the user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`🚫 Blacklist Record Logged: ${interaction.guild.name}`)
          .setDescription(
            `A **blacklist record** has been submitted for your profile in **${interaction.guild.name}**.\n\n` +
            `• **Reason:** ${reason}\n` +
            `• **Moderator:** ${interaction.user.tag}`
          )
          .setColor(0xED4245)
          .setTimestamp();
        if (proofUrl) dmEmbed.setImage(proofUrl);
        await targetUser.send({ embeds: [dmEmbed] });
      } catch (dmErr) {}

      // Log to staff log channel
      const config = getConfig();
      if (config.logChannelId) {
        try {
          const logChannel =
            interaction.guild.channels.cache.get(config.logChannelId) ||
            (await interaction.guild.channels.fetch(config.logChannelId).catch(() => null));

          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle('🚫 Blacklist Entry Submitted')
              .setColor(0xED4245)
              .addFields(
                { name: 'Target User', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Reason', value: reason, inline: false }
              )
              .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
              .setTimestamp();

            if (proofUrl) {
              logEmbed.setImage(proofUrl);
              logEmbed.addFields({ name: '📸 Screenshot Proof', value: `[Click to View Proof](${proofUrl})`, inline: false });
            }

            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }
        } catch (logErr) {}
      }

      const embed = new EmbedBuilder()
        .setTitle('🚫 Blacklist Record Submitted')
        .setDescription(`Blacklist record for **<@${targetUser.id}>** has been submitted and logged.`)
        .addFields(
          { name: 'Target User', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setColor(0xED4245)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      if (proofUrl) {
        embed.setImage(proofUrl);
        embed.addFields({ name: '📸 Screenshot Proof', value: `[Click to View Attached Screenshot](${proofUrl})`, inline: false });
      }

      return interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'remove') {
      const targetUser = interaction.options.getUser('user');

      if (!targetUser) {
        return interaction.editReply({
          content: '❌ Please specify a valid user to unblacklist.'
        });
      }

      const targetId = targetUser.id;

      if (!blacklist[guildId][targetId]) {
        return interaction.editReply({
          content: `⚠️ User <@${targetId}> does not have an active blacklist record.`
        });
      }

      delete blacklist[guildId][targetId];
      saveBlacklist(blacklist);

      // Try to DM user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`✅ Blacklist Record Removed: ${interaction.guild.name}`)
          .setDescription(`Your blacklist record in **${interaction.guild.name}** has been removed.`)
          .setColor(0x57F287)
          .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] });
      } catch (dmErr) {}

      const embed = new EmbedBuilder()
        .setTitle('🔓 User Unblacklisted')
        .setDescription(`**<@${targetId}>** has been removed from the blacklist records.`)
        .setColor(0x57F287)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'list') {
      const entries = Object.values(blacklist[guildId]);

      if (entries.length === 0) {
        return interaction.editReply({
          content: '✅ There are currently no blacklisted users recorded in this server.'
        });
      }

      const listEmbed = new EmbedBuilder()
        .setTitle(`📋 Blacklisted Users (${entries.length})`)
        .setDescription(
          entries
            .map(
              (entry, idx) =>
                `**${idx + 1}.** <@${entry.userId}> (\`${entry.userId}\`)\n` +
                `• **Reason:** ${entry.reason}\n` +
                (entry.proof ? `• **Proof:** [View Screenshot Proof](${entry.proof})\n` : '') +
                `• **By:** <@${entry.moderatorId}> • <t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:R>`
            )
            .join('\n\n')
        )
        .setColor(0xED4245)
        .setFooter({ text: 'Monroe County Blacklist System' })
        .setTimestamp();

      return interaction.editReply({ embeds: [listEmbed] });
    }
  },

  getBlacklist,
  saveBlacklist,
  isUserBlacklisted
};
