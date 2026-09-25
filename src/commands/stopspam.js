const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const {
  getActiveTask,
  cancelActiveTask
} = require('../utils/dmTestManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stopspam')
    .setDescription('Immediately cancel an active DM test session for a specified user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user whose DM test task should be cancelled')
        .setRequired(true)
    ),

  async execute(interaction) {
    // 1. Permission check: Administrator or Guild Owner only
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.user.id === interaction.guild?.ownerId;

    if (!isAdmin) {
      return interaction.reply({
        content: '❌ **Access Denied:** Only administrators and server owners can cancel DM test tasks.',
        ephemeral: true
      });
    }

    const targetUser = interaction.options.getUser('user');

    // 2. Check if an active task exists for the user
    const activeTask = getActiveTask(targetUser.id);

    if (!activeTask) {
      const noTaskEmbed = new EmbedBuilder()
        .setTitle('ℹ️ No Active DM Test Task')
        .setDescription(`There is no active DM test task currently running for <@${targetUser.id}>.`)
        .setColor(0x5865F2)
        .setTimestamp();

      return interaction.reply({
        embeds: [noTaskEmbed],
        ephemeral: true
      });
    }

    // 3. Immediately cancel and clean up the active task
    const stoppedTask = cancelActiveTask(
      targetUser.id,
      `Manually stopped via /stopspam by <@${interaction.user.id}>`
    );

    const sentDisplay = stoppedTask
      ? (stoppedTask.isInfinite
          ? `\`${stoppedTask.sent}\` (Infinite mode)`
          : `\`${stoppedTask.sent}/${stoppedTask.count}\``)
      : '`0`';

    const stopEmbed = new EmbedBuilder()
      .setTitle('⏹️ DM Test Task Stopped')
      .setDescription(
        `Successfully stopped and cleaned up the active DM test task for <@${targetUser.id}>.\n\n` +
        `• **Target User:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
        `• **Messages Sent:** ${sentDisplay}\n` +
        `• **Stopped By:** <@${interaction.user.id}>\n` +
        `• **Status:** Cleaned up from active tasks dictionary`
      )
      .setColor(0xED4245)
      .setFooter({ text: 'Monroe County DM Testing Diagnostics' })
      .setTimestamp();

    return interaction.reply({
      embeds: [stopEmbed]
    });
  }
};
