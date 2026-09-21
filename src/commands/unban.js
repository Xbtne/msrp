const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server by their ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option.setName('user_id').setDescription('The Discord User ID to unban').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the unban').setRequired(false)
    ),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        return interaction.reply({ content: '❌ That user is not banned in this server.', ephemeral: true });
      }

      await interaction.guild.bans.remove(userId, `${reason} | Unbanned by ${interaction.user.tag}`);

      const unbanEmbed = new EmbedBuilder()
        .setTitle('🔓 User Unbanned')
        .setColor(0x57F287)
        .addFields(
          { name: 'User', value: `<@${userId}> (${ban.user.tag})`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [unbanEmbed] });
    } catch (err) {
      console.error('Unban error:', err);
      return interaction.reply({ content: `❌ Failed to unban user: ${err.message}`, ephemeral: true });
    }
  }
};
