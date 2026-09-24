const fs = require('fs');
const path = require('path');
const { getConfig } = require('./ticketHandler');

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
 * Formats milliseconds into human-readable string (e.g., "2 hrs 15 mins 30 secs" or "45 mins 10 secs")
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
 * Clocks a staff member in
 */
function startShift(guildId, user, notes = '') {
  const data = getShiftsData();
  if (!data[guildId]) {
    data[guildId] = { active: {}, history: [], totals: {} };
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
    startTime: now,
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
 * Clocks a staff member out
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
  const durationMs = Math.max(0, now - activeShift.startTime);

  const completedShift = {
    shiftId: activeShift.shiftId,
    userId: user.id,
    userTag: user.tag || user.username,
    startTime: activeShift.startTime,
    endTime: now,
    durationMs: durationMs,
    durationFormatted: formatDuration(durationMs),
    startNotes: activeShift.notes,
    endNotes: notes ? notes.trim() : 'Shift ended successfully'
  };

  // Remove from active
  delete data[guildId].active[user.id];

  // Append to history
  if (!data[guildId].history) data[guildId].history = [];
  data[guildId].history.push(completedShift);

  // Update totals
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
  totals.totalMs += durationMs;
  totals.totalShifts += 1;
  totals.lastShiftEnd = now;
  totals.userTag = user.tag || user.username;

  saveShiftsData(data);

  return {
    success: true,
    completedShift,
    durationMs,
    totalMs: totals.totalMs,
    totalShifts: totals.totalShifts
  };
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
    data[guildId] = { active: {}, history: [], totals: {} };
  }

  saveShiftsData(data);
  return true;
}

/**
 * Dispatches an embed to the staff log channel if configured
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
  startShift,
  endShift,
  getActiveShifts,
  getUserShiftStats,
  getShiftLeaderboard,
  resetShiftStats,
  sendShiftAuditLog
};
