const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isStaff } = require('../utils/ticketHandler');
const { getBlacklist, saveBlacklist } = require('./blacklist');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unblacklist')
    .setDescription('Shortcut to unblacklist a user from records')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to unblacklist').setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (e) {}

    if (!isStaff(interaction.member)) {
      return interaction.editReply({
        content: '❌ You do not have permission to manage the ticket blacklist.'
      });
    }

    const guildId = interaction.guild.id;
    const blacklist = getBlacklist();
    if (!blacklist[guildId]) blacklist[guildId] = {};

    const targetUser = interaction.options.getUser('user');

    if (!targetUser) {
      return interaction.editReply({
        content: '❌ Please specify a valid user.'
      });
    }

    const targetId = targetUser.id;

    if (!blacklist[guildId][targetId]) {
      return interaction.editReply({
        content: `⚠️ User <@${targetId}> is not currently blacklisted.`
      });
    }

    delete blacklist[guildId][targetId];
    saveBlacklist(blacklist);

    // Try to DM user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`✅ Blacklist Removed: ${interaction.guild.name}`)
        .setDescription(`Your blacklist record in **${interaction.guild.name}** has been removed.`)
        .setColor(0x57F287)
        .setTimestamp();
      await targetUser.send({ embeds: [dmEmbed] });
    } catch (dmErr) {}

    const embed = new EmbedBuilder()
      .setTitle('🔓 User Unblacklisted')
      .setDescription(`**<@${targetId}>** has been removed from the blacklist.`)
      .setColor(0x57F287)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};
