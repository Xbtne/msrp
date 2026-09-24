const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/ticketHandler');
const { startShift, formatDuration, sendShiftAuditLog, updateLivePanels } = require('../utils/shiftHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clockin')
    .setDescription('Clock in for your staff shift to track your server activity')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addStringOption(option =>
      option
        .setName('notes')
        .setDescription('Optional notes about what you will be working on during this shift')
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
        content: '❌ Only staff members with authorized staff roles or permissions can clock in.'
      });
    }

    const notes = interaction.options.getString('notes') || '';
    const result = startShift(interaction.guild.id, interaction.user, notes);

    if (!result.success && result.reason === 'ALREADY_CLOCKED_IN') {
      const activeStartUnix = Math.floor(result.activeShift.startTime / 1000);
      return interaction.editReply({
        content: `⚠️ You are already clocked in!\n• **Started:** <t:${activeStartUnix}:f> (<t:${activeStartUnix}:R>)\n• **Shift Notes:** ${result.activeShift.notes}\n\n*Use \`/clockout\` when you have finished your shift.*`
      });
    }

    const startUnix = Math.floor(result.shift.startTime / 1000);
    const formattedTotalTime = formatDuration(result.totalTimeMs);

    const clockInEmbed = new EmbedBuilder()
      .setTitle('🟢 Staff Member Clocked In')
      .setColor(0x57F287) // Discord Green
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: '👤 Staff Member',
          value: `<@${interaction.user.id}> (\`${interaction.user.tag}\`)`,
          inline: true
        },
        {
          name: '⏰ Clock-In Time',
          value: `<t:${startUnix}:t> (<t:${startUnix}:R>)`,
          inline: true
        },
        {
          name: '📝 Shift Notes / Duties',
          value: result.shift.notes,
          inline: false
        },
        {
          name: '📈 Previous Activity Record',
          value: `**${result.totalShifts}** previous shift(s) logged • **${formattedTotalTime}** total on duty`,
          inline: false
        }
      )
      .setFooter({
        text: `Monroe County Staff Shift • Shift ID: ${result.shift.shiftId}`,
        iconURL: interaction.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [clockInEmbed] });

    // Update live Clocky Duty panels in real time
    await updateLivePanels(interaction.client, interaction.guild.id);

    // Send audit log to staff log channel
    await sendShiftAuditLog(interaction.guild, interaction.client, clockInEmbed);
  }
};
