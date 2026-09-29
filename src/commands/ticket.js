const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const {
  isStaff,
  handleTicketClaim,
  handleTicketUnclaim,
  handleTicketCloseRequest,
  handleTicketTranscript,
  getTicketMetadata
} = require('../utils/ticketHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage support tickets')
    .addSubcommand(sub =>
      sub.setName('claim').setDescription('Claim the current ticket as staff')
    )
    .addSubcommand(sub =>
      sub.setName('unclaim').setDescription('Unclaim the current ticket')
    )
    .addSubcommand(sub =>
      sub.setName('close').setDescription('Request to close the current ticket')
    )
    .addSubcommand(sub =>
      sub.setName('transcript').setDescription('Generate an HTML chat transcript for this ticket')
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a user to this ticket')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The user to add').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a user from this ticket')
        .addUserOption(opt =>
          opt.setName('user').setDescription('The user to remove').setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.channel;
    const metadata = await getTicketMetadata(channel);

    if (!metadata) {
      return interaction.reply({
        content: '❌ This command can only be used inside a ticket channel.',
        ephemeral: true
      });
    }

    if (subcommand === 'claim') {
      return handleTicketClaim(interaction);
    } else if (subcommand === 'unclaim') {
      return handleTicketUnclaim(interaction);
    } else if (subcommand === 'close') {
      return handleTicketCloseRequest(interaction);
    } else if (subcommand === 'transcript') {
      return handleTicketTranscript(interaction);
    } else if (subcommand === 'add') {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: false });
        }
      } catch (e) {}

      if (!isStaff(interaction.member)) {
        return interaction.editReply({
          content: '❌ Only staff members can add users to tickets.'
        });
      }

      const targetUser = interaction.options.getUser('user');
      if (!targetUser) {
        return interaction.editReply({
          content: '❌ Please specify a valid user to add.'
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
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to add user to ticket: ${err.message}`
        });
      }
    } else if (subcommand === 'remove') {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: false });
        }
      } catch (e) {}

      if (!isStaff(interaction.member)) {
        return interaction.editReply({
          content: '❌ Only staff members can remove users from tickets.'
        });
      }

      const targetUser = interaction.options.getUser('user');
      if (!targetUser) {
        return interaction.editReply({
          content: '❌ Please specify a valid user to remove.'
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
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to remove user from ticket: ${err.message}`
        });
      }
    }
  }
};
