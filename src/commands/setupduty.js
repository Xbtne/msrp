const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createClockyEmbed, createClockyButtonRow, registerPanelMessage } = require('../utils/shiftHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-duty')
    .setDescription('Deploy the live interactive Clocky Duty staff panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('Channel to send the Clocky Duty panel in (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
    } catch (e) {}

    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    if (!targetChannel) {
      return interaction.editReply({ content: '❌ Invalid channel selected.' });
    }

    try {
      const embed = createClockyEmbed(interaction.guild.id, interaction.guild);
      const row = createClockyButtonRow();

      const panelMsg = await targetChannel.send({
        embeds: [embed],
        components: [row]
      });

      registerPanelMessage(interaction.guild.id, targetChannel.id, panelMsg.id);

      return interaction.editReply({
        content: `✅ Successfully deployed the **Clocky Duty** panel in ${targetChannel}!\nStaff can now click **Check in**, **Break / resume**, **Check out**, and view **My status** directly from the panel.`
      });
    } catch (err) {
      console.error('Error deploying Clocky Duty panel:', err);
      return interaction.editReply({
        content: `❌ Failed to deploy panel: ${err.message}`
      });
    }
  }
};
