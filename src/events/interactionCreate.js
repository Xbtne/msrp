const {
  handleTicketCreate,
  handleTicketClaim,
  handleTicketUnclaim,
  handleTicketCloseRequest,
  handleTicketCancelClose,
  handleTicketConfirmClose,
  handleTicketTranscript
} = require('../utils/ticketHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        const replyPayload = {
          content: '❌ There was an error while executing this command!',
          ephemeral: true
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload);
        } else {
          await interaction.reply(replyPayload);
        }
      }
      return;
    }

    // 2. Handle Button Interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Handle 3 ticket creation buttons
      if (customId.startsWith('create_ticket_')) {
        const typeId = customId.replace('create_ticket_', '');
        return handleTicketCreate(interaction, typeId);
      }

      // Handle Ticket Controls
      switch (customId) {
        case 'ticket_claim':
          return handleTicketClaim(interaction);

        case 'ticket_unclaim':
          return handleTicketUnclaim(interaction);

        case 'ticket_close_request':
          return handleTicketCloseRequest(interaction);

        case 'ticket_confirm_close':
          return handleTicketConfirmClose(interaction);

        case 'ticket_cancel_close':
          return handleTicketCancelClose(interaction);

        case 'ticket_transcript':
          return handleTicketTranscript(interaction);

        default:
          break;
      }
    }
  }
};
