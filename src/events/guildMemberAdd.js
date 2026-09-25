const { Events } = require('discord.js');
const { handleMemberJoin } = require('../utils/welcomerHandler');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      if (!member) return;

      if (member.partial) {
        try {
          member = await member.fetch();
        } catch (fetchErr) {
          console.warn('⚠️ [guildMemberAdd] Could not fetch partial member:', fetchErr.message);
        }
      }

      await handleMemberJoin(member);
    } catch (err) {
      console.error('❌ Error in guildMemberAdd event handler:', err);
    }
  }
};

