const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff, parseTicketTopic } = require('../utils/ticketHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a user to the current ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user/member to add to the ticket')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('user_id')
        .setDescription('The Discord User ID to add (if not mentioning)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (e) {}

    const channel = interaction.channel;
    const metadata = parseTicketTopic(channel.topic);

    if (!metadata) {
      return interaction.editReply({
        content: '❌ This command can only be used inside a ticket channel.'
      });
    }

    if (!isStaff(interaction.member)) {
      return interaction.editReply({
        content: '❌ Only staff members can add users to tickets.'
      });
    }

    let targetUser = interaction.options.getUser('user');
    const targetUserIdInput = interaction.options.getString('user_id');

    if (!targetUser && targetUserIdInput) {
      // Clean ID in case user pasted <@123456>
      const cleanId = targetUserIdInput.replace(/[<@!>]/g, '').trim();
      targetUser = await interaction.client.users.fetch(cleanId).catch(() => null);
    }

    if (!targetUser) {
      return interaction.editReply({
        content: '❌ Please specify a valid user to add (either select a user or provide a valid User ID).'
      });
    }

    try {
      await channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true
      });

      const addEmbed = new EmbedBuilder()
        .setTitle('👤 User Added to Ticket')
        .setDescription(`**<@${targetUser.id}>** (${targetUser.tag}) has been added to this ticket by <@${interaction.user.id}>.`)
        .setColor(0x57F287)
        .setTimestamp();

      return interaction.editReply({
        embeds: [addEmbed]
      });
    } catch (error) {
      console.error('Error adding user to ticket:', error);
      return interaction.editReply({
        content: `❌ Failed to add user to ticket: ${error.message}`
      });
    }
  }
};
