const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff, parseTicketTopic } = require('../utils/ticketHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a user from the current ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user/member to remove from the ticket')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('user_id')
        .setDescription('The Discord User ID to remove (if not mentioning)')
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
        content: '❌ Only staff members can remove users from tickets.'
      });
    }

    let targetUser = interaction.options.getUser('user');
    const targetUserIdInput = interaction.options.getString('user_id');

    if (!targetUser && targetUserIdInput) {
      const cleanId = targetUserIdInput.replace(/[<@!>]/g, '').trim();
      targetUser = await interaction.client.users.fetch(cleanId).catch(() => null);
    }

    if (!targetUser) {
      return interaction.editReply({
        content: '❌ Please specify a valid user to remove (either select a user or provide a valid User ID).'
      });
    }

    if (targetUser.id === metadata.ownerId) {
      return interaction.editReply({
        content: '❌ You cannot remove the ticket creator from their own ticket.'
      });
    }

    try {
      await channel.permissionOverwrites.delete(targetUser.id);

      const removeEmbed = new EmbedBuilder()
        .setTitle('👤 User Removed from Ticket')
        .setDescription(`**<@${targetUser.id}>** (${targetUser.tag}) has been removed from this ticket by <@${interaction.user.id}>.`)
        .setColor(0xED4245)
        .setTimestamp();

      return interaction.editReply({
        embeds: [removeEmbed]
      });
    } catch (error) {
      console.error('Error removing user from ticket:', error);
      return interaction.editReply({
        content: `❌ Failed to remove user from ticket: ${error.message}`
      });
    }
  }
};
