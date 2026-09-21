const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages at once')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt =>
      opt
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('user').setDescription('Filter messages only from this user').setRequired(false)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      let filtered = messages;

      if (targetUser) {
        filtered = messages.filter(m => m.author.id === targetUser.id);
      }

      const deleted = await interaction.channel.bulkDelete(filtered, true);

      const embed = new EmbedBuilder()
        .setTitle('🧹 Messages Purged')
        .setDescription(
          `Successfully deleted **${deleted.size}** message(s)${
            targetUser ? ` from <@${targetUser.id}>` : ''
          }.`
        )
        .setColor(0x57F287)
        .setFooter({ text: 'Note: Messages older than 14 days cannot be bulk-deleted by Discord.' });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Purge error:', err);
      return interaction.editReply({ content: `❌ Error purging messages: ${err.message}` });
    }
  }
};
