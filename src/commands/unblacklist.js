const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isStaff } = require('../utils/ticketHandler');
const { getBlacklist, saveBlacklist } = require('./blacklist');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unblacklist')
    .setDescription('Shortcut to unblacklist a user from creating tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to unblacklist').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('user_id').setDescription('Discord User ID (if user not in server)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        content: '❌ You do not have permission to manage the ticket blacklist.',
        ephemeral: true
      });
    }

    const guildId = interaction.guild.id;
    const blacklist = getBlacklist();
    if (!blacklist[guildId]) blacklist[guildId] = {};

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
  }
};
