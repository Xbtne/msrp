const {
  handleTicketCreate,
  handleTicketClaim,
  handleTicketUnclaim,
  handleTicketCloseRequest,
  handleTicketCancelClose,
  handleTicketConfirmClose,
  handleTicketTranscript
} = require('../utils/ticketHandler');
const { handleClockButton } = require('../utils/shiftHandler');
const {
  handleApplyButtonClick,
  handleApplicationDmInteraction,
  handleStaffReviewInteraction
} = require('../utils/applicationHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // 1. Handle Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
          await command.execute(interaction);
        } catch (error) {
          if (error.code === 40060 || error.code === 10062) return;
          console.error(`Error executing command ${interaction.commandName}:`, error);
          const replyPayload = {
            content: '❌ There was an error while executing this command!',
            ephemeral: true
          };
          try {
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(replyPayload);
            } else {
              await interaction.reply(replyPayload);
            }
          } catch (replyErr) {}
        }
        return;
      }

      // 2. Handle Button Interactions
      if (interaction.isButton()) {
        const customId = interaction.customId;

        // Handle ticket creation buttons
        if (customId.startsWith('create_ticket_')) {
          const typeId = customId.replace('create_ticket_', '');
          return await handleTicketCreate(interaction, typeId);
        }

        // Handle Clocky Duty staff controls
        if (customId.startsWith('clock_')) {
          return await handleClockButton(interaction);
        }

        // Handle Staff Application buttons
        if (customId === 'app_server_apply') {
          return await handleApplyButtonClick(interaction);
        }
        if (customId.startsWith('app_dm_')) {
          return await handleApplicationDmInteraction(interaction);
        }
        if (customId.startsWith('app_staff_')) {
          return await handleStaffReviewInteraction(interaction);
        }

        // Handle Ticket Controls
        switch (customId) {
          case 'ticket_claim':
            return await handleTicketClaim(interaction);

          case 'ticket_unclaim':
            return await handleTicketUnclaim(interaction);

          case 'ticket_close_request':
            return await handleTicketCloseRequest(interaction);

          case 'ticket_confirm_close':
            return await handleTicketConfirmClose(interaction);

          case 'ticket_cancel_close':
            return await handleTicketCancelClose(interaction);

          case 'ticket_transcript':
            return await handleTicketTranscript(interaction);

          default:
            break;
        }
      }

      // 3. Handle Modal Submissions
      if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        if (customId.startsWith('app_modal_')) {
          return await handleStaffReviewInteraction(interaction);
        }
      }
    } catch (err) {
      if (err.code === 40060 || err.code === 10062) return;
      console.error('Unhandled interaction error:', err);
    }
  }
};
