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
    .setDescription('Deploy the interactive ticket panel in a channel')
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
    const config = getConfig();

    const embed = new EmbedBuilder()
      .setTitle(config.panel?.title || '📬 Monroe County Ticket System')
      .setDescription(
        config.panel?.description ||
        'Need assistance? Click one of the buttons below to open a ticket with our team!'
      )
      .setColor(config.panel?.color || '#5865F2')
      .setFooter({
        text: config.panel?.footer || 'Monroe County Support • Click a button below',
        iconURL: interaction.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    if (interaction.guild.iconURL()) {
      embed.setThumbnail(interaction.guild.iconURL({ dynamic: true }));
    }

    const styleMap = {
      Primary: ButtonStyle.Primary,
      Secondary: ButtonStyle.Secondary,
      Success: ButtonStyle.Success,
      Danger: ButtonStyle.Danger
    };

    const rows = [];
    let currentRow = new ActionRowBuilder();

    for (const ticketType of config.ticketTypes) {
      if (currentRow.components.length >= 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }

      const button = new ButtonBuilder()
        .setCustomId(`create_ticket_${ticketType.id}`)
        .setLabel(ticketType.label)
        .setStyle(styleMap[ticketType.style] || ButtonStyle.Primary);

      if (ticketType.emoji) {
        button.setEmoji(ticketType.emoji);
      }

      currentRow.addComponents(button);
    }

    if (currentRow.components.length > 0) {
      rows.push(currentRow);
    }

    try {
      await targetChannel.send({ embeds: [embed], components: rows });
      return interaction.editReply({
        content: `✅ Successfully sent the ticket panel to ${targetChannel}!`
      });
    } catch (error) {
      console.error('Error sending ticket panel:', error);
      return interaction.editReply({
        content: `❌ Failed to send panel: ${error.message}`
      });
    }
  }
};
