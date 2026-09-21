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
  parseTicketTopic
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
    const metadata = parseTicketTopic(channel.topic);

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
      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content: '❌ Only staff members can add users to tickets.',
          ephemeral: true
        });
      }

      const targetUser = interaction.options.getUser('user');
      await channel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true
      });

      return interaction.reply({
        content: `✅ Added <@${targetUser.id}> to the ticket!`,
        ephemeral: false
      });
    } else if (subcommand === 'remove') {
      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content: '❌ Only staff members can remove users from tickets.',
          ephemeral: true
        });
      }

      const targetUser = interaction.options.getUser('user');

      if (targetUser.id === metadata.ownerId) {
        return interaction.reply({
          content: '❌ You cannot remove the ticket owner from their own ticket.',
          ephemeral: true
        });
      }

      await channel.permissionOverwrites.delete(targetUser.id);

      return interaction.reply({
        content: `✅ Removed <@${targetUser.id}> from the ticket.`,
        ephemeral: false
      });
    }
  }
};
