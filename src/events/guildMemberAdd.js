const { Events } = require('discord.js');
const { handleMemberJoin } = require('../utils/welcomerHandler');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      await handleMemberJoin(member);
    } catch (err) {
      console.error('Error in guildMemberAdd event handler:', err);
    }
  }
};
