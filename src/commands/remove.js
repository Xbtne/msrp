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
    const channel = interaction.channel;
    const metadata = parseTicketTopic(channel.topic);

    if (!metadata) {
      return interaction.reply({
        content: '❌ This command can only be used inside a ticket channel.',
        ephemeral: true
      });
    }

    if (!isStaff(interaction.member)) {
      return interaction.reply({
        content: '❌ Only staff members can remove users from tickets.',
        ephemeral: true
      });
    }

    let targetUser = interaction.options.getUser('user');
    const targetUserIdInput = interaction.options.getString('user_id');

    if (!targetUser && targetUserIdInput) {
      const cleanId = targetUserIdInput.replace(/[<@!>]/g, '').trim();
      targetUser = await interaction.client.users.fetch(cleanId).catch(() => null);
    }

    if (!targetUser) {
      return interaction.reply({
        content: '❌ Please specify a valid user to remove (either select a user or provide a valid User ID).',
        ephemeral: true
      });
    }

    if (targetUser.id === metadata.ownerId) {
      return interaction.reply({
        content: '❌ You cannot remove the ticket creator from their own ticket.',
        ephemeral: true
      });
    }

    try {
      await channel.permissionOverwrites.delete(targetUser.id);

      const removeEmbed = new EmbedBuilder()
        .setTitle('👤 User Removed from Ticket')
        .setDescription(`**<@${targetUser.id}>** (${targetUser.tag}) has been removed from this ticket by <@${interaction.user.id}>.`)
        .setColor(0xED4245)
        .setTimestamp();

      return interaction.reply({
        embeds: [removeEmbed]
      });
    } catch (error) {
      console.error('Error removing user from ticket:', error);
      return interaction.reply({
        content: `❌ Failed to remove user from ticket: ${error.message}`,
        ephemeral: true
      });
    }
  }
};
