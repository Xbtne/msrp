const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getConfig, saveConfig } = require('./ticketHandler');
const {
  getShiftsData,
  createClockyEmbed,
  createClockyButtonRow,
  registerPanelMessage,
  formatDuration,
  getShiftLeaderboard,
  resetShiftStats
} = require('./shiftHandler');
const {
  getApplicationsData,
  saveApplicationsData,
  createApplicationPanelEmbed,
  createApplicationPanelRow,
  setApplicationReviewChannel
} = require('./applicationHandler');
const {
  getWelcomerData,
  getGuildWelcomerConfig,
  setGuildWelcomerConfig,
  sendTestWelcome
} = require('./welcomerHandler');
const {
  getDynamicCommands,
  saveDynamicCommand,
  deleteDynamicCommand,
  generateAiAssistantResponse
} = require('./dynamicCommands');

// Parse request body JSON
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2e6) { // 2MB limit
        req.connection.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle Web Dashboard and REST API requests
 */
async function handleDashboardRequest(req, res, client) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // API ROUTE: Get Live Bot & Guild Status
  if (pathname === '/api/status' && req.method === 'GET') {
    const isReady = client?.isReady();
    const botTag = client?.user?.tag || 'Monroe County Bot';
    const botAvatar = client?.user?.displayAvatarURL({ dynamic: true, size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const ping = client?.ws?.ping && client.ws.ping > 0 ? `${client.ws.ping}ms` : '18ms';
    const uptime = client?.uptime ? formatDuration(client.uptime) : '0 mins';

    // Gather guilds and text channels
    const guilds = [];
    if (client?.guilds?.cache) {
      for (const guild of client.guilds.cache.values()) {
        const textChannels = [];
        for (const ch of guild.channels.cache.values()) {
          if (ch.type === ChannelType.GuildText) {
            textChannels.push({
              id: ch.id,
              name: ch.name,
              topic: ch.topic || '',
              parentId: ch.parentId,
              rateLimitPerUser: ch.rateLimitPerUser || 0
            });
          }
        }
        textChannels.sort((a, b) => a.name.localeCompare(b.name));

        guilds.push({
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL({ dynamic: true }) || '',
          memberCount: guild.memberCount,
          channels: textChannels
        });
      }
    }

    const shiftsData = getShiftsData();
    const appsData = getApplicationsData();
    const welcomerData = getWelcomerData();

    return sendJson(res, 200, {
      success: true,
      ready: isReady,
      bot: { tag: botTag, avatar: botAvatar, ping, uptime },
      guilds,
      shifts: shiftsData,
      applications: appsData.applications || {},
      welcomer: welcomerData
    });
  }

  // API ROUTE: Send Plain Text Message to Channel
  if (pathname === '/api/send-message' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { channelId, message, pin } = body;

      if (!channelId || !message) {
        return sendJson(res, 400, { success: false, error: 'channelId and message are required' });
      }

      const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
      if (!channel) {
        return sendJson(res, 404, { success: false, error: 'Discord channel not found' });
      }

      const sent = await channel.send({ content: message });
      if (pin) await sent.pin().catch(() => {});

      return sendJson(res, 200, { success: true, messageId: sent.id });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Send Rich Embed to Channel
  if (pathname === '/api/send-embed' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { channelId, title, description, color, authorName, authorIcon, footerText, imageUrl, thumbnailUrl, pin } = body;

      if (!channelId) {
        return sendJson(res, 400, { success: false, error: 'channelId is required' });
      }

      const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
      if (!channel) {
        return sendJson(res, 404, { success: false, error: 'Discord channel not found' });
      }

      const embed = new EmbedBuilder();
      if (title) embed.setTitle(title);
      if (description) embed.setDescription(description);
      if (color) embed.setColor(parseInt(color.replace('#', ''), 16) || 0x5865F2);
      else embed.setColor(0x5865F2);
      if (authorName) embed.setAuthor({ name: authorName, iconURL: authorIcon || undefined });
      if (footerText) embed.setFooter({ text: footerText });
      if (imageUrl) embed.setImage(imageUrl);
      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
      embed.setTimestamp();

      const sent = await channel.send({ embeds: [embed] });
      if (pin) await sent.pin().catch(() => {});

      return sendJson(res, 200, { success: true, messageId: sent.id });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Deploy System Panels
  if (pathname === '/api/deploy-panel' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { channelId, panelType } = body;

      if (!channelId || !panelType) {
        return sendJson(res, 400, { success: false, error: 'channelId and panelType are required' });
      }

      const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
      if (!channel) {
        return sendJson(res, 404, { success: false, error: 'Discord channel not found' });
      }

      const guildId = channel.guild.id;

      if (panelType === 'tickets') {
        const config = getConfig();
        const panelConfig = config.panel || {
          title: '📬 Monroe County Ticket System',
          description: 'Click a button below to open a ticket',
          color: '#5865F2'
        };

        const embed = new EmbedBuilder()
          .setTitle(panelConfig.title)
          .setDescription(panelConfig.description)
          .setColor(panelConfig.color || 0x5865F2)
          .setFooter({ text: panelConfig.footer || 'Click a button below to open a ticket' })
          .setTimestamp();

        const row = new ActionRowBuilder();
        const ticketTypes = config.ticketTypes || [];

        const styleMap = {
          Primary: ButtonStyle.Primary,
          Secondary: ButtonStyle.Secondary,
          Success: ButtonStyle.Success,
          Danger: ButtonStyle.Danger
        };

        for (const type of ticketTypes) {
          const btn = new ButtonBuilder()
            .setCustomId(`create_ticket_${type.id}`)
            .setLabel(type.label)
            .setStyle(styleMap[type.style] || ButtonStyle.Primary);

          if (type.emoji) btn.setEmoji(type.emoji);
          row.addComponents(btn);
        }

        const msg = await channel.send({ embeds: [embed], components: [row] });
        return sendJson(res, 200, { success: true, messageId: msg.id, type: 'tickets' });
      } else if (panelType === 'duty') {
        const embed = createClockyEmbed(guildId, channel.guild);
        const row = createClockyButtonRow();
        const msg = await channel.send({ embeds: [embed], components: [row] });
        registerPanelMessage(guildId, channel.id, msg.id);
        return sendJson(res, 200, { success: true, messageId: msg.id, type: 'duty' });
      } else if (panelType === 'application') {
        const embed = createApplicationPanelEmbed();
        const row = createApplicationPanelRow();
        const msg = await channel.send({ embeds: [embed], components: [row] });
        return sendJson(res, 200, { success: true, messageId: msg.id, type: 'application' });
      }

      return sendJson(res, 400, { success: false, error: 'Invalid panel type' });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Channel Actions (Purge, Lock, Slowmode)
  if (pathname === '/api/action/channel' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { channelId, action, value, reason } = body;

      const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
      if (!channel) return sendJson(res, 404, { success: false, error: 'Channel not found' });

      if (action === 'purge') {
        const amount = Math.min(Math.max(parseInt(value) || 10, 1), 100);
        const deleted = await channel.bulkDelete(amount, true);
        return sendJson(res, 200, { success: true, message: `Purged ${deleted.size} messages` });
      } else if (action === 'slowmode') {
        const seconds = Math.max(parseInt(value) || 0, 0);
        await channel.setRateLimitPerUser(seconds, reason || 'Updated via Web Dashboard');
        return sendJson(res, 200, { success: true, message: `Slowmode set to ${seconds}s` });
      } else if (action === 'lock') {
        const shouldLock = Boolean(value);
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
          SendMessages: !shouldLock
        });
        return sendJson(res, 200, { success: true, message: `Channel ${shouldLock ? 'locked' : 'unlocked'}` });
      }

      return sendJson(res, 400, { success: false, error: 'Invalid action' });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Review Staff Application (Accept / Deny)
  if (pathname === '/api/action/review-app' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { appId, decision, reason, reviewer } = body;

      const data = getApplicationsData();
      const app = data.applications[appId];

      if (!app) return sendJson(res, 404, { success: false, error: 'Application not found' });

      const isAccept = decision === 'accept';
      app.status = isAccept ? 'ACCEPTED' : 'DENIED';
      app.reviewedBy = reviewer || 'Web Dashboard Admin';
      app.reviewedAt = Date.now();
      app.reviewReason = reason || (isAccept ? 'Accepted via Web Dashboard' : 'Denied via Web Dashboard');

      saveApplicationsData(data);

      // Automatically Grant Accepted Staff Role upon Web Dashboard Acceptance
      if (isAccept) {
        try {
          const targetGuildId = app.guildId || client.guilds.cache.first()?.id;
          const guild = client.guilds.cache.get(targetGuildId) || (await client.guilds.fetch(targetGuildId).catch(() => null));
          if (guild) {
            const member = await guild.members.fetch(app.userId).catch(() => null);
            const config = getConfig();
            const staffAcceptedRoleId = config.staffAcceptedRoleId || '1536402083438133297';
            if (member && staffAcceptedRoleId) {
              await member.roles.add(staffAcceptedRoleId, `Staff application accepted via Web Dashboard by ${app.reviewedBy}`).catch(err => {
                console.error(`Failed to assign accepted staff role:`, err.message);
              });
            }
          }
        } catch (roleErr) {
          console.error('Error assigning staff role on dashboard accept:', roleErr.message);
        }
      }

      // DM Applicant
      try {
        const applicantUser = await client.users.fetch(app.userId);
        if (applicantUser) {
          const config = getConfig();
          const dmEmbed = new EmbedBuilder()
            .setTitle(isAccept ? '🎉 Staff Application Accepted!' : '📬 Staff Application Update')
            .setColor(isAccept ? 0x57F287 : 0xED4245)
            .setDescription(
              isAccept
                ? `Congratulations! Your staff application for **${app.guildName || 'MSRC'}** has been **ACCEPTED**!\n\n**Reviewer:** ${app.reviewedBy}\n**Notes:**\n${app.reviewReason}\n\nYour staff role (<@&${(config.staffAcceptedRoleId || '1536402083438133297')}>) has been granted! Please check the server for your onboarding!`
                : `Thank you for your interest in joining the **${app.guildName || 'MSRC'}** Staff Team.\n\nAfter review, your application has been **DENIED**.\n\n**Reason:**\n${app.reviewReason}`
            )
            .setFooter({ text: `Application ID: ${appId}` })
            .setTimestamp();

          await applicantUser.send({ embeds: [dmEmbed] });
        }
      } catch (e) {}

      return sendJson(res, 200, { success: true, app });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Welcomer Settings & Test
  if (pathname === '/api/action/welcomer' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { guildId, action, channelId, enabled, description, autoRoleId, dmEnabled, dmMessage } = body;

      const targetGuildId = guildId || client.guilds.cache.first()?.id;
      if (!targetGuildId) return sendJson(res, 400, { success: false, error: 'No guild available' });

      if (action === 'test') {
        const guild = client.guilds.cache.get(targetGuildId);
        if (!guild) return sendJson(res, 404, { success: false, error: 'Guild not found' });

        const config = getGuildWelcomerConfig(targetGuildId);
        const chId = channelId || config.channelId;
        const channel = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));

        if (!channel) return sendJson(res, 400, { success: false, error: 'Target welcome channel not found' });

        const member = guild.members.me || guild.members.cache.first();
        await sendTestWelcome(guild, channel, member);
        return sendJson(res, 200, { success: true, message: 'Test welcome message sent to #' + channel.name });
      }

      const updates = {};
      if (typeof enabled === 'boolean') updates.enabled = enabled;
      if (channelId) updates.channelId = channelId;
      if (description) updates.description = description;
      if (autoRoleId !== undefined) updates.autoRoleId = autoRoleId || null;
      if (typeof dmEnabled === 'boolean') updates.dmEnabled = dmEnabled;
      if (dmMessage !== undefined) updates.dmMessage = dmMessage;

      const updatedConfig = setGuildWelcomerConfig(targetGuildId, updates);
      return sendJson(res, 200, { success: true, config: updatedConfig });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: AI Assistant / Dev Co-Pilot
  if (pathname === '/api/ai-assistant' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { prompt, history } = body;

      if (!prompt || !prompt.trim()) {
        return sendJson(res, 400, { success: false, error: 'Prompt is required' });
      }

      const result = await generateAiAssistantResponse(prompt, history, client);
      return sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Dynamic Custom Commands (GET, POST, DELETE)
  if (pathname === '/api/dynamic-commands' && req.method === 'GET') {
    return sendJson(res, 200, { success: true, commands: getDynamicCommands() });
  }

  if (pathname === '/api/dynamic-commands' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const resObj = saveDynamicCommand(body);
      return sendJson(res, resObj.success ? 200 : 400, resObj);
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  if (pathname === '/api/dynamic-commands' && req.method === 'DELETE') {
    try {
      const body = await parseRequestBody(req);
      const deleted = deleteDynamicCommand(body.name);
      return sendJson(res, 200, { success: deleted, commands: getDynamicCommands() });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Consolidated Server & Staff Leaderboards
  if (pathname === '/api/leaderboards' && req.method === 'GET') {
    try {
      const shiftsData = getShiftsData();
      const appsData = getApplicationsData();

      // Aggregate Shift Totals across all guilds
      const userShiftMap = {};
      let totalServerMs = 0;
      let totalServerShifts = 0;

      for (const [guildId, gData] of Object.entries(shiftsData)) {
        if (gData && gData.totals) {
          for (const [userId, stats] of Object.entries(gData.totals)) {
            if (!userShiftMap[userId]) {
              userShiftMap[userId] = {
                userId,
                userTag: stats.userTag || 'Staff Member',
                totalMs: 0,
                totalShifts: 0,
                lastShiftEnd: 0
              };
            }
            userShiftMap[userId].totalMs += stats.totalMs || 0;
            userShiftMap[userId].totalShifts += stats.totalShifts || 0;
            if ((stats.lastShiftEnd || 0) > userShiftMap[userId].lastShiftEnd) {
              userShiftMap[userId].lastShiftEnd = stats.lastShiftEnd;
            }
            if (stats.userTag && stats.userTag !== 'Staff Member') {
              userShiftMap[userId].userTag = stats.userTag;
            }
            totalServerMs += stats.totalMs || 0;
            totalServerShifts += stats.totalShifts || 0;
          }
        }
      }

      const shiftsLeaderboard = Object.values(userShiftMap)
        .map(u => ({
          ...u,
          formattedTotal: formatDuration(u.totalMs),
          avgShiftMs: u.totalShifts > 0 ? Math.round(u.totalMs / u.totalShifts) : 0,
          formattedAvg: u.totalShifts > 0 ? formatDuration(Math.round(u.totalMs / u.totalShifts)) : '0 secs'
        }))
        .sort((a, b) => b.totalMs - a.totalMs);

      // Aggregate Application Reviews
      const reviewerMap = {};
      const applications = Object.values(appsData.applications || {});
      let totalAccepted = 0;
      let totalDenied = 0;
      let totalPending = 0;

      for (const app of applications) {
        if (app.status === 'ACCEPTED') totalAccepted++;
        else if (app.status === 'DENIED') totalDenied++;
        else totalPending++;

        if (app.reviewedBy || app.reviewedById) {
          const key = app.reviewedById || app.reviewedBy;
          if (!reviewerMap[key]) {
            reviewerMap[key] = {
              reviewerId: app.reviewedById || '',
              reviewerTag: app.reviewedBy || 'Staff Reviewer',
              totalReviewed: 0,
              accepted: 0,
              denied: 0
            };
          }
          reviewerMap[key].totalReviewed++;
          if (app.status === 'ACCEPTED') reviewerMap[key].accepted++;
          if (app.status === 'DENIED') reviewerMap[key].denied++;
        }
      }

      const reviewsLeaderboard = Object.values(reviewerMap)
        .map(r => ({
          ...r,
          acceptanceRate: r.totalReviewed > 0 ? Math.round((r.accepted / r.totalReviewed) * 100) : 0
        }))
        .sort((a, b) => b.totalReviewed - a.totalReviewed);

      return sendJson(res, 200, {
        success: true,
        summary: {
          totalStaffTracked: shiftsLeaderboard.length,
          totalServerMs,
          formattedServerMs: formatDuration(totalServerMs),
          totalServerShifts,
          topStaff: shiftsLeaderboard[0] || null,
          totalApplications: applications.length,
          totalAccepted,
          totalDenied,
          totalPending,
          topReviewer: reviewsLeaderboard[0] || null
        },
        shiftsLeaderboard,
        reviewsLeaderboard,
        recentApplications: applications.slice(-10).reverse()
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Get Bot Server Configuration
  if (pathname === '/api/config' && req.method === 'GET') {
    try {
      const config = getConfig();
      return sendJson(res, 200, { success: true, config });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API ROUTE: Save Bot Server Configuration
  if (pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const currentConfig = getConfig();

      if (body.logChannelId !== undefined) currentConfig.logChannelId = body.logChannelId.trim();
      if (body.shiftLogChannelId !== undefined) currentConfig.shiftLogChannelId = body.shiftLogChannelId.trim();
      if (body.appLogChannelId !== undefined) currentConfig.appLogChannelId = body.appLogChannelId.trim();
      if (body.reviewsChannelId !== undefined) currentConfig.reviewsChannelId = body.reviewsChannelId.trim();
      if (body.bibiChannelId !== undefined) currentConfig.bibiChannelId = body.bibiChannelId.trim();
      if (body.pingRoleId !== undefined) currentConfig.pingRoleId = body.pingRoleId.trim();
      if (body.staffAcceptedRoleId !== undefined) currentConfig.staffAcceptedRoleId = body.staffAcceptedRoleId.trim();
      if (body.defaultCategoryId !== undefined) currentConfig.defaultCategoryId = body.defaultCategoryId.trim();
      if (body.robloxWebhookUrl !== undefined) currentConfig.robloxWebhookUrl = body.robloxWebhookUrl.trim();
      if (body.robloxUniverseId !== undefined) currentConfig.robloxUniverseId = body.robloxUniverseId.trim();
      if (body.robloxApiKey !== undefined) currentConfig.robloxApiKey = body.robloxApiKey.trim();

      if (Array.isArray(body.staffRoleIds)) {
        currentConfig.staffRoleIds = body.staffRoleIds.map(id => id.trim()).filter(Boolean);
      } else if (typeof body.staffRoleIds === 'string') {
        currentConfig.staffRoleIds = body.staffRoleIds.split(',').map(id => id.trim()).filter(Boolean);
      }

      if (Array.isArray(body.whitelistedAntiPingIds)) {
        currentConfig.whitelistedAntiPingIds = body.whitelistedAntiPingIds.map(id => id.trim()).filter(Boolean);
      } else if (typeof body.whitelistedAntiPingIds === 'string') {
        currentConfig.whitelistedAntiPingIds = body.whitelistedAntiPingIds.split(',').map(id => id.trim()).filter(Boolean);
      }

      if (Array.isArray(body.allowedMassPingCategoryIds)) {
        currentConfig.allowedMassPingCategoryIds = body.allowedMassPingCategoryIds.map(id => id.trim()).filter(Boolean);
      } else if (typeof body.allowedMassPingCategoryIds === 'string') {
        currentConfig.allowedMassPingCategoryIds = body.allowedMassPingCategoryIds.split(',').map(id => id.trim()).filter(Boolean);
      }

      if (body.panel && typeof body.panel === 'object') {
        currentConfig.panel = {
          ...currentConfig.panel,
          ...body.panel
        };
      }

      const saved = saveConfig(currentConfig);
      if (!saved) {
        return sendJson(res, 500, { success: false, error: 'Failed to write configuration file' });
      }

      return sendJson(res, 200, { success: true, config: currentConfig });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // DEFAULT ROUTE: Render the Full Tickety-style Web Dashboard
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderDashboardHtml(client));
}

/**
 * Generates the full modern Tickety-inspired Dashboard SPA
 */
function renderDashboardHtml(client) {
  const botTag = client?.user?.tag || 'Monroe County Bot';
  const botAvatar = client?.user?.displayAvatarURL({ dynamic: true, size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MSRC • Management & Bot Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #090b10;
      --sidebar-bg: #0f131c;
      --card-bg: rgba(18, 24, 38, 0.75);
      --card-hover: rgba(26, 34, 52, 0.85);
      --border: rgba(255, 255, 255, 0.07);
      --border-active: rgba(88, 101, 242, 0.4);
      --primary: #5865F2;
      --primary-hover: #4752c4;
      --primary-glow: rgba(88, 101, 242, 0.3);
      --accent: #57F287;
      --danger: #ED4245;
      --danger-hover: #c93b3e;
      --warning: #FEE75C;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --radius: 14px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background-color: var(--bg-dark); color: var(--text); min-height: 100vh; display: flex; overflow-x: hidden; }

    /* Layout */
    .sidebar {
      width: 270px;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 100;
      padding: 1.5rem 1rem;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 0 0.5rem 1.75rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1.25rem;
    }

    .brand-avatar {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      border: 2px solid var(--border-active);
      box-shadow: 0 0 15px var(--primary-glow);
    }

    .brand-title { font-size: 1.05rem; font-weight: 800; letter-spacing: -0.02em; }
    .brand-subtitle { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }

    .nav-menu { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 0.9rem;
      border-radius: 10px;
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .nav-item:hover { background: rgba(255, 255, 255, 0.04); color: var(--text); }
    .nav-item.active { background: rgba(88, 101, 242, 0.15); color: #818cf8; border: 1px solid rgba(88, 101, 242, 0.3); }
    .nav-icon { font-size: 1.15rem; }

    .sidebar-footer {
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(87, 242, 135, 0.12);
      border: 1px solid rgba(87, 242, 135, 0.3);
      padding: 0.3rem 0.65rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--accent);
    }

    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); }

    /* Main Content Area */
    .main-wrapper {
      margin-left: 270px;
      flex: 1;
      padding: 2.25rem 2.5rem;
      max-width: 1280px;
    }

    .top-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .page-title h2 { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; }
    .page-title p { font-size: 0.9rem; color: var(--text-muted); margin-top: 0.2rem; }

    .header-actions { display: flex; gap: 0.75rem; }

    .btn {
      padding: 0.65rem 1.25rem;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-primary { background: var(--primary); color: #fff; box-shadow: 0 4px 14px var(--primary-glow); }
    .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-secondary { background: rgba(255, 255, 255, 0.05); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.09); border-color: rgba(255, 255, 255, 0.15); }
    .btn-success { background: var(--accent); color: #000; font-weight: 700; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: var(--danger-hover); }

    /* Stats Grid */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.35rem;
      backdrop-filter: blur(10px);
      transition: transform 0.2s, border-color 0.2s;
    }

    .stat-card:hover { transform: translateY(-2px); border-color: var(--border-active); }
    .stat-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
    .stat-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700; }
    .stat-icon { font-size: 1.2rem; }
    .stat-num { font-size: 1.8rem; font-weight: 800; }

    /* Tab Content Panels */
    .tab-content { display: none; }
    .tab-content.active { display: block; animation: fadeIn 0.25s ease-in-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    /* Dashboard Cards & Layout */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.75rem;
      margin-bottom: 1.75rem;
      backdrop-filter: blur(12px);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      padding-bottom: 0.85rem;
      border-bottom: 1px solid var(--border);
    }

    .card-header h3 { font-size: 1.15rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }

    /* Forms & Controls */
    .form-group { margin-bottom: 1.25rem; }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: #cbd5e1; margin-bottom: 0.45rem; }
    .form-control {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #0d111a;
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s;
    }

    .form-control:focus { border-color: #818cf8; box-shadow: 0 0 0 3px rgba(88, 101, 242, 0.2); }
    textarea.form-control { resize: vertical; min-height: 90px; }

    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }

    /* Embed Preview Mockup */
    .discord-preview {
      background: #2b2d31;
      border-radius: 8px;
      padding: 1rem;
      border-left: 4px solid var(--primary);
      margin-top: 1rem;
    }

    .preview-title { font-weight: 700; font-size: 1rem; margin-bottom: 0.4rem; color: #fff; }
    .preview-desc { font-size: 0.9rem; color: #dbdee1; line-height: 1.45; white-space: pre-wrap; }
    .preview-footer { font-size: 0.75rem; color: #949ba4; margin-top: 0.75rem; }

    /* Tables & Lists */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.9rem;
    }

    .data-table th { padding: 0.85rem 1rem; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 700; border-bottom: 1px solid var(--border); }
    .data-table td { padding: 0.9rem 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .data-table tr:hover td { background: rgba(255, 255, 255, 0.02); }

    .tag-badge {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .tag-working { background: rgba(87, 242, 135, 0.15); color: var(--accent); border: 1px solid rgba(87, 242, 135, 0.3); }
    .tag-break { background: rgba(254, 231, 92, 0.15); color: var(--warning); border: 1px solid rgba(254, 231, 92, 0.3); }
    .tag-pending { background: rgba(254, 231, 92, 0.15); color: var(--warning); border: 1px solid rgba(254, 231, 92, 0.3); }
    .tag-accepted { background: rgba(87, 242, 135, 0.15); color: var(--accent); border: 1px solid rgba(87, 242, 135, 0.3); }
    .tag-denied { background: rgba(237, 66, 69, 0.15); color: var(--danger); border: 1px solid rgba(237, 66, 69, 0.3); }

    /* Toast Notification */
    #toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #1e2436;
      color: #fff;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      border: 1px solid var(--border-active);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      font-size: 0.9rem;
      font-weight: 600;
      display: none;
      z-index: 1000;
      align-items: center;
      gap: 0.6rem;
    }

    /* AI Assistant Interface */
    .ai-chat-container {
      display: flex;
      flex-direction: column;
      height: 480px;
      background: #090c13;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 1.5rem;
    }

    .ai-chat-messages {
      flex: 1;
      padding: 1.25rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .ai-msg {
      display: flex;
      gap: 0.75rem;
      max-width: 88%;
      animation: fadeIn 0.2s ease;
    }

    .ai-msg-user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }

    .ai-msg-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 1px solid var(--border-active);
    }

    .ai-msg-bubble {
      padding: 0.85rem 1.15rem;
      border-radius: 14px;
      font-size: 0.92rem;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .ai-msg-user .ai-msg-bubble {
      background: var(--primary);
      color: #fff;
      border-bottom-right-radius: 3px;
    }

    .ai-msg-assistant .ai-msg-bubble {
      background: #141a29;
      border: 1px solid var(--border);
      color: #e2e8f0;
      border-bottom-left-radius: 3px;
    }

    .ai-action-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(87, 242, 135, 0.12);
      border: 1px solid rgba(87, 242, 135, 0.3);
      color: var(--accent);
      padding: 0.5rem 0.85rem;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 700;
      margin-top: 0.6rem;
    }

    .ai-prompt-chips {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .prompt-chip {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 0.4rem 0.8rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .prompt-chip:hover {
      background: rgba(88, 101, 242, 0.15);
      border-color: #818cf8;
      color: #fff;
    }

    .ai-input-bar {
      display: flex;
      gap: 0.75rem;
      padding: 0.9rem 1.25rem;
      background: #0d111a;
      border-top: 1px solid var(--border);
    }

    /* Leaderboard Badges & Styling */
    .rank-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      height: 32px;
      padding: 0 0.5rem;
      border-radius: 8px;
      font-weight: 800;
      font-size: 0.85rem;
    }
    .rank-1 { background: linear-gradient(135deg, #ffd700 0%, #ffae00 100%); color: #000; box-shadow: 0 0 12px rgba(255, 215, 0, 0.45); }
    .rank-2 { background: linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%); color: #000; box-shadow: 0 0 10px rgba(148, 163, 184, 0.35); }
    .rank-3 { background: linear-gradient(135deg, #d97706 0%, #78350f 100%); color: #fff; box-shadow: 0 0 10px rgba(217, 119, 6, 0.35); }
    .rank-other { background: rgba(255, 255, 255, 0.06); color: var(--text-muted); border: 1px solid var(--border); }
  </style>
</head>
<body>

  <!-- Sidebar Navigation -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <img src="${botAvatar}" class="brand-avatar" alt="Bot Logo">
      <div>
        <div class="brand-title">MSRC Dashboard</div>
        <div class="brand-subtitle">Discord Management Suite</div>
      </div>
    </div>

    <nav class="nav-menu">
      <a class="nav-item active" onclick="switchTab('overview')">
        <span class="nav-icon">📊</span> Overview
      </a>
      <a class="nav-item" onclick="switchTab('leaderboards')">
        <span class="nav-icon">🏆</span> Leaderboards
      </a>
      <a class="nav-item" onclick="switchTab('assistant')">
        <span class="nav-icon">🤖</span> AI Dev Assistant
      </a>
      <a class="nav-item" onclick="switchTab('messenger')">
        <span class="nav-icon">💬</span> Channel Messenger
      </a>
      <a class="nav-item" onclick="switchTab('panels')">
        <span class="nav-icon">⚡</span> Deploy Panels
      </a>
      <a class="nav-item" onclick="switchTab('duty')">
        <span class="nav-icon">🕛</span> Staff Duty & Shifts
      </a>
      <a class="nav-item" onclick="switchTab('applications')">
        <span class="nav-icon">📋</span> Staff Applications
      </a>
      <a class="nav-item" onclick="switchTab('welcomer')">
        <span class="nav-icon">👋</span> Welcomer System
      </a>
      <a class="nav-item" onclick="switchTab('security')">
        <span class="nav-icon">🛡️</span> Security & Anti-Ping
      </a>
      <a class="nav-item" onclick="switchTab('channels')">
        <span class="nav-icon">🛠️</span> Channel Controls
      </a>
      <a class="nav-item" onclick="switchTab('settings')">
        <span class="nav-icon">⚙️</span> Server Settings
      </a>
    </nav>

    <div class="sidebar-footer">
      <span>Gateway Status</span>
      <div class="status-badge">
        <div class="status-dot"></div>
        <span>Online</span>
      </div>
    </div>
  </aside>

  <!-- Main View Area -->
  <main class="main-wrapper">
    <div class="top-header">
      <div class="page-title">
        <h2 id="view-title">Dashboard Overview</h2>
        <p id="view-desc">Live performance metrics and server bot operations.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="fetchStatus(true)">🔄 Refresh Data</button>
        <button class="btn btn-primary" onclick="switchTab('messenger')">💬 Send Message</button>
      </div>
    </div>

    <!-- Live Stats Row -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-top">
          <span class="stat-label">Bot Ping</span>
          <span class="stat-icon">⚡</span>
        </div>
        <div class="stat-num" id="stat-ping">-- ms</div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <span class="stat-label">Staff On Duty</span>
          <span class="stat-icon">🟢</span>
        </div>
        <div class="stat-num" id="stat-working" style="color: var(--accent);">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <span class="stat-label">Pending Applications</span>
          <span class="stat-icon">📋</span>
        </div>
        <div class="stat-num" id="stat-apps" style="color: var(--warning);">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <span class="stat-label">System Uptime</span>
          <span class="stat-icon">⏱️</span>
        </div>
        <div class="stat-num" id="stat-uptime" style="font-size: 1.3rem; line-height: 2.2rem;">--</div>
      </div>
    </div>

    <!-- TAB 1: OVERVIEW -->
    <div id="tab-overview" class="tab-content active">
      <div class="card">
        <div class="card-header">
          <h3>⚡ Quick Action Shortcuts</h3>
        </div>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="quickDeploy('tickets')">🎫 Deploy Ticket Panel</button>
          <button class="btn btn-secondary" onclick="quickDeploy('duty')">🕛 Deploy Clocky Duty Panel</button>
          <button class="btn btn-secondary" onclick="quickDeploy('application')">📋 Deploy Staff Application Panel</button>
          <button class="btn btn-secondary" onclick="switchTab('messenger')">✍️ Send Custom Announcement</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>🟢 Currently On-Duty Staff</h3>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Staff Member</th>
              <th>Status</th>
              <th>Started</th>
              <th>Shift Notes</th>
            </tr>
          </thead>
          <tbody id="overview-duty-tbody">
            <tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No staff currently on duty.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB: LEADERBOARDS -->
    <div id="tab-leaderboards" class="tab-content">
      <!-- Leaderboard Summary Cards -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-top">
            <span class="stat-label">👑 Top Staff Member</span>
            <span class="stat-icon">🥇</span>
          </div>
          <div class="stat-num" id="lb-top-staff" style="font-size: 1.25rem; line-height: 1.8rem; color: #ffd700;">--</div>
          <small id="lb-top-staff-sub" style="color: var(--text-muted); font-size: 0.8rem;">0 hrs · 0 shifts</small>
        </div>
        <div class="stat-card">
          <div class="stat-top">
            <span class="stat-label">⏱️ Total Server Duty Time</span>
            <span class="stat-icon">🕒</span>
          </div>
          <div class="stat-num" id="lb-total-time" style="font-size: 1.25rem; line-height: 1.8rem; color: var(--accent);">0 hrs</div>
          <small id="lb-total-shifts-sub" style="color: var(--text-muted); font-size: 0.8rem;">Across all staff shifts</small>
        </div>
        <div class="stat-card">
          <div class="stat-top">
            <span class="stat-label">📊 Total Shifts Completed</span>
            <span class="stat-icon">📈</span>
          </div>
          <div class="stat-num" id="lb-total-shifts" style="color: #818cf8;">0</div>
          <small id="lb-total-staff-sub" style="color: var(--text-muted); font-size: 0.8rem;">0 active staff tracked</small>
        </div>
        <div class="stat-card">
          <div class="stat-top">
            <span class="stat-label">📋 Top Application Reviewer</span>
            <span class="stat-icon">📝</span>
          </div>
          <div class="stat-num" id="lb-top-reviewer" style="font-size: 1.25rem; line-height: 1.8rem; color: #57F287;">--</div>
          <small id="lb-top-reviewer-sub" style="color: var(--text-muted); font-size: 0.8rem;">0 applications processed</small>
        </div>
      </div>

      <!-- Staff Duty Hours Leaderboard -->
      <div class="card">
        <div class="card-header">
          <h3>🏆 Staff Duty & Shift Hours Leaderboard</h3>
          <button class="btn btn-secondary btn-sm" onclick="fetchLeaderboards(true)">🔄 Refresh Rankings</button>
        </div>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Rankings of all staff members ordered by cumulative duty and patrol hours logged through Clocky Duty.
        </p>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 70px;">Rank</th>
              <th>Staff Member</th>
              <th>Total Shift Time</th>
              <th>Completed Shifts</th>
              <th>Average Shift</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody id="lb-shifts-tbody">
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading shift leaderboard...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Staff Application Reviewers Leaderboard -->
      <div class="card">
        <div class="card-header">
          <h3>📋 Staff Application Reviewers Leaderboard</h3>
        </div>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Staff members ranked by total application submissions reviewed, acceptance counts, and decision rates.
        </p>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 70px;">Rank</th>
              <th>Reviewer / Staff</th>
              <th>Applications Reviewed</th>
              <th>Accepted (🟢)</th>
              <th>Denied (🔴)</th>
              <th>Acceptance Rate</th>
            </tr>
          </thead>
          <tbody id="lb-reviews-tbody">
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading reviewer leaderboard...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Recent Application Submissions -->
      <div class="card">
        <div class="card-header">
          <h3>👥 Recent Staff Applications Activity</h3>
          <button class="btn btn-secondary" onclick="switchTab('applications')">📋 Go to Application Reviews</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Submitted Date</th>
              <th>Status</th>
              <th>Reviewed By</th>
              <th>Review Notes</th>
            </tr>
          </thead>
          <tbody id="lb-recent-apps-tbody">
            <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Loading recent applicant records...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 2: CHANNEL MESSENGER -->
    <div id="tab-messenger" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>💬 Send Text Message into Discord</h3>
        </div>
        <div class="form-group">
          <label>Target Discord Channel</label>
          <select id="msg-channel-select" class="form-control"></select>
        </div>
        <div class="form-group">
          <label>Message Content (Supports Markdown, Emojis & Mentions)</label>
          <textarea id="msg-content" class="form-control" placeholder="Type your message to send into Discord as the bot..."></textarea>
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" id="msg-pin">
          <label for="msg-pin" style="margin-bottom: 0; cursor: pointer;">📌 Pin this message in the channel</label>
        </div>
        <button class="btn btn-primary" onclick="sendMessage()">🚀 Send Message to Discord</button>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>🎨 Create & Dispatch Rich Embed</h3>
        </div>
        <div class="form-group">
          <label>Target Discord Channel</label>
          <select id="embed-channel-select" class="form-control"></select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Embed Title</label>
            <input type="text" id="embed-title" class="form-control" placeholder="e.g. 📢 Server Update & Announcements" oninput="updateEmbedPreview()">
          </div>
          <div class="form-group">
            <label>Embed Color (Hex)</label>
            <input type="color" id="embed-color" class="form-control" value="#5865F2" style="height: 44px; padding: 0.2rem;" oninput="updateEmbedPreview()">
          </div>
        </div>
        <div class="form-group">
          <label>Embed Description</label>
          <textarea id="embed-desc" class="form-control" placeholder="Enter embed text..." oninput="updateEmbedPreview()"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Footer Text</label>
            <input type="text" id="embed-footer" class="form-control" placeholder="e.g. Monroe County Management" oninput="updateEmbedPreview()">
          </div>
          <div class="form-group">
            <label>Thumbnail / Banner Image URL</label>
            <input type="text" id="embed-image" class="form-control" placeholder="https://..." oninput="updateEmbedPreview()">
          </div>
        </div>

        <label style="font-size: 0.85rem; font-weight: 600; margin-top: 1rem; display: block;">Live Embed Preview</label>
        <div class="discord-preview" id="embed-preview-box">
          <div class="preview-title" id="preview-title">Embed Title Preview</div>
          <div class="preview-desc" id="preview-desc">Embed description preview will appear here in real-time...</div>
          <div class="preview-footer" id="preview-footer">Monroe County Management</div>
        </div>

        <button class="btn btn-primary" style="margin-top: 1.25rem;" onclick="sendEmbed()">🚀 Send Embed to Discord</button>
      </div>
    </div>

    <!-- TAB 3: DEPLOY PANELS -->
    <div id="tab-panels" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>⚡ Deploy System Panels with 1-Click</h3>
        </div>
        <p style="color: var(--text-muted); margin-bottom: 1.25rem; font-size: 0.9rem;">
          Deploy interactive panels directly into any channel in your Discord server without typing slash commands.
        </p>

        <div class="form-group">
          <label>Select Target Channel</label>
          <select id="panel-channel-select" class="form-control"></select>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-top: 1.5rem;">
          <div class="card" style="margin-bottom: 0; background: rgba(0,0,0,0.2);">
            <h4>📬 Ticket Support Panel</h4>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0.5rem 0 1rem;">
              4 interactive buttons (Game Report, Support, Player Report, Partnership) with staff claiming and HTML transcripts.
            </p>
            <button class="btn btn-primary" style="width: 100%;" onclick="deployPanel('tickets')">Deploy Ticket Panel</button>
          </div>

          <div class="card" style="margin-bottom: 0; background: rgba(0,0,0,0.2);">
            <h4>🕛 Clocky Duty Staff Panel</h4>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0.5rem 0 1rem;">
              Live duty panel with [My status], [Check in], [Break / resume], and [Check out] buttons and auto-updating timers.
            </p>
            <button class="btn btn-secondary" style="width: 100%;" onclick="deployPanel('duty')">Deploy Clocky Duty</button>
          </div>

          <div class="card" style="margin-bottom: 0; background: rgba(0,0,0,0.2);">
            <h4>📋 Staff Application Panel</h4>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0.5rem 0 1rem;">
              Deploy the 9-question DM staff application panel with automatic management review controls.
            </p>
            <button class="btn btn-secondary" style="width: 100%;" onclick="deployPanel('application')">Deploy Application Panel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: STAFF DUTY & SHIFTS -->
    <div id="tab-duty" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>🕛 Active Staff Shifts</h3>
          <button class="btn btn-secondary btn-sm" onclick="deployPanel('duty')">⚡ Deploy Clocky Duty Panel</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Staff User</th>
              <th>Status</th>
              <th>Clock In Time</th>
              <th>Shift Notes</th>
            </tr>
          </thead>
          <tbody id="duty-tbody">
            <tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No staff currently on duty.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 5: STAFF APPLICATIONS -->
    <div id="tab-applications" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>📋 Staff Applications Management</h3>
          <button class="btn btn-secondary" onclick="deployPanel('application')">⚡ Deploy Application Panel</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="apps-tbody">
            <tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No applications submitted yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 6: WELCOMER -->
    <div id="tab-welcomer" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>👋 Server Welcomer & Auto-Greeting Configuration</h3>
        </div>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.25rem;">
          Automatically greet new server members with a customized embed card, member count milestone, auto-roles, and optional welcome DMs.
        </p>

        <div class="form-row">
          <div class="form-group">
            <label>Welcome Channel</label>
            <select id="welcomer-channel-select" class="form-control"></select>
          </div>
          <div class="form-group">
            <label>Welcomer Status</label>
            <select id="welcomer-enabled-select" class="form-control">
              <option value="true">🟢 Enabled</option>
              <option value="false">🔴 Disabled</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Welcome Embed Description (Variables: <code>{user}</code>, <code>{server}</code>, <code>{memberCount}</code>, <code>{accountAge}</code>)</label>
          <textarea id="welcomer-desc" class="form-control" style="min-height: 110px;" oninput="updateWelcomerPreview()"></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Auto-Role on Join (Role ID or leave empty for None)</label>
            <input type="text" id="welcomer-autorole" class="form-control" placeholder="Role ID (e.g. 1544965232625983488)">
          </div>
          <div class="form-group">
            <label>Send Welcome DM to Member?</label>
            <select id="welcomer-dm-enabled" class="form-control">
              <option value="false">🔴 Disabled (Channel only)</option>
              <option value="true">🟢 Enabled (Send DM greeting)</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Welcome Direct Message (DM) Text</label>
          <textarea id="welcomer-dm-text" class="form-control" style="min-height: 70px;" placeholder="Welcome to our server, {user}!"></textarea>
        </div>

        <label style="font-size: 0.85rem; font-weight: 600; margin-top: 1rem; display: block;">Live Welcome Card Preview</label>
        <div class="discord-preview" id="welcomer-preview-box">
          <div class="preview-title" id="welcomer-preview-title">👋 Welcome to Monroe County!</div>
          <div class="preview-desc" id="welcomer-preview-desc">Welcome @NewMember to Monroe County! You are member #1,250!</div>
          <div class="preview-footer">Monroe County Community</div>
        </div>

        <div style="display: flex; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="saveWelcomerSettings()">💾 Save Welcomer Settings</button>
          <button class="btn btn-secondary" onclick="testWelcomer()">🧪 Send Test Welcome Message</button>
        </div>
      </div>
    </div>

    <!-- TAB 7: SECURITY & ANTI-PING -->
    <div id="tab-security" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>🛡️ Anti-Mass-Ping Scam Interceptor</h3>
        </div>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">
          Automatically detects unauthorized <code>@everyone</code> or <code>@here</code> blasts outside of announcement categories, deletes the message, purges 7 days of history, and permanently bans compromised accounts.
        </p>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <div class="status-badge" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
            <div class="status-dot"></div>
            <span>Anti-Mass Ping Shield: Active</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>🍯 Honeypot Trap Security</h3>
        </div>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">
          Trap channel deployed to catch and auto-quarantine compromised spam accounts. Use <code>/setupcomp</code> in Discord to manage.
        </p>
      </div>
    </div>

    <!-- TAB 8: CHANNEL CONTROLS -->
    <div id="tab-channels" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>⚙️ Live Discord Channel Moderation Tools</h3>
        </div>
        <div class="form-group">
          <label>Select Channel</label>
          <select id="mod-channel-select" class="form-control"></select>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
          <div class="card" style="margin-bottom: 0; background: rgba(0,0,0,0.2);">
            <h4>🧹 Bulk Message Purge</h4>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.3rem 0 0.8rem;">Delete 1-100 messages in the channel.</p>
            <div style="display: flex; gap: 0.5rem;">
              <input type="number" id="purge-amount" class="form-control" value="10" min="1" max="100">
              <button class="btn btn-danger" onclick="channelAction('purge')">Purge</button>
            </div>
          </div>

          <div class="card" style="margin-bottom: 0; background: rgba(0,0,0,0.2);">
            <h4>🔒 Lock / Unlock Channel</h4>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.3rem 0 0.8rem;">Toggle SendMessages for @everyone.</p>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-danger" style="flex: 1;" onclick="channelAction('lock', true)">🔒 Lock</button>
              <button class="btn btn-secondary" style="flex: 1;" onclick="channelAction('lock', false)">🔓 Unlock</button>
            </div>
          </div>

          <div class="card" style="margin-bottom: 0; background: rgba(0,0,0,0.2);">
            <h4>⏳ Channel Slowmode</h4>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.3rem 0 0.8rem;">Set message rate limit in seconds.</p>
            <div style="display: flex; gap: 0.5rem;">
              <input type="number" id="slowmode-seconds" class="form-control" value="5" min="0" max="21600">
              <button class="btn btn-primary" onclick="channelAction('slowmode')">Set</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 9: BOT & SERVER SETTINGS -->
    <div id="tab-settings" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>⚙️ Bot Configuration & Server Channels</h3>
          <button class="btn btn-primary" onclick="saveSettings()">💾 Save All Settings</button>
        </div>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Manage your server log channels, staff permissions, anti-mass ping security whitelists, and Roblox integration directly from this dashboard without needing extra slash commands.
        </p>

        <!-- System Channels Group -->
        <h4 style="margin-bottom: 0.75rem; color: #818cf8; font-size: 1rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem;">📋 System & Logging Channels</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Staff Shift / Clock-In Logs Channel</label>
            <select id="cfg-shift-log-select" class="form-control"></select>
            <small style="color: var(--text-muted); font-size: 0.75rem;">Logs clock-in, clock-out, and break reports.</small>
          </div>
          <div class="form-group">
            <label>Staff Application Reviews Channel</label>
            <select id="cfg-app-log-select" class="form-control"></select>
            <small style="color: var(--text-muted); font-size: 0.75rem;">Receives submitted staff questionnaires & accept/deny buttons.</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>General Ticket Logs Channel</label>
            <select id="cfg-log-select" class="form-control"></select>
            <small style="color: var(--text-muted); font-size: 0.75rem;">Ticket creation, closure transcripts, and audit logs.</small>
          </div>
          <div class="form-group">
            <label>Bibi Netanyahu AI Parody Channel</label>
            <select id="cfg-bibi-select" class="form-control"></select>
            <small style="color: var(--text-muted); font-size: 0.75rem;">AI roast & speech channel (unhinged mode).</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Default Ticket Category ID</label>
            <input type="text" id="cfg-default-category" class="form-control" placeholder="e.g. 1538405571001065503">
          </div>
          <div class="form-group">
            <label>Customer Reviews Channel ID (Optional)</label>
            <input type="text" id="cfg-reviews-channel" class="form-control" placeholder="Channel ID">
          </div>
        </div>

        <!-- Staff Roles & Security Whitelist -->
        <h4 style="margin: 1.5rem 0 0.75rem; color: #818cf8; font-size: 1rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem;">🛡️ Staff Roles & Anti-Mass Ping Whitelist</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Staff Role IDs (comma-separated)</label>
            <input type="text" id="cfg-staff-roles" class="form-control" placeholder="1544965232625983488, 1234567890...">
            <small style="color: var(--text-muted); font-size: 0.75rem;">Roles with staff management & ticket access.</small>
          </div>
          <div class="form-group">
            <label>Accepted Staff Role ID (Auto-granted on App Acceptance)</label>
            <input type="text" id="cfg-staff-accepted-role" class="form-control" placeholder="1536402083438133297">
            <small style="color: var(--text-muted); font-size: 0.75rem;">Role granted to applicants when accepted.</small>
          </div>
          <div class="form-group">
            <label>Ticket Ping Role ID</label>
            <input type="text" id="cfg-ping-role" class="form-control" placeholder="1544965232625983488">
            <small style="color: var(--text-muted); font-size: 0.75rem;">Role pinged when a new ticket is opened.</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Anti-Mass Ping Whitelisted IDs (User or Role IDs)</label>
            <input type="text" id="cfg-anti-ping-whitelist" class="form-control" placeholder="1544073936961273970, 719273912684249160...">
            <small style="color: var(--text-muted); font-size: 0.75rem;">Users & roles exempt from anti-mass-ping auto-bans.</small>
          </div>
          <div class="form-group">
            <label>Allowed Mass-Ping Category IDs</label>
            <input type="text" id="cfg-allowed-ping-categories" class="form-control" placeholder="1536249828730867725, 1536249828302921731">
            <small style="color: var(--text-muted); font-size: 0.75rem;">Announcement categories where @everyone is allowed.</small>
          </div>
        </div>

        <!-- Roblox Integration -->
        <h4 style="margin: 1.5rem 0 0.75rem; color: #818cf8; font-size: 1rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem;">🎮 Roblox Open Cloud & Universe Integration</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Roblox Universe ID</label>
            <input type="text" id="cfg-roblox-universe" class="form-control" placeholder="e.g. 10761915391">
          </div>
          <div class="form-group">
            <label>Roblox Open Cloud API Key</label>
            <input type="password" id="cfg-roblox-key" class="form-control" placeholder="Roblox Open Cloud API Key">
          </div>
        </div>
        <div class="form-group">
          <label>Roblox Discord Notification Webhook URL</label>
          <input type="text" id="cfg-roblox-webhook" class="form-control" placeholder="https://discord.com/api/webhooks/...">
        </div>

        <!-- Ticket Panel Appearance Customization -->
        <h4 style="margin: 1.5rem 0 0.75rem; color: #818cf8; font-size: 1rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem;">🎫 Ticket Panel Appearance</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Panel Embed Title</label>
            <input type="text" id="cfg-panel-title" class="form-control" placeholder="📬 Monroe County Ticket System">
          </div>
          <div class="form-group">
            <label>Panel Embed Color (Hex)</label>
            <input type="color" id="cfg-panel-color" class="form-control" style="height: 44px; padding: 0.2rem;" value="#5865F2">
          </div>
        </div>
        <div class="form-group">
          <label>Panel Embed Description</label>
          <textarea id="cfg-panel-desc" class="form-control" style="min-height: 80px;" placeholder="Ticket panel description..."></textarea>
        </div>
        <div class="form-group">
          <label>Panel Embed Footer</label>
          <input type="text" id="cfg-panel-footer" class="form-control" placeholder="Click a button below to open a ticket">
        </div>

        <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
          <button class="btn btn-primary" onclick="saveSettings()">💾 Save All Server Settings</button>
          <button class="btn btn-secondary" onclick="loadSettings(true)">🔄 Reload Settings</button>
        </div>
      </div>
    </div>

    <!-- TAB 10: AI ASSISTANT & DYNAMIC COMMAND CREATOR -->
    <div id="tab-assistant" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>🤖 AI Dev Co-Pilot & Remote Bot Assistant</h3>
          <span class="status-badge"><div class="status-dot"></div> AI Live Engine</span>
        </div>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">
          Control your Discord bot, add custom dynamic commands (e.g. <code>!rules</code>, <code>!training</code>, <code>!patrol</code>), dispatch rich embeds, or manage server settings remotely from any device.
        </p>

        <!-- Quick Prompt Chips -->
        <div class="ai-prompt-chips">
          <div class="prompt-chip" onclick="quickAiPrompt('Create a !rules command with 5 clear Monroe County roleplay rules in a dark blue embed')">⚡ Create !rules command</div>
          <div class="prompt-chip" onclick="quickAiPrompt('Add a !training command with cadet academy instructions, voice channel reminders, and 10-codes in a green embed')">🚔 Add !training command</div>
          <div class="prompt-chip" onclick="quickAiPrompt('Create a !patrol command explaining how officers clock-in and radio procedures')">📋 Add !patrol command</div>
          <div class="prompt-chip" onclick="quickAiPrompt('Send an announcement into chat welcoming everyone to tonight roleplay session!')">📢 Send Announcement</div>
          <div class="prompt-chip" onclick="quickAiPrompt('Deploy the Staff Clocky Duty shift panel')">🕛 Deploy Duty Panel</div>
          <div class="prompt-chip" onclick="quickAiPrompt('Deploy the 9-question Staff Application panel')">📋 Deploy Application Panel</div>
        </div>

        <!-- Chat Container -->
        <div class="ai-chat-container">
          <div class="ai-chat-messages" id="ai-chat-box">
            <div class="ai-msg ai-msg-assistant">
              <img src="${botAvatar}" class="ai-msg-avatar" alt="Bot">
              <div class="ai-msg-bubble">
                <strong>Hello! I am your AI Dev Assistant & Bot Co-Pilot.</strong><br>
                I can create custom commands (e.g. <code>!training</code>, <code>!rules</code>, <code>!patrol</code>), deploy interactive panels, dispatch rich embeds, update server settings, and execute moderation tasks remotely for you anytime. What would you like me to do?
              </div>
            </div>
          </div>
          <div class="ai-input-bar">
            <input type="text" id="ai-user-prompt" class="form-control" placeholder="Ask AI Assistant to add a command, send an embed, or change settings..." onkeydown="if(event.key==='Enter') sendAiMessage()">
            <button class="btn btn-primary" id="ai-send-btn" onclick="sendAiMessage()">🚀 Send to AI</button>
          </div>
        </div>
      </div>

      <!-- Live Dynamic Commands Manager -->
      <div class="card">
        <div class="card-header">
          <h3>⚡ Live Dynamic Custom Commands</h3>
          <button class="btn btn-secondary" onclick="fetchDynamicCommands(true)">🔄 Refresh Commands</button>
        </div>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          All custom commands created by the AI Assistant or via the web dashboard are active immediately on Discord with prefix <code>!</code>.
        </p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Trigger</th>
              <th>Type</th>
              <th>Description / Title</th>
              <th>Created By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="dynamic-commands-tbody">
            <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Loading custom commands...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <div id="toast">✅ Action completed successfully!</div>

  <script>
    let globalStatus = null;
    let currentConfigData = null;

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.style.borderColor = isError ? 'var(--danger)' : 'var(--border-active)';
      toast.style.display = 'flex';
      setTimeout(() => { toast.style.display = 'none'; }, 3500);
    }

    function switchTab(tabName) {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

      const targetNav = Array.from(document.querySelectorAll('.nav-item')).find(el => el.getAttribute('onclick')?.includes(tabName));
      if (targetNav) targetNav.classList.add('active');

      const targetTab = document.getElementById('tab-' + tabName);
      if (targetTab) targetTab.classList.add('active');

      const titles = {
        overview: ['Dashboard Overview', 'Live performance metrics and server bot operations.'],
        leaderboards: ['Server & Staff Leaderboards', 'Live rankings for staff duty hours, active patrol shifts, and application review performance.'],
        assistant: ['AI Dev Co-Pilot & Remote Command Engine', 'Chat with your AI Assistant to generate custom commands, dispatch embeds, update server settings, and control the bot remotely.'],
        messenger: ['Channel Messenger & Embed Builder', 'Dispatch text messages and custom embeds directly into Discord.'],
        panels: ['Deploy System Panels', 'One-click panel deployment for tickets, duty shifts, and applications.'],
        duty: ['Staff Duty & Shifts', 'Track active working staff, break statuses, and duty shift history.'],
        applications: ['Staff Applications Review', 'Review answers and accept/deny staff applicants with 1-click.'],
        welcomer: ['Welcomer System', 'Configure automated server greetings, welcome channels, and auto-roles.'],
        security: ['Security & Honeypot', 'Anti-mass ping and honeypot security status.'],
        channels: ['Channel Moderation Tools', 'Lock, slowmode, and purge Discord channels remotely.'],
        settings: ['Bot & Server Settings', 'Configure log channels, staff roles, security whitelists, and Roblox integration live.']
      };

      if (titles[tabName]) {
        document.getElementById('view-title').innerText = titles[tabName][0];
        document.getElementById('view-desc').innerText = titles[tabName][1];
      }

      if (tabName === 'leaderboards') {
        fetchLeaderboards();
      }

      if (tabName === 'settings') {
        loadSettings();
      }

      if (tabName === 'assistant') {
        fetchDynamicCommands();
      }
    }

    // AI Assistant Client Logic
    let aiChatHistory = [];

    async function sendAiMessage(customPrompt = null) {
      const input = document.getElementById('ai-user-prompt');
      const prompt = (customPrompt || input.value || '').trim();
      if (!prompt) return;

      if (!customPrompt) input.value = '';

      const chatBox = document.getElementById('ai-chat-box');
      const sendBtn = document.getElementById('ai-send-btn');
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerText = '⏳ Thinking...';
      }

      // Append User message bubble
      const userMsgDiv = document.createElement('div');
      userMsgDiv.className = 'ai-msg ai-msg-user';
      userMsgDiv.innerHTML = \`<div class="ai-msg-bubble">\${prompt}</div>\`;
      chatBox.appendChild(userMsgDiv);
      chatBox.scrollTop = chatBox.scrollHeight;

      // Temporary Loading bubble
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'ai-msg ai-msg-assistant';
      loadingDiv.id = 'ai-loading-bubble';
      loadingDiv.innerHTML = \`
        <img src="${botAvatar}" class="ai-msg-avatar" alt="Bot">
        <div class="ai-msg-bubble" style="color: var(--text-muted);">
          <em>⚡ AI Assistant is processing your request...</em>
        </div>
      \`;
      chatBox.appendChild(loadingDiv);
      chatBox.scrollTop = chatBox.scrollHeight;

      try {
        const res = await fetch('/api/ai-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, history: aiChatHistory })
        });
        const data = await res.json();

        // Remove loading bubble
        const bubble = document.getElementById('ai-loading-bubble');
        if (bubble) bubble.remove();

        if (data.success) {
          aiChatHistory.push({ role: 'user', content: prompt });
          aiChatHistory.push({ role: 'assistant', content: data.reply });

          const aiMsgDiv = document.createElement('div');
          aiMsgDiv.className = 'ai-msg ai-msg-assistant';

          let actionHtml = '';
          if (data.action) {
            actionHtml = \`<div class="ai-action-badge">✨ Executed: \${data.action.details || data.action.type}</div>\`;
            showToast('🤖 AI Action: ' + (data.action.details || data.action.type));
            fetchDynamicCommands();
            fetchStatus();
          }

          aiMsgDiv.innerHTML = \`
            <img src="${botAvatar}" class="ai-msg-avatar" alt="Bot">
            <div class="ai-msg-bubble">
              \${data.reply}
              \${actionHtml}
            </div>
          \`;
          chatBox.appendChild(aiMsgDiv);
          chatBox.scrollTop = chatBox.scrollHeight;
        } else {
          showToast('❌ AI Error: ' + data.error, true);
        }
      } catch (err) {
        const bubble = document.getElementById('ai-loading-bubble');
        if (bubble) bubble.remove();
        showToast('❌ AI Connection Error: ' + err.message, true);
      } finally {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerText = '🚀 Send to AI';
        }
      }
    }

    function quickAiPrompt(text) {
      document.getElementById('ai-user-prompt').value = text;
      sendAiMessage(text);
    }

    // Dynamic Commands Fetcher and Manager
    async function fetchDynamicCommands(showNotification = false) {
      try {
        const res = await fetch('/api/dynamic-commands');
        const data = await res.json();
        if (data.success && data.commands) {
          renderDynamicCommands(data.commands);
          if (showNotification) showToast('✅ Dynamic commands refreshed!');
        }
      } catch (err) {
        console.error('Error fetching dynamic commands:', err);
      }
    }

    function renderDynamicCommands(commands) {
      const tbody = document.getElementById('dynamic-commands-tbody');
      if (!tbody) return;

      const keys = Object.keys(commands);
      if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No custom commands created yet. Ask the AI Assistant to create one!</td></tr>';
        return;
      }

      const rows = keys.map(k => {
        const c = commands[k];
        const isEmbed = c.responseType !== 'text';
        return \`
          <tr>
            <td><strong><code>!\${c.name}</code></strong></td>
            <td><span class="tag-badge \${isEmbed ? 'tag-working' : 'tag-pending'}">\${isEmbed ? '🖼️ Embed' : '💬 Text'}</span></td>
            <td>\${c.embedTitle || c.description || (c.content ? c.content.slice(0, 50) : 'Custom Command')}</td>
            <td><small style="color: var(--text-muted);">\${c.createdBy || 'AI Assistant'}</small></td>
            <td>
              <button class="btn btn-danger" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="deleteCustomCommand('\${c.name}')">🗑️ Delete</button>
            </td>
          </tr>
        \`;
      });

      tbody.innerHTML = rows.join('');
    }

    async function deleteCustomCommand(name) {
      if (!confirm(\`Are you sure you want to delete custom command !\${name}?\`)) return;

      try {
        const res = await fetch('/api/dynamic-commands', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.success) {
          showToast(\`🗑️ Command !\${name} deleted.\`);
          fetchDynamicCommands();
        } else {
          showToast('❌ Failed to delete command', true);
        }
      } catch (err) {
        showToast('❌ Error: ' + err.message, true);
      }
    }

    async function fetchStatus(showNotification = false) {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.success) {
          globalStatus = data;
          renderStatus(data);
          if (showNotification) showToast('✅ Dashboard data refreshed!');
        }
      } catch (err) {
        console.error('Failed to fetch status:', err);
      }
    }

    function renderStatus(data) {
      document.getElementById('stat-ping').innerText = data.bot.ping;
      document.getElementById('stat-uptime').innerText = data.bot.uptime;

      // Populate Channel Dropdowns
      const channelSelects = [
        document.getElementById('msg-channel-select'),
        document.getElementById('embed-channel-select'),
        document.getElementById('panel-channel-select'),
        document.getElementById('mod-channel-select'),
        document.getElementById('welcomer-channel-select'),
        document.getElementById('cfg-shift-log-select'),
        document.getElementById('cfg-app-log-select'),
        document.getElementById('cfg-log-select'),
        document.getElementById('cfg-bibi-select')
      ];

      const channels = [];
      data.guilds.forEach(g => {
        g.channels.forEach(ch => {
          channels.push({ id: ch.id, label: g.name + ' • #' + ch.name });
        });
      });

      channelSelects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '';

        if (select.id && select.id.startsWith('cfg-')) {
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = '-- Select Channel (or leave empty) --';
          select.appendChild(defaultOpt);
        }

        channels.forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = ch.label;
          select.appendChild(opt);
        });

        if (currentVal) {
          select.value = currentVal;
        } else if (currentConfigData) {
          if (select.id === 'cfg-shift-log-select') select.value = currentConfigData.shiftLogChannelId || '';
          if (select.id === 'cfg-app-log-select') select.value = currentConfigData.appLogChannelId || '';
          if (select.id === 'cfg-log-select') select.value = currentConfigData.logChannelId || '';
          if (select.id === 'cfg-bibi-select') select.value = currentConfigData.bibiChannelId || '';
        }
      });

      // Render Active Shifts
      let workingCount = 0;
      const dutyRows = [];
      for (const guildId in data.shifts) {
        const active = data.shifts[guildId]?.active || {};
        for (const uid in active) {
          const s = active[uid];
          const isWorking = (s.status || 'WORKING') === 'WORKING';
          if (isWorking) workingCount++;
          const startedStr = new Date(s.startTime).toLocaleTimeString();
          dutyRows.push(\`
            <tr>
              <td><strong>\${s.userDisplayName || s.userTag}</strong></td>
              <td><span class="tag-badge \${isWorking ? 'tag-working' : 'tag-break'}">\${isWorking ? '🟢 Working' : '☕ On Break'}</span></td>
              <td>\${startedStr}</td>
              <td>\${s.notes || 'General Duties'}</td>
            </tr>
          \`);
        }
      }

      document.getElementById('stat-working').innerText = workingCount;
      const tbodyDuty = document.getElementById('duty-tbody');
      const tbodyOverviewDuty = document.getElementById('overview-duty-tbody');

      if (dutyRows.length > 0) {
        tbodyDuty.innerHTML = dutyRows.join('');
        tbodyOverviewDuty.innerHTML = dutyRows.join('');
      } else {
        const emptyMsg = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No staff currently on duty.</td></tr>';
        tbodyDuty.innerHTML = emptyMsg;
        tbodyOverviewDuty.innerHTML = emptyMsg;
      }

      // Render Staff Applications
      let pendingApps = 0;
      const appRows = [];
      for (const appId in data.applications) {
        const a = data.applications[appId];
        if (a.status === 'PENDING') pendingApps++;
        const submittedStr = new Date(a.submittedAt).toLocaleDateString();

        let badgeClass = 'tag-pending';
        if (a.status === 'ACCEPTED') badgeClass = 'tag-accepted';
        if (a.status === 'DENIED') badgeClass = 'tag-denied';

        appRows.push(\`
          <tr>
            <td><strong>\${a.userTag}</strong></td>
            <td>\${submittedStr}</td>
            <td><span class="tag-badge \${badgeClass}">\${a.status}</span></td>
            <td>
              \${a.status === 'PENDING' ? \`
                <button class="btn btn-success" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="reviewApp('\${appId}', 'accept')">Accept</button>
                <button class="btn btn-danger" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="reviewApp('\${appId}', 'deny')">Deny</button>
              \` : \`<em>Reviewed by \${a.reviewedBy || 'Admin'}</em>\`}
            </td>
          </tr>
        \`);
      }

      document.getElementById('stat-apps').innerText = pendingApps;
      const tbodyApps = document.getElementById('apps-tbody');
      if (appRows.length > 0) {
        tbodyApps.innerHTML = appRows.join('');
      } else {
        tbodyApps.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No applications submitted yet.</td></tr>';
      }

      // Populate Welcomer Inputs
      if (data.welcomer) {
        const guildId = data.guilds?.[0]?.id;
        const w = (guildId && data.welcomer[guildId]) || Object.values(data.welcomer)[0];
        if (w) {
          const chSelect = document.getElementById('welcomer-channel-select');
          if (chSelect && w.channelId && !chSelect.value) {
            chSelect.value = w.channelId;
          }
          const enSelect = document.getElementById('welcomer-enabled-select');
          if (enSelect && typeof w.enabled === 'boolean') {
            enSelect.value = w.enabled ? 'true' : 'false';
          }
          const descInput = document.getElementById('welcomer-desc');
          if (descInput && w.description && !descInput.dataset.touched) {
            descInput.value = w.description;
            updateWelcomerPreview();
          }
          const roleInput = document.getElementById('welcomer-autorole');
          if (roleInput && w.autoRoleId && !roleInput.dataset.touched) {
            roleInput.value = w.autoRoleId;
          }
          const dmEnSelect = document.getElementById('welcomer-dm-enabled');
          if (dmEnSelect && typeof w.dmEnabled === 'boolean') {
            dmEnSelect.value = w.dmEnabled ? 'true' : 'false';
          }
          const dmTextInput = document.getElementById('welcomer-dm-text');
          if (dmTextInput && w.dmMessage && !dmTextInput.dataset.touched) {
            dmTextInput.value = w.dmMessage;
          }
        }
      }
    }

    async function sendMessage() {
      const channelId = document.getElementById('msg-channel-select').value;
      const message = document.getElementById('msg-content').value.trim();
      const pin = document.getElementById('msg-pin').checked;

      if (!channelId || !message) return alert('Please select a channel and enter message content.');

      try {
        const res = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, message, pin })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ Message dispatched to Discord!');
          document.getElementById('msg-content').value = '';
        } else {
          showToast('❌ Failed: ' + data.error, true);
        }
      } catch (err) {
        showToast('❌ Error: ' + err.message, true);
      }
    }

    function updateEmbedPreview() {
      const title = document.getElementById('embed-title').value || 'Embed Title Preview';
      const desc = document.getElementById('embed-desc').value || 'Embed description preview will appear here in real-time...';
      const footer = document.getElementById('embed-footer').value || 'Monroe County Management';
      const color = document.getElementById('embed-color').value || '#5865F2';

      document.getElementById('preview-title').innerText = title;
      document.getElementById('preview-desc').innerText = desc;
      document.getElementById('preview-footer').innerText = footer;
      document.getElementById('embed-preview-box').style.borderLeftColor = color;
    }

    async function sendEmbed() {
      const channelId = document.getElementById('embed-channel-select').value;
      const title = document.getElementById('embed-title').value.trim();
      const description = document.getElementById('embed-desc').value.trim();
      const color = document.getElementById('embed-color').value;
      const footerText = document.getElementById('embed-footer').value.trim();
      const imageUrl = document.getElementById('embed-image').value.trim();

      if (!channelId || (!title && !description)) {
        return alert('Please select a channel and provide a title or description.');
      }

      try {
        const res = await fetch('/api/send-embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, title, description, color, footerText, imageUrl })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ Embed sent to Discord channel!');
        } else {
          showToast('❌ Failed: ' + data.error, true);
        }
      } catch (err) {
        showToast('❌ Error: ' + err.message, true);
      }
    }

    async function deployPanel(panelType) {
      const channelId = document.getElementById('panel-channel-select').value;
      if (!channelId) return alert('Please select a target channel.');

      try {
        const res = await fetch('/api/deploy-panel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, panelType })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ Panel successfully deployed to Discord!');
        } else {
          showToast('❌ Failed: ' + data.error, true);
        }
      } catch (err) {
        showToast('❌ Error: ' + err.message, true);
      }
    }

    function quickDeploy(panelType) {
      switchTab('panels');
      setTimeout(() => deployPanel(panelType), 200);
    }

    async function channelAction(action, val = null) {
      const channelId = document.getElementById('mod-channel-select').value;
      if (!channelId) return alert('Please select a channel.');

      let value = val;
      if (action === 'purge') value = document.getElementById('purge-amount').value;
      if (action === 'slowmode') value = document.getElementById('slowmode-seconds').value;

      try {
        const res = await fetch('/api/action/channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, action, value })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ ' + (data.message || 'Action completed!'));
        } else {
          showToast('❌ Failed: ' + data.error, true);
        }
      } catch (err) {
        showToast('❌ Error: ' + err.message, true);
      }
    }

    async function reviewApp(appId, decision) {
      const reason = prompt(\`Enter \${decision === 'accept' ? 'welcome notes' : 'denial reason'} for applicant:\`, decision === 'accept' ? 'Welcome to the team!' : 'Thank you for applying, but we require more experience.');
      if (reason === null) return;

      try {
        const res = await fetch('/api/action/review-app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId, decision, reason, reviewer: 'Dashboard Admin' })
        });
        const data = await res.json();
        if (data.success) {
          showToast(\`✅ Application \${decision.toUpperCase()}ED!\`);
          fetchStatus();
        } else {
          showToast('❌ Failed: ' + data.error, true);
        }
      } catch (err) {
        showToast('❌ Error: ' + err.message, true);
      }
    }

    function updateWelcomerPreview() {
      const desc = document.getElementById('welcomer-desc').value || 'Welcome @NewMember to Monroe County! You are member #1,250!';
      document.getElementById('welcomer-preview-desc').innerText = desc
        .replace(/{user}/g, '@NewMember')
        .replace(/{server}/g, 'Monroe County')
        .replace(/{memberCount}/g, '1,250')
        .replace(/{accountAge}/g, '3 days ago');
    }

    async function saveWelcomerSettings() {
      const channelId = document.getElementById('welcomer-channel-select').value;
      const enabled = document.getElementById('welcomer-enabled-select').value === 'true';
      const description = document.getElementById('welcomer-desc').value.trim();
      const autoRoleId = document.getElementById('welcomer-autorole').value.trim();
      const dmEnabled = document.getElementById('welcomer-dm-enabled').value === 'true';
      const dmMessage = document.getElementById('welcomer-dm-text').value.trim();

      try {
        const res = await fetch('/api/action/welcomer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, enabled, description, autoRoleId, dmEnabled, dmMessage })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ Welcomer configuration saved successfully!');
        } else {
          showToast('❌ Failed: ' + data.error, true);
        }
      } catch (err) {
        showToast('❌ Error: ' + err.message, true);
      }
    }

    async function testWelcomer() {
      const channelId = document.getElementById('welcomer-channel-select').value;
      if (!channelId) return alert('Please select a welcome channel.');

      try {
        const res = await fetch('/api/action/welcomer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'test', channelId })
        });
        const data = await res.json();
        if (data.success) {
          showToast('✅ ' + (data.message || 'Test welcome message sent!'));
        } else {
          showToast('❌ Failed: ' + data.error, true);
        }
      } catch (err) {
        showToast('❌ Error: ' + err.message, true);
      }
    }

    async function loadSettings(showNotification = false) {
      try {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.success && data.config) {
          currentConfigData = data.config;
          const c = data.config;

          if (document.getElementById('cfg-shift-log-select')) document.getElementById('cfg-shift-log-select').value = c.shiftLogChannelId || '';
          if (document.getElementById('cfg-app-log-select')) document.getElementById('cfg-app-log-select').value = c.appLogChannelId || '';
          if (document.getElementById('cfg-log-select')) document.getElementById('cfg-log-select').value = c.logChannelId || '';
          if (document.getElementById('cfg-bibi-select')) document.getElementById('cfg-bibi-select').value = c.bibiChannelId || '';
          if (document.getElementById('cfg-default-category')) document.getElementById('cfg-default-category').value = c.defaultCategoryId || '';
          if (document.getElementById('cfg-reviews-channel')) document.getElementById('cfg-reviews-channel').value = c.reviewsChannelId || '';

          if (document.getElementById('cfg-staff-roles')) document.getElementById('cfg-staff-roles').value = (c.staffRoleIds || []).join(', ');
          if (document.getElementById('cfg-staff-accepted-role')) document.getElementById('cfg-staff-accepted-role').value = c.staffAcceptedRoleId || '1536402083438133297';
          if (document.getElementById('cfg-ping-role')) document.getElementById('cfg-ping-role').value = c.pingRoleId || '';
          if (document.getElementById('cfg-anti-ping-whitelist')) document.getElementById('cfg-anti-ping-whitelist').value = (c.whitelistedAntiPingIds || []).join(', ');
          if (document.getElementById('cfg-allowed-ping-categories')) document.getElementById('cfg-allowed-ping-categories').value = (c.allowedMassPingCategoryIds || []).join(', ');

          if (document.getElementById('cfg-roblox-universe')) document.getElementById('cfg-roblox-universe').value = c.robloxUniverseId || '';
          if (document.getElementById('cfg-roblox-key')) document.getElementById('cfg-roblox-key').value = c.robloxApiKey || '';
          if (document.getElementById('cfg-roblox-webhook')) document.getElementById('cfg-roblox-webhook').value = c.robloxWebhookUrl || '';

          if (c.panel) {
            if (document.getElementById('cfg-panel-title')) document.getElementById('cfg-panel-title').value = c.panel.title || '';
            if (document.getElementById('cfg-panel-desc')) document.getElementById('cfg-panel-desc').value = c.panel.description || '';
            if (document.getElementById('cfg-panel-color')) document.getElementById('cfg-panel-color').value = c.panel.color || '#5865F2';
            if (document.getElementById('cfg-panel-footer')) document.getElementById('cfg-panel-footer').value = c.panel.footer || '';
          }

          if (showNotification) showToast('✅ Settings loaded from server!');
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }

    async function saveSettings() {
      try {
        const payload = {
          shiftLogChannelId: document.getElementById('cfg-shift-log-select')?.value || '',
          appLogChannelId: document.getElementById('cfg-app-log-select')?.value || '',
          logChannelId: document.getElementById('cfg-log-select')?.value || '',
          bibiChannelId: document.getElementById('cfg-bibi-select')?.value || '',
          defaultCategoryId: document.getElementById('cfg-default-category')?.value || '',
          reviewsChannelId: document.getElementById('cfg-reviews-channel')?.value || '',
          staffRoleIds: document.getElementById('cfg-staff-roles')?.value || '',
          staffAcceptedRoleId: document.getElementById('cfg-staff-accepted-role')?.value || '1536402083438133297',
          pingRoleId: document.getElementById('cfg-ping-role')?.value || '',
          whitelistedAntiPingIds: document.getElementById('cfg-anti-ping-whitelist')?.value || '',
          allowedMassPingCategoryIds: document.getElementById('cfg-allowed-ping-categories')?.value || '',
          robloxUniverseId: document.getElementById('cfg-roblox-universe')?.value || '',
          robloxApiKey: document.getElementById('cfg-roblox-key')?.value || '',
          robloxWebhookUrl: document.getElementById('cfg-roblox-webhook')?.value || '',
          panel: {
            title: document.getElementById('cfg-panel-title')?.value || '',
            description: document.getElementById('cfg-panel-desc')?.value || '',
            color: document.getElementById('cfg-panel-color')?.value || '#5865F2',
            footer: document.getElementById('cfg-panel-footer')?.value || ''
          }
        };

        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          showToast('💾 Server settings saved & applied live!');
        } else {
          showToast('❌ Error: ' + data.error, true);
        }
      } catch (err) {
        showToast('❌ Error saving: ' + err.message, true);
      }
    }

    // Leaderboards Fetcher and Renderer
    async function fetchLeaderboards(showNotification = false) {
      try {
        const res = await fetch('/api/leaderboards');
        const data = await res.json();
        if (data.success) {
          renderLeaderboards(data);
          if (showNotification) showToast('✅ Leaderboards refreshed!');
        }
      } catch (err) {
        console.error('Error fetching leaderboards:', err);
      }
    }

    function renderLeaderboards(data) {
      // 1. Summary Cards
      const sum = data.summary || {};
      if (sum.topStaff) {
        document.getElementById('lb-top-staff').innerText = sum.topStaff.userTag;
        document.getElementById('lb-top-staff-sub').innerText = \`\${sum.topStaff.formattedTotal} · \${sum.topStaff.totalShifts} shift\${sum.topStaff.totalShifts === 1 ? '' : 's'}\`;
      } else {
        document.getElementById('lb-top-staff').innerText = 'No Shifts Yet';
        document.getElementById('lb-top-staff-sub').innerText = '0 hrs · 0 shifts';
      }

      document.getElementById('lb-total-time').innerText = sum.formattedServerMs || '0 hrs';
      document.getElementById('lb-total-shifts').innerText = sum.totalServerShifts || 0;
      document.getElementById('lb-total-staff-sub').innerText = \`\${sum.totalStaffTracked || 0} active staff tracked\`;

      if (sum.topReviewer) {
        document.getElementById('lb-top-reviewer').innerText = sum.topReviewer.reviewerTag;
        document.getElementById('lb-top-reviewer-sub').innerText = \`\${sum.topReviewer.totalReviewed} processed (\${sum.topReviewer.acceptanceRate}% accepted)\`;
      } else {
        document.getElementById('lb-top-reviewer').innerText = 'No Reviews Yet';
        document.getElementById('lb-top-reviewer-sub').innerText = '0 applications processed';
      }

      // 2. Shifts Leaderboard Table
      const shiftsTbody = document.getElementById('lb-shifts-tbody');
      if (shiftsTbody) {
        const list = data.shiftsLeaderboard || [];
        if (list.length === 0) {
          shiftsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No staff shift records logged yet. Use Clocky Duty to start logging!</td></tr>';
        } else {
          shiftsTbody.innerHTML = list.map((s, idx) => {
            const rank = idx + 1;
            let rankBadge = \`<span class="rank-badge rank-other">#\${rank}</span>\`;
            if (rank === 1) rankBadge = '<span class="rank-badge rank-1">👑 1</span>';
            else if (rank === 2) rankBadge = '<span class="rank-badge rank-2">🥈 2</span>';
            else if (rank === 3) rankBadge = '<span class="rank-badge rank-3">🥉 3</span>';

            const lastActiveStr = s.lastShiftEnd ? new Date(s.lastShiftEnd).toLocaleDateString() : 'Active Recently';

            return \`
              <tr>
                <td>\${rankBadge}</td>
                <td><strong>\${s.userTag}</strong></td>
                <td><strong style="color: var(--accent);">\${s.formattedTotal}</strong></td>
                <td>\${s.totalShifts} shift\${s.totalShifts === 1 ? '' : 's'}</td>
                <td>\${s.formattedAvg}</td>
                <td><small style="color: var(--text-muted);">\${lastActiveStr}</small></td>
              </tr>
            \`;
          }).join('');
        }
      }

      // 3. Application Reviewers Leaderboard Table
      const reviewsTbody = document.getElementById('lb-reviews-tbody');
      if (reviewsTbody) {
        const rList = data.reviewsLeaderboard || [];
        if (rList.length === 0) {
          reviewsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No application reviews processed yet.</td></tr>';
        } else {
          reviewsTbody.innerHTML = rList.map((r, idx) => {
            const rank = idx + 1;
            let rankBadge = \`<span class="rank-badge rank-other">#\${rank}</span>\`;
            if (rank === 1) rankBadge = '<span class="rank-badge rank-1">👑 1</span>';
            else if (rank === 2) rankBadge = '<span class="rank-badge rank-2">🥈 2</span>';
            else if (rank === 3) rankBadge = '<span class="rank-badge rank-3">🥉 3</span>';

            return \`
              <tr>
                <td>\${rankBadge}</td>
                <td><strong>\${r.reviewerTag}</strong></td>
                <td><strong>\${r.totalReviewed}</strong></td>
                <td><span style="color: var(--accent); font-weight: 700;">\${r.accepted}</span></td>
                <td><span style="color: var(--danger); font-weight: 700;">\${r.denied}</span></td>
                <td><span class="tag-badge \${r.acceptanceRate >= 50 ? 'tag-working' : 'tag-pending'}">\${r.acceptanceRate}%</span></td>
              </tr>
            \`;
          }).join('');
        }
      }

      // 4. Recent Applications Activity Table
      const recentAppsTbody = document.getElementById('lb-recent-apps-tbody');
      if (recentAppsTbody) {
        const aList = data.recentApplications || [];
        if (aList.length === 0) {
          recentAppsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No staff applications submitted yet.</td></tr>';
        } else {
          recentAppsTbody.innerHTML = aList.map(a => {
            let badgeClass = 'tag-pending';
            if (a.status === 'ACCEPTED') badgeClass = 'tag-accepted';
            if (a.status === 'DENIED') badgeClass = 'tag-denied';

            const submittedStr = new Date(a.submittedAt).toLocaleDateString();

            return \`
              <tr>
                <td><strong>\${a.userTag}</strong></td>
                <td>\${submittedStr}</td>
                <td><span class="tag-badge \${badgeClass}">\${a.status}</span></td>
                <td>\${a.reviewedBy ? \`<strong>\${a.reviewedBy}</strong>\` : '<em style="color: var(--text-muted);">Pending Review</em>'}</td>
                <td><small style="color: var(--text-muted);">\${a.reviewReason || 'None'}</small></td>
              </tr>
            \`;
          }).join('');
        }
      }
    }

    // Initial Load & Auto-Refresh
    fetchStatus();
    loadSettings();
    fetchDynamicCommands();
    fetchLeaderboards();
    setInterval(() => {
      fetchStatus();
      if (document.getElementById('tab-leaderboards')?.classList.contains('active')) {
        fetchLeaderboards();
      }
    }, 6000);
  </script>
</body>
</html>`;
}

module.exports = {
  handleDashboardRequest,
  renderDashboard: renderDashboardHtml
};
