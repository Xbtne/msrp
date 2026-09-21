const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock or unlock a channel for @everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub
        .setName('channel')
        .setDescription('Lock the channel so members cannot send messages')
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for lockdown').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('unlock')
        .setDescription('Unlock the channel so members can chat again')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.channel;
    const everyoneRole = interaction.guild.roles.everyone;

    if (subcommand === 'channel') {
      const reason = interaction.options.getString('reason') || 'Channel locked by staff';

      try {
        await channel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: false,
          AddReactions: false
        });

        const lockEmbed = new EmbedBuilder()
          .setTitle('🔒 Channel Locked')
          .setDescription(`This channel has been locked.\n**Reason:** ${reason}\n**Moderator:** <@${interaction.user.id}>`)
          .setColor(0xED4245)
          .setTimestamp();

        return interaction.reply({ embeds: [lockEmbed] });
      } catch (err) {
        console.error('Lock error:', err);
        return interaction.reply({ content: `❌ Failed to lock channel: ${err.message}`, ephemeral: true });
      }
    } else if (subcommand === 'unlock') {
      try {
        await channel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: null,
          AddReactions: null
        });

        const unlockEmbed = new EmbedBuilder()
          .setTitle('🔓 Channel Unlocked')
          .setDescription(`This channel is now unlocked.\n**Moderator:** <@${interaction.user.id}>`)
          .setColor(0x57F287)
          .setTimestamp();

        return interaction.reply({ embeds: [unlockEmbed] });
      } catch (err) {
        console.error('Unlock error:', err);
        return interaction.reply({ content: `❌ Failed to unlock channel: ${err.message}`, ephemeral: true });
      }
    }
  }
};
