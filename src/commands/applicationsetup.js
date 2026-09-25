const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const {
  createApplicationPanelEmbed,
  createApplicationPanelRow,
  setApplicationReviewChannel
} = require('../utils/applicationHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('applicationsetup')
    .setDescription('Deploy the MSRC Staff Application panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('Channel where the application panel should be posted (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt
        .setName('review_channel')
        .setDescription('Channel where completed applications will be sent for staff review')
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
    const reviewChannel = interaction.options.getChannel('review_channel');

    if (!targetChannel) {
      return interaction.editReply({ content: '❌ Invalid channel selected.' });
    }

    if (reviewChannel) {
      setApplicationReviewChannel(interaction.guild.id, reviewChannel.id);
    }

    try {
      const embed = createApplicationPanelEmbed();
      const row = createApplicationPanelRow();

      await targetChannel.send({
        embeds: [embed],
        components: [row]
      });

      let responseMsg = `✅ Successfully deployed the **MSRC Staff Application** panel in ${targetChannel}!`;
      if (reviewChannel) {
        responseMsg += `\n📥 Completed applications will be sent to ${reviewChannel} for review.`;
      } else {
        responseMsg += `\n📥 Completed applications will be sent to your configured staff log channel.`;
      }

      return interaction.editReply({
        content: responseMsg
      });
    } catch (err) {
      console.error('Error deploying application panel:', err);
      return interaction.editReply({
        content: `❌ Failed to deploy application panel: ${err.message}`
      });
    }
  }
};
