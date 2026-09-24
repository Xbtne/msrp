const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/ticketHandler');
const {
  getActiveShifts,
  getUserShiftStats,
  getShiftLeaderboard,
  resetShiftStats,
  formatDuration
} = require('../utils/shiftHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shifts')
    .setDescription('View staff shifts, active staff on duty, activity stats, and leaderboards')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand(sub =>
      sub
        .setName('active')
        .setDescription('List all staff members currently clocked in right now')
    )
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('View shift activity statistics for yourself or a specific staff member')
        .addUserOption(opt =>
          opt
            .setName('staff')
            .setDescription('The staff member to inspect (leave empty for yourself)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('leaderboard')
        .setDescription('View the staff activity leaderboard ranked by total clocked hours')
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Reset shift records (Requires Administrator permission)')
        .addUserOption(opt =>
          opt
            .setName('staff')
            .setDescription('Specific staff member to reset (leave empty to reset entire server)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (e) {}

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // Subcommand: ACTIVE STAFF
    if (subcommand === 'active') {
      const active = getActiveShifts(guildId);

      if (active.length === 0) {
        return interaction.editReply({
          content: 'ℹ️ No staff members are currently clocked in right now. Use `/clockin` to start a shift!'
        });
      }

      const activeList = active
        .map((s, index) => {
          const startUnix = Math.floor(s.startTime / 1000);
          const elapsedMs = Date.now() - s.startTime;
          return `**${index + 1}.** <@${s.userId}> (\`${s.userTag}\`)\n• **On Duty For:** \`${formatDuration(elapsedMs)}\`\n• **Started:** <t:${startUnix}:R>\n• **Notes:** ${s.notes}`;
        })
        .join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle(`🟢 Staff Members On Duty (${active.length})`)
        .setDescription(activeList)
        .setColor(0x57F287)
        .setFooter({
          text: `Monroe County Staff Activity • Total on duty: ${active.length}`,
          iconURL: interaction.guild.iconURL({ dynamic: true })
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // Subcommand: STATS
    if (subcommand === 'stats') {
      const targetUser = interaction.options.getUser('staff') || interaction.user;
      const stats = getUserShiftStats(guildId, targetUser.id);

      const totalTimeFormatted = formatDuration(stats.totalMs);
      const avgShiftFormatted = formatDuration(stats.avgShiftMs);

      let activeStatusText = '🔴 **Off Duty**';
      if (stats.activeShift) {
        const startUnix = Math.floor(stats.activeShift.startTime / 1000);
        const elapsed = formatDuration(Date.now() - stats.activeShift.startTime);
        activeStatusText = `🟢 **On Duty** (Clocked in <t:${startUnix}:R> • \`${elapsed}\`)`;
      }

      let historyText = '*No recent completed shifts.*';
      if (stats.recentHistory.length > 0) {
        historyText = stats.recentHistory
          .map((h, i) => {
            const endUnix = Math.floor(h.endTime / 1000);
            return `**${i + 1}.** <t:${endUnix}:d> — **${formatDuration(h.durationMs)}** (\`${h.endNotes || h.startNotes || 'Completed'}\`)`;
          })
          .join('\n');
      }

      const embed = new EmbedBuilder()
        .setTitle(`📊 Staff Activity: ${targetUser.displayName || targetUser.username}`)
        .setColor(0x5865F2)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          {
            name: '👤 Staff Member',
            value: `<@${targetUser.id}> (\`${targetUser.tag}\`)`,
            inline: true
          },
          {
            name: '📌 Current Status',
            value: activeStatusText,
            inline: true
          },
          {
            name: '⏱️ Total Time on Duty',
            value: `**${totalTimeFormatted}**`,
            inline: true
          },
          {
            name: '📋 Total Shifts Logged',
            value: `**${stats.totalShifts}** shift(s)`,
            inline: true
          },
          {
            name: '⚡ Average Shift Length',
            value: `**${avgShiftFormatted}**`,
            inline: true
          },
          {
            name: '📜 Recent Shift History (Last 5)',
            value: historyText,
            inline: false
          }
        )
        .setFooter({
          text: 'Monroe County Staff Activity Tracker',
          iconURL: interaction.guild.iconURL({ dynamic: true })
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // Subcommand: LEADERBOARD
    if (subcommand === 'leaderboard') {
      const leaderboard = getShiftLeaderboard(guildId);

      if (leaderboard.length === 0) {
        return interaction.editReply({
          content: 'ℹ️ No staff shift records have been logged yet. Staff can use `/clockin` and `/clockout` to start tracking!'
        });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const lines = leaderboard.slice(0, 15).map((entry, index) => {
        const medal = medals[index] || `**#${index + 1}**`;
        const timeFormatted = formatDuration(entry.totalMs);
        return `${medal} <@${entry.userId}> — **${timeFormatted}** across **${entry.totalShifts}** shift(s)`;
      });

      const embed = new EmbedBuilder()
        .setTitle('🏆 Staff Activity Leaderboard')
        .setDescription(lines.join('\n\n'))
        .setColor(0xFEE75C)
        .setFooter({
          text: `Monroe County Leaderboard • Top ${Math.min(15, leaderboard.length)} Staff Members`,
          iconURL: interaction.guild.iconURL({ dynamic: true })
        })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // Subcommand: RESET (Admin Only)
    if (subcommand === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.user.id !== interaction.guild.ownerId) {
        return interaction.editReply({
          content: '❌ Only server Administrators can reset staff shift activity records.'
        });
      }

      const targetStaff = interaction.options.getUser('staff');

      if (targetStaff) {
        resetShiftStats(guildId, targetStaff.id);
        return interaction.editReply({
          content: `✅ Successfully reset all shift activity records for <@${targetStaff.id}> (\`${targetStaff.tag}\`).`
        });
      } else {
        resetShiftStats(guildId, null);
        return interaction.editReply({
          content: `✅ Successfully reset all shift activity records and active shifts for the **entire server**.`
        });
      }
    }
  }
};
