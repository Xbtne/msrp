const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getConfig, isStaff } = require('./ticketHandler');

const shiftsDataPath = path.join(__dirname, '../../data/shifts.json');

function getShiftsData() {
  try {
    if (!fs.existsSync(shiftsDataPath)) {
      fs.writeFileSync(shiftsDataPath, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(shiftsDataPath, 'utf8'));
  } catch (err) {
    console.error('Error reading shifts.json:', err);
    return {};
  }
}

function saveShiftsData(data) {
  try {
    fs.writeFileSync(shiftsDataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving shifts.json:', err);
  }
}

/**
 * Formats milliseconds into human-readable string (e.g., "2 hrs 15 mins" or "45 mins 10 secs")
 */
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 secs';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes === 1 ? '' : 's'}`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec${seconds === 1 ? '' : 's'}`);

  return parts.join(' ');
}

/**
 * Build the "Clocky Duty" Panel Embed matching the exact UI in the screenshot
 */
function createClockyEmbed(guildId, guild) {
  const data = getShiftsData();
  const guildData = data[guildId] || { active: {} };
  const activeShifts = Object.values(guildData.active || {});

  const working = activeShifts.filter(s => (s.status || 'WORKING') === 'WORKING');
  const onBreak = activeShifts.filter(s => s.status === 'BREAK');

  const nowUnix = Math.floor(Date.now() / 1000);

  // Build Working list
  let workingText = '*No staff currently active.*';
  if (working.length > 0) {
    workingText = working
      .map(s => {
        const startUnix = Math.floor(s.startTime / 1000);
        return `• **${s.userDisplayName || s.userTag}** — started <t:${startUnix}:R>`;
      })
      .join('\n');
  }

  // Build On Break list
  let onBreakText = '*No staff currently on break.*';
  if (onBreak.length > 0) {
    onBreakText = onBreak
      .map(s => {
        const breakStartUnix = Math.floor((s.currentBreakStart || Date.now()) / 1000);
        return `• **${s.userDisplayName || s.userTag}** — break started <t:${breakStartUnix}:R>`;
      })
      .join('\n');
  }

  const embed = new EmbedBuilder()
    .setTitle('🕛 Clocky Duty')
    .setColor(0xFEE75C) // Yellow/Gold border as in screenshot
    .setDescription(
      `**${working.length} working · ${onBreak.length} on break**\n` +
      `Data updated <t:${nowUnix}:R> · America/New_York\n\n` +
      `Use these controls for your own timer. Replies are private.\n\n` +
      `**Working — ${working.length}**\n${workingText}\n\n` +
      `**On Break — ${onBreak.length}**\n${onBreakText}\n\n` +
      `*Recorded activity only · no schedule or absence assumptions*`
    );

  return embed;
}

/**
 * Build the 4 Interactive Buttons Row matching the screenshot:
 * [👤 My status] [▶️ Check in] [☕ Break / resume] [⏹️ Check out]
 */
function createClockyButtonRow() {
  const myStatusBtn = new ButtonBuilder()
    .setCustomId('clock_status')
    .setLabel('My status')
    .setEmoji('👤')
    .setStyle(ButtonStyle.Primary);

  const checkInBtn = new ButtonBuilder()
    .setCustomId('clock_in')
    .setLabel('Check in')
    .setEmoji('▶️')
    .setStyle(ButtonStyle.Success);

  const breakBtn = new ButtonBuilder()
    .setCustomId('clock_break')
    .setLabel('Break / resume')
    .setEmoji('☕')
    .setStyle(ButtonStyle.Secondary);

  const checkOutBtn = new ButtonBuilder()
    .setCustomId('clock_out')
    .setLabel('Check out')
    .setEmoji('⏹️')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(myStatusBtn, checkInBtn, breakBtn, checkOutBtn);
}

/**
 * Save persistent panel references
 */
function registerPanelMessage(guildId, channelId, messageId) {
  const data = getShiftsData();
  if (!data[guildId]) data[guildId] = { active: {}, history: [], totals: {}, panels: [] };
  if (!data[guildId].panels) data[guildId].panels = [];

  // Avoid duplicates
  data[guildId].panels = data[guildId].panels.filter(p => p.messageId !== messageId);
  data[guildId].panels.push({ channelId, messageId, createdAt: Date.now() });

  saveShiftsData(data);
}

/**
 * Live updates all registered Clocky Duty panels in the guild
 */
async function updateLivePanels(client, guildId) {
  try {
    const data = getShiftsData();
    const guildData = data[guildId];
    if (!guildData || !guildData.panels || guildData.panels.length === 0) return;

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const embed = createClockyEmbed(guildId, guild);
    const row = createClockyButtonRow();

    const validPanels = [];

    for (const panelInfo of guildData.panels) {
      try {
        const channel = guild.channels.cache.get(panelInfo.channelId) || (await guild.channels.fetch(panelInfo.channelId).catch(() => null));
        if (!channel) continue;

        const message = await channel.messages.fetch(panelInfo.messageId).catch(() => null);
        if (message) {
          await message.edit({ embeds: [embed], components: [row] }).catch(() => null);
          validPanels.push(panelInfo);
        }
      } catch (err) {
        console.warn('Failed to update panel message:', err.message);
      }
    }

    // Keep only surviving panels
    guildData.panels = validPanels;
    saveShiftsData(data);
  } catch (err) {
    console.error('Error in updateLivePanels:', err);
  }
}

/**
 * Clocks a staff member in / Check In
 */
function startShift(guildId, user, notes = '') {
  const data = getShiftsData();
  if (!data[guildId]) {
    data[guildId] = { active: {}, history: [], totals: {}, panels: [] };
  }
  if (!data[guildId].active) data[guildId].active = {};
  if (!data[guildId].history) data[guildId].history = [];
  if (!data[guildId].totals) data[guildId].totals = {};

  const existingShift = data[guildId].active[user.id];
  if (existingShift) {
    return {
      success: false,
      reason: 'ALREADY_CLOCKED_IN',
      activeShift: existingShift
    };
  }

  const shiftId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  const now = Date.now();

  const newShift = {
    shiftId,
    userId: user.id,
    userTag: user.tag || user.username,
    userDisplayName: user.displayName || user.username,
    status: 'WORKING', // 'WORKING' or 'BREAK'
    startTime: now,
    currentBreakStart: null,
    totalBreakMs: 0,
    notes: notes ? notes.trim() : 'General Staff Duties / Patrolling'
  };

  data[guildId].active[user.id] = newShift;
  saveShiftsData(data);

  const userTotals = data[guildId].totals[user.id] || { totalMs: 0, totalShifts: 0 };

  return {
    success: true,
    shift: newShift,
    totalShifts: userTotals.totalShifts,
    totalTimeMs: userTotals.totalMs
  };
}

/**
 * Toggles break status (Break / Resume)
 */
function toggleBreak(guildId, user) {
  const data = getShiftsData();
  if (!data[guildId] || !data[guildId].active || !data[guildId].active[user.id]) {
    return {
      success: false,
      reason: 'NOT_CLOCKED_IN'
    };
  }

  const shift = data[guildId].active[user.id];
  const now = Date.now();

  if (shift.status === 'BREAK') {
    // Resume working
    const breakDuration = shift.currentBreakStart ? Math.max(0, now - shift.currentBreakStart) : 0;
    shift.totalBreakMs = (shift.totalBreakMs || 0) + breakDuration;
    shift.status = 'WORKING';
    shift.currentBreakStart = null;

    saveShiftsData(data);

    return {
      success: true,
      action: 'RESUMED_WORK',
      breakDuration,
      totalBreakMs: shift.totalBreakMs,
      shift
    };
  } else {
    // Start break
    shift.status = 'BREAK';
    shift.currentBreakStart = now;

    saveShiftsData(data);

    return {
      success: true,
      action: 'BREAK_STARTED',
      shift
    };
  }
}

/**
 * Clocks a staff member out / Check Out
 */
function endShift(guildId, user, notes = '') {
  const data = getShiftsData();
  if (!data[guildId] || !data[guildId].active || !data[guildId].active[user.id]) {
    return {
      success: false,
      reason: 'NOT_CLOCKED_IN'
    };
  }

  const activeShift = data[guildId].active[user.id];
  const now = Date.now();

  // If was on break when checking out, calculate final break segment
  let totalBreakMs = activeShift.totalBreakMs || 0;
  if (activeShift.status === 'BREAK' && activeShift.currentBreakStart) {
    totalBreakMs += Math.max(0, now - activeShift.currentBreakStart);
  }

  const totalElapsedMs = Math.max(0, now - activeShift.startTime);
  const netWorkingMs = Math.max(0, totalElapsedMs - totalBreakMs);

  const completedShift = {
    shiftId: activeShift.shiftId,
    userId: user.id,
    userTag: user.tag || user.username,
    userDisplayName: user.displayName || user.username,
    startTime: activeShift.startTime,
    endTime: now,
    totalElapsedMs: totalElapsedMs,
    totalBreakMs: totalBreakMs,
    netWorkingMs: netWorkingMs,
    durationFormatted: formatDuration(netWorkingMs),
    startNotes: activeShift.notes,
    endNotes: notes ? notes.trim() : 'Shift ended successfully'
  };

  // Remove from active
  delete data[guildId].active[user.id];

  // Append to history
  if (!data[guildId].history) data[guildId].history = [];
  data[guildId].history.push(completedShift);

  // Update totals (store net working time)
  if (!data[guildId].totals) data[guildId].totals = {};
  if (!data[guildId].totals[user.id]) {
    data[guildId].totals[user.id] = {
      userTag: user.tag || user.username,
      totalMs: 0,
      totalShifts: 0,
      lastShiftEnd: now
    };
  }

  const totals = data[guildId].totals[user.id];
  totals.totalMs += netWorkingMs;
  totals.totalShifts += 1;
  totals.lastShiftEnd = now;
  totals.userTag = user.tag || user.username;

  saveShiftsData(data);

  return {
    success: true,
    completedShift,
    netWorkingMs,
    totalElapsedMs,
    totalBreakMs,
    totalMs: totals.totalMs,
    totalShifts: totals.totalShifts
  };
}

/**
 * Handle All Clocky Duty Button Clicks
 */
async function handleClockButton(interaction) {
  const customId = interaction.customId;
  const guildId = interaction.guild.id;
  const user = interaction.user;

  // Staff permission check
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      content: '❌ Only staff members with authorized staff roles or permissions can use duty controls.',
      ephemeral: true
    });
  }

  // 1. My status
  if (customId === 'clock_status') {
    const stats = getUserShiftStats(guildId, user.id);
    let statusText = '🔴 **Off Duty**';
    let shiftDurationText = 'N/A';
    let breakText = '0 secs';

    if (stats.activeShift) {
      const now = Date.now();
      const elapsed = formatDuration(now - stats.activeShift.startTime);
      if (stats.activeShift.status === 'BREAK') {
        const breakElapsed = formatDuration(now - (stats.activeShift.currentBreakStart || now));
        statusText = `☕ **On Break** (break started <t:${Math.floor(stats.activeShift.currentBreakStart / 1000)}:R> • \`${breakElapsed}\`)`;
      } else {
        statusText = `🟢 **Working** (started <t:${Math.floor(stats.activeShift.startTime / 1000)}:R>)`;
      }
      shiftDurationText = elapsed;
      breakText = formatDuration(stats.activeShift.totalBreakMs || 0);
    }

    const embed = new EmbedBuilder()
      .setTitle(`👤 Staff Duty Status: ${user.displayName || user.username}`)
      .setColor(0x5865F2)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '📌 Current Status', value: statusText, inline: true },
        { name: '⏱️ Active Shift Elapsed', value: `\`${shiftDurationText}\``, inline: true },
        { name: '☕ Break Time Taken', value: `\`${breakText}\``, inline: true },
        { name: '📊 All-Time Working Record', value: `**${formatDuration(stats.totalMs)}** across **${stats.totalShifts}** completed shifts`, inline: false }
      )
      .setFooter({ text: 'Monroe County Staff Duty Tracker • Private Reply' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 2. Check In
  if (customId === 'clock_in') {
    const result = startShift(guildId, user);
    if (!result.success && result.reason === 'ALREADY_CLOCKED_IN') {
      const startUnix = Math.floor(result.activeShift.startTime / 1000);
      const isBreak = result.activeShift.status === 'BREAK';
      return interaction.reply({
        content: `⚠️ You are already checked in!\n• **Status:** ${isBreak ? '☕ On Break' : '🟢 Working'}\n• **Started:** <t:${startUnix}:f> (<t:${startUnix}:R>)\n\n*Use **Break / resume** or **Check out** when finished.*`,
        ephemeral: true
      });
    }

    const startUnix = Math.floor(result.shift.startTime / 1000);

    await interaction.reply({
      content: `✅ You have **Checked in** and are now on duty!\n• **Start Time:** <t:${startUnix}:t> (<t:${startUnix}:R>)\n• Total Past Record: \`${formatDuration(result.totalTimeMs)}\``,
      ephemeral: true
    });

    // Update live panels in real-time
    await updateLivePanels(interaction.client, guildId);

    // Audit log to shift log channel
    const auditEmbed = new EmbedBuilder()
      .setTitle('🟢 Staff Member Checked In')
      .setColor(0x57F287)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Staff Member', value: `<@${user.id}> (\`${user.tag}\`)`, inline: true },
        { name: '⏰ Time', value: `<t:${startUnix}:t> (<t:${startUnix}:R>)`, inline: true },
        { name: '📈 Total Past Record', value: `**${result.totalShifts}** shifts • **${formatDuration(result.totalTimeMs)}**`, inline: false }
      )
      .setFooter({ text: `Monroe County Duty • Shift ID: ${result.shift.shiftId}` })
      .setTimestamp();

    await sendShiftAuditLog(interaction.guild, interaction.client, auditEmbed);
    return;
  }

  // 3. Break / Resume
  if (customId === 'clock_break') {
    const result = toggleBreak(guildId, user);
    if (!result.success && result.reason === 'NOT_CLOCKED_IN') {
      return interaction.reply({
        content: '⚠️ You are not currently checked in! Click **Check in** first.',
        ephemeral: true
      });
    }

    const nowUnix = Math.floor(Date.now() / 1000);

    if (result.action === 'BREAK_STARTED') {
      await interaction.reply({
        content: `☕ You are now **On Break**.\n• Break started: <t:${nowUnix}:t> (<t:${nowUnix}:R>)\n*Click **Break / resume** again when you return to duty!*`,
        ephemeral: true
      });

      await updateLivePanels(interaction.client, guildId);

      const auditEmbed = new EmbedBuilder()
        .setTitle('☕ Staff Member On Break')
        .setColor(0xFEE75C)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Staff Member', value: `<@${user.id}> (\`${user.tag}\`)`, inline: true },
          { name: '⏰ Break Started', value: `<t:${nowUnix}:t> (<t:${nowUnix}:R>)`, inline: true }
        )
        .setFooter({ text: `Monroe County Duty • Shift ID: ${result.shift.shiftId}` })
        .setTimestamp();

      await sendShiftAuditLog(interaction.guild, interaction.client, auditEmbed);
    } else {
      const breakDurationStr = formatDuration(result.breakDuration);
      await interaction.reply({
        content: `▶️ Welcome back! You have **resumed your shift**.\n• Break Duration: \`${breakDurationStr}\`\n• Total Breaks This Shift: \`${formatDuration(result.totalBreakMs)}\``,
        ephemeral: true
      });

      await updateLivePanels(interaction.client, guildId);

      const auditEmbed = new EmbedBuilder()
        .setTitle('▶️ Staff Member Resumed Shift')
        .setColor(0x57F287)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Staff Member', value: `<@${user.id}> (\`${user.tag}\`)`, inline: true },
          { name: '☕ Break Duration', value: `\`${breakDurationStr}\``, inline: true },
          { name: '⏰ Resumed At', value: `<t:${nowUnix}:t> (<t:${nowUnix}:R>)`, inline: true }
        )
        .setFooter({ text: `Monroe County Duty • Shift ID: ${result.shift.shiftId}` })
        .setTimestamp();

      await sendShiftAuditLog(interaction.guild, interaction.client, auditEmbed);
    }
    return;
  }

  // 4. Check Out
  if (customId === 'clock_out') {
    const result = endShift(guildId, user);
    if (!result.success && result.reason === 'NOT_CLOCKED_IN') {
      return interaction.reply({
        content: '⚠️ You are not currently checked in!',
        ephemeral: true
      });
    }

    const netWorkStr = formatDuration(result.netWorkingMs);
    const breakStr = formatDuration(result.totalBreakMs);
    const totalTimeStr = formatDuration(result.totalMs);

    await interaction.reply({
      content: `⏹️ You have **Checked out**.\n• **Net Working Time:** \`${netWorkStr}\`\n• **Break Time:** \`${breakStr}\`\n• **Updated All-Time Total:** **${totalTimeStr}** (${result.totalShifts} shifts)`,
      ephemeral: true
    });

    await updateLivePanels(interaction.client, guildId);

    const shift = result.completedShift;
    const startUnix = Math.floor(shift.startTime / 1000);
    const endUnix = Math.floor(shift.endTime / 1000);

    const auditEmbed = new EmbedBuilder()
      .setTitle('🔴 Staff Member Checked Out')
      .setColor(0xED4245)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Staff Member', value: `<@${user.id}> (\`${user.tag}\`)`, inline: true },
        { name: '⏱️ Net Working Time', value: `**${netWorkStr}**`, inline: true },
        { name: '☕ Total Break Time', value: `\`${breakStr}\``, inline: true },
        { name: '⏰ Shift Timeline', value: `• Started: <t:${startUnix}:t> (<t:${startUnix}:R>)\n• Ended: <t:${endUnix}:t> (<t:${endUnix}:R>)`, inline: false },
        { name: '📊 Updated Record', value: `**${result.totalShifts}** shifts logged • **${totalTimeStr}** total on duty`, inline: false }
      )
      .setFooter({ text: `Monroe County Duty • Shift ID: ${shift.shiftId}` })
      .setTimestamp();

    await sendShiftAuditLog(interaction.guild, interaction.client, auditEmbed);
  }
}

