const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode rate limit for the channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(opt =>
      opt
        .setName('seconds')
        .setDescription('Slowmode duration in seconds (0 to disable, max 21600 / 6 hours)')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (e) {}

    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.channel;

    try {
      await channel.setRateLimitPerUser(seconds);

      const embed = new EmbedBuilder()
        .setTitle('⏱️ Slowmode Updated')
        .setDescription(
          seconds === 0
            ? 'Slowmode has been disabled in this channel.'
            : `Slowmode is now set to **${seconds}** second(s) per user.`
        )
        .setColor(seconds === 0 ? 0x57F287 : 0x5865F2)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Slowmode error:', err);
      return interaction.editReply({ content: `❌ Failed to set slowmode: ${err.message}` });
    }
  }
};
