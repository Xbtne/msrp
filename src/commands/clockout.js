const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/ticketHandler');
const { endShift, formatDuration, sendShiftAuditLog, updateLivePanels } = require('../utils/shiftHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clockout')
    .setDescription('Clock out of your staff shift and record your activity duration')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addStringOption(option =>
      option
        .setName('notes')
        .setDescription('Optional summary or notes about what you completed during this shift')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (e) {}

    // Permission check: Staff only
    if (!isStaff(interaction.member)) {
      return interaction.editReply({
        content: '❌ Only staff members with authorized staff roles or permissions can clock out.'
      });
    }

    const notes = interaction.options.getString('notes') || '';
    const result = endShift(interaction.guild.id, interaction.user, notes);

    if (!result.success && result.reason === 'NOT_CLOCKED_IN') {
      return interaction.editReply({
        content: '⚠️ You are not currently clocked in!\n*Use `/clockin` when you start your shift.*'
      });
    }

    const shift = result.completedShift;
    const startUnix = Math.floor(shift.startTime / 1000);
    const endUnix = Math.floor(shift.endTime / 1000);
    const durationStr = formatDuration(result.durationMs);
    const totalTimeStr = formatDuration(result.totalMs);

    const clockOutEmbed = new EmbedBuilder()
      .setTitle('🔴 Staff Member Clocked Out')
      .setColor(0xED4245) // Discord Red
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: '👤 Staff Member',
          value: `<@${interaction.user.id}> (\`${interaction.user.tag}\`)`,
          inline: true
        },
        {
          name: '⏱️ Shift Duration',
          value: `**${durationStr}**`,
          inline: true
        },
        {
          name: '⏰ Shift Timeline',
          value: `• **Started:** <t:${startUnix}:t> (<t:${startUnix}:R>)\n• **Ended:** <t:${endUnix}:t> (<t:${endUnix}:R>)`,
          inline: false
        },
        {
          name: '📝 Shift Summary / Notes',
          value: shift.endNotes || 'Shift completed successfully',
          inline: false
        },
        {
          name: '📊 Updated Activity Record',
          value: `**${result.totalShifts}** total shift(s) logged • **${totalTimeStr}** total on duty`,
          inline: false
        }
      )
      .setFooter({
        text: `Monroe County Staff Shift • Shift ID: ${shift.shiftId}`,
        iconURL: interaction.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [clockOutEmbed] });

    // Update live Clocky Duty panels in real time
    await updateLivePanels(interaction.client, interaction.guild.id);

    // Send audit log to staff log channel
    await sendShiftAuditLog(interaction.guild, interaction.client, clockOutEmbed);
  }
};