/**
 * Retrieves all currently active shifts for a guild
 */
function getActiveShifts(guildId) {
  const data = getShiftsData();
  if (!data[guildId] || !data[guildId].active) return [];
  return Object.values(data[guildId].active);
}

/**
 * Retrieves shift statistics for a specific user
 */
function getUserShiftStats(guildId, userId) {
  const data = getShiftsData();
  if (!data[guildId]) {
    return {
      activeShift: null,
      totalMs: 0,
      totalShifts: 0,
      avgShiftMs: 0,
      recentHistory: []
    };
  }

  const activeShift = data[guildId].active ? data[guildId].active[userId] || null : null;
  const totals = (data[guildId].totals && data[guildId].totals[userId]) || { totalMs: 0, totalShifts: 0 };
  const history = (data[guildId].history || []).filter(h => h.userId === userId);

  const avgShiftMs = totals.totalShifts > 0 ? Math.round(totals.totalMs / totals.totalShifts) : 0;
  const recentHistory = history.slice(-5).reverse();

  return {
    activeShift,
    totalMs: totals.totalMs,
    totalShifts: totals.totalShifts,
    avgShiftMs,
    recentHistory
  };
}

/**
 * Retrieves leaderboard of staff members ranked by total shift time
 */
function getShiftLeaderboard(guildId) {
  const data = getShiftsData();
  if (!data[guildId] || !data[guildId].totals) return [];

  const entries = Object.entries(data[guildId].totals).map(([userId, stats]) => ({
    userId,
    userTag: stats.userTag || 'Staff Member',
    totalMs: stats.totalMs || 0,
    totalShifts: stats.totalShifts || 0,
    lastShiftEnd: stats.lastShiftEnd || 0
  }));

  return entries.sort((a, b) => b.totalMs - a.totalMs);
}

