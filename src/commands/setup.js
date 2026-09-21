const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');
const { getConfig, isStaff } = require('../utils/ticketHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-panel')
    .setDescription('Deploy the 3-button ticket panel in a channel')
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

    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const config = getConfig();

    const embed = new EmbedBuilder()
      .setTitle(config.panel?.title || '📬 Support & Assistance Desk')
      .setDescription(
        config.panel?.description ||
        'Need assistance? Click one of the buttons below to open a ticket with our team!'
      )
      .setColor(config.panel?.color || '#5865F2')
      .setFooter({
        text: config.panel?.footer || 'Support System • Click a button below',
        iconURL: interaction.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    if (interaction.guild.iconURL()) {
      embed.setThumbnail(interaction.guild.iconURL({ dynamic: true }));
    }

    const row = new ActionRowBuilder();

    // Map style string to ButtonStyle enum
    const styleMap = {
      Primary: ButtonStyle.Primary,
      Secondary: ButtonStyle.Secondary,
      Success: ButtonStyle.Success,
      Danger: ButtonStyle.Danger
    };

    for (const ticketType of config.ticketTypes) {
      const button = new ButtonBuilder()
        .setCustomId(`create_ticket_${ticketType.id}`)
        .setLabel(ticketType.label)
        .setStyle(styleMap[ticketType.style] || ButtonStyle.Primary);

      if (ticketType.emoji) {
        button.setEmoji(ticketType.emoji);
      }

      row.addComponents(button);
    }

    try {
      await targetChannel.send({ embeds: [embed], components: [row] });
      return interaction.reply({
        content: `✅ Successfully sent the ticket panel to ${targetChannel}!`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error sending ticket panel:', error);
      return interaction.reply({
        content: `❌ Failed to send panel: ${error.message}`,
        ephemeral: true
      });
    }
  }
};
