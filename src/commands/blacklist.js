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
    .setDescription('Blacklist a user from opening support tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Blacklist a user from creating tickets')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The user to blacklist').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('user_id').setDescription('Discord User ID (if user not in server)').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('reason').setDescription('Reason for the blacklist').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a user from the ticket blacklist')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The user to unblacklist').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('user_id').setDescription('Discord User ID').setRequired(false)
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
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        content: '❌ You do not have permission to manage the ticket blacklist.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const blacklist = getBlacklist();
    if (!blacklist[guildId]) blacklist[guildId] = {};

    if (subcommand === 'add') {
      let targetUser = interaction.options.getUser('user');
      const targetUserIdInput = interaction.options.getString('user_id');

      if (!targetUser && targetUserIdInput) {
        const cleanId = targetUserIdInput.replace(/[<@!>]/g, '').trim();
        targetUser = await interaction.client.users.fetch(cleanId).catch(() => null);
      }

      if (!targetUser) {
        return interaction.reply({
          content: '❌ Please specify a valid user (either select a user or provide a valid User ID).',
          ephemeral: true
        });
      }

      if (targetUser.id === interaction.guild.ownerId) {
        return interaction.reply({ content: '❌ You cannot blacklist the server owner.', ephemeral: true });
      }

      if (targetUser.id === interaction.user.id) {
        return interaction.reply({ content: '❌ You cannot blacklist yourself.', ephemeral: true });
      }

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (targetMember && isStaff(targetMember)) {
        return interaction.reply({ content: '❌ You cannot blacklist a staff member.', ephemeral: true });
      }

      const reason = interaction.options.getString('reason');

      if (blacklist[guildId][targetUser.id]) {
        return interaction.reply({
          content: `⚠️ <@${targetUser.id}> is already blacklisted from tickets.\n**Reason:** ${blacklist[guildId][targetUser.id].reason}`,
          ephemeral: true
        });
      }

      blacklist[guildId][targetUser.id] = {
        userId: targetUser.id,
        tag: targetUser.tag,
        reason: reason,
        moderator: interaction.user.tag,
        moderatorId: interaction.user.id,
        timestamp: new Date().toISOString()
      };

      saveBlacklist(blacklist);

      // DM the user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`🚫 Ticket Blacklist Notice: ${interaction.guild.name}`)
          .setDescription(
            `You have been **blacklisted from creating tickets** in **${interaction.guild.name}**.\n\n` +
            `• **Reason:** ${reason}\n` +
            `• **Moderator:** ${interaction.user.tag}`
          )
          .setColor(0xED4245)
          .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] });
      } catch (dmErr) {}

      // Log to staff log channel
      const config = getConfig();
      if (config.logChannelId) {
        const logChannel =
          interaction.guild.channels.cache.get(config.logChannelId) ||
          (await interaction.guild.channels.fetch(config.logChannelId).catch(() => null));

        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🚫 User Blacklisted from Tickets')
            .setColor(0xED4245)
            .addFields(
              { name: 'Target User', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
              { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Reason', value: reason, inline: false }
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🚫 User Blacklisted from Tickets')
        .setDescription(`**<@${targetUser.id}>** has been blacklisted from opening support tickets.`)
        .addFields(
          { name: 'User', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setColor(0xED4245)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'remove') {
      let targetUser = interaction.options.getUser('user');
      const targetUserIdInput = interaction.options.getString('user_id');

      let targetId = targetUser?.id;
      if (!targetId && targetUserIdInput) {
        targetId = targetUserIdInput.replace(/[<@!>]/g, '').trim();
      }

      if (!targetId) {
        return interaction.reply({
          content: '❌ Please specify a valid user or User ID to unblacklist.',
          ephemeral: true
        });
      }

      if (!blacklist[guildId][targetId]) {
        return interaction.reply({
          content: `⚠️ User <@${targetId}> is not currently blacklisted.`,
          ephemeral: true
        });
      }

      const prevData = blacklist[guildId][targetId];
      delete blacklist[guildId][targetId];
      saveBlacklist(blacklist);

      // Try to DM user
      try {
        const fetchedUser = targetUser || (await interaction.client.users.fetch(targetId).catch(() => null));
        if (fetchedUser) {
          const dmEmbed = new EmbedBuilder()
            .setTitle(`✅ Ticket Blacklist Removed: ${interaction.guild.name}`)
            .setDescription(`Your ticket blacklist in **${interaction.guild.name}** has been removed. You may now create tickets again.`)
            .setColor(0x57F287)
            .setTimestamp();
          await fetchedUser.send({ embeds: [dmEmbed] });
        }
      } catch (dmErr) {}

      const embed = new EmbedBuilder()
        .setTitle('🔓 User Unblacklisted')
        .setDescription(`**<@${targetId}>** has been removed from the ticket blacklist.`)
        .setColor(0x57F287)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'list') {
      const entries = Object.values(blacklist[guildId]);

      if (entries.length === 0) {
        return interaction.reply({
          content: '✅ There are currently no blacklisted users in this server.',
          ephemeral: true
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
                `• **By:** <@${entry.moderatorId}> • <t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:R>`
            )
            .join('\n\n')
        )
        .setColor(0xED4245)
        .setFooter({ text: 'Monroe County Blacklist System' })
        .setTimestamp();

      return interaction.reply({ embeds: [listEmbed] });
    }
  },

  getBlacklist,
  saveBlacklist,
  isUserBlacklisted
};
