const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const { isStaff } = require('../utils/ticketHandler');
const { deployTicketPanel } = require('./setup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-panel')
    .setDescription('Deploy the interactive ticket panel in a channel (alias)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where the ticket panel should be sent (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true
      });
    }

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
    } catch (e) {}

    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      return await deployTicketPanel(interaction, targetChannel);
    } catch (error) {
      console.error('Error sending ticket panel:', error);
      return interaction.editReply({
        content: `❌ Failed to send panel: ${error.message}`
      });
    }
  }
};