/**
 * Resets shift statistics for a user or the whole guild
 */
function resetShiftStats(guildId, userId = null) {
  const data = getShiftsData();
  if (!data[guildId]) return false;

  if (userId) {
    if (data[guildId].active && data[guildId].active[userId]) {
      delete data[guildId].active[userId];
    }
    if (data[guildId].totals && data[guildId].totals[userId]) {
      delete data[guildId].totals[userId];
    }
    if (data[guildId].history) {
      data[guildId].history = data[guildId].history.filter(h => h.userId !== userId);
    }
  } else {
    data[guildId] = { active: {}, history: [], totals: {}, panels: data[guildId].panels || [] };
  }

  saveShiftsData(data);
  return true;
}

/**
 * Dispatches an audit embed to the configured shift log channel
 */
async function sendShiftAuditLog(guild, client, embed) {
  try {
    const config = getConfig();
    const targetChannelId = config.shiftLogChannelId || process.env.SHIFT_LOG_CHANNEL_ID || config.logChannelId || process.env.LOG_CHANNEL_ID;
    if (!targetChannelId) return;

    const logChannel =
      guild.channels.cache.get(targetChannelId) ||
      (await guild.channels.fetch(targetChannelId).catch(() => null));

    if (logChannel) {
      await logChannel.send({ embeds: [embed] }).catch(console.error);
    }
  } catch (err) {
    console.error('Error logging shift activity:', err);
  }
}

module.exports = {
  getShiftsData,
  saveShiftsData,
  formatDuration,
  createClockyEmbed,
  createClockyButtonRow,
  registerPanelMessage,
  updateLivePanels,
  handleClockButton,
  startShift,
  toggleBreak,
  endShift,
  getActiveShifts,
  getUserShiftStats,
  getShiftLeaderboard,
  resetShiftStats,
  sendShiftAuditLog
};
