const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./ticketHandler');

const welcomerDataPath = path.join(__dirname, '../../data/welcomer.json');

const DEFAULT_CONFIG = {
  enabled: true,
  channelId: null,
  title: '👋 Welcome to {server}!',
  description: 'Welcome {user} to **{server}**!\n\n👥 **Member Count:** `#{memberCount}`\n📅 **Account Created:** {accountAge}\n📜 **Getting Started:** Make sure to check our rules and announcements!\n\n*Enjoy your stay!*',
  color: '#5865F2',
  footer: 'Monroe County Community',
  showAvatar: true,
  dmEnabled: false,
  dmMessage: '👋 Welcome to **{server}**, {user}!\n\nWe are excited to have you in our community. Please make sure to read through the rules and reach out via tickets if you need any assistance!',
  autoRoleId: null
};

function getWelcomerData() {
  try {
    if (!fs.existsSync(welcomerDataPath)) {
      fs.writeFileSync(welcomerDataPath, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(welcomerDataPath, 'utf8'));
  } catch (err) {
    console.error('Error reading welcomer.json:', err);
    return {};
  }
}

function saveWelcomerData(data) {
  try {
    fs.writeFileSync(welcomerDataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving welcomer.json:', err);
  }
}

function getGuildWelcomerConfig(guildId) {
  const data = getWelcomerData();
  const botConfig = getConfig();

  const guildConfig = data[guildId] || {};
  return {
    ...DEFAULT_CONFIG,
    channelId: guildConfig.channelId || botConfig.welcomeChannelId || process.env.WELCOME_CHANNEL_ID || null,
    ...guildConfig
  };
}

function setGuildWelcomerConfig(guildId, updates) {
  const data = getWelcomerData();
  data[guildId] = {
    ...getGuildWelcomerConfig(guildId),
    ...updates
  };
  saveWelcomerData(data);
  return data[guildId];
}

/**
 * Replaces placeholder variables with live member data
 */
function formatWelcomeText(text, member) {
  if (!text) return '';
  const guild = member.guild;
  const user = member.user;

  const createdUnix = user?.createdTimestamp ? Math.floor(user.createdTimestamp / 1000) : Math.floor(Date.now() / 1000);
  const joinedUnix = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : Math.floor(Date.now() / 1000);
  const memberCount = guild.memberCount || 1;

  return text
    .replace(/{user}/g, `<@${user.id}>`)
    .replace(/{username}/g, user.username || 'Member')
    .replace(/{user_tag}/g, user.tag || user.username || 'Member')
    .replace(/{userId}/g, user.id)
    .replace(/{server}/g, guild.name)
    .replace(/{guild}/g, guild.name)
    .replace(/{memberCount}/g, memberCount.toLocaleString())
    .replace(/{accountAge}/g, `<t:${createdUnix}:R>`)
    .replace(/{joinDate}/g, `<t:${joinedUnix}:f>`);
}

/**
 * Builds the Welcome Embed for a member
 */
function createWelcomeEmbed(config, member) {
  const title = formatWelcomeText(config.title || DEFAULT_CONFIG.title, member);
  const description = formatWelcomeText(config.description || DEFAULT_CONFIG.description, member);
  const footerText = formatWelcomeText(config.footer || DEFAULT_CONFIG.footer, member);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(parseInt((config.color || '#5865F2').replace('#', ''), 16) || 0x5865F2)
    .setTimestamp();

  if (config.showAvatar !== false && member.user?.displayAvatarURL) {
    embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
  }

  if (footerText) {
    embed.setFooter({
      text: footerText,
      iconURL: member.guild.iconURL({ dynamic: true }) || undefined
    });
  }

  return embed;
}

/**
 * Resolves the best available welcome channel for a guild with 24/7 auto-discovery
 */
async function resolveWelcomeChannel(guild, configuredChannelId = null) {
  // 1. Try explicitly configured channel ID
  if (configuredChannelId) {
    const ch = guild.channels.cache.get(configuredChannelId) || (await guild.channels.fetch(configuredChannelId).catch(() => null));
    if (ch && ch.type === ChannelType.GuildText) {
      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      if (!me || ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return ch;
      }
    }
  }

  // 2. Try searching by common welcome channel names
  const welcomeNames = ['welcome', 'welcomes', 'welcome-chat', 'joins', 'arrivals', 'general', 'main-chat', 'chat', 'lounge'];
  for (const name of welcomeNames) {
    const found = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText &&
      c.name.toLowerCase().includes(name)
    );
    if (found) {
      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      if (!me || found.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return found;
      }
    }
  }

  // 3. Try guild system channel
  if (guild.systemChannelId) {
    const sysCh = guild.channels.cache.get(guild.systemChannelId) || (await guild.channels.fetch(guild.systemChannelId).catch(() => null));
    if (sysCh && sysCh.type === ChannelType.GuildText) {
      return sysCh;
    }
  }

  // 4. Fallback: First text channel where the bot has SendMessages permission
  const fallback = guild.channels.cache.find(c => {
    if (c.type !== ChannelType.GuildText) return false;
    const me = guild.members.me;
    return !me || c.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
  });

  return fallback || null;
}

/**
 * Handles incoming new member join event with 24/7 resilience
 */
async function handleMemberJoin(member) {
  if (!member || !member.guild) return;
  if (member.user && member.user.bot) return;

  // Ensure full member object is loaded
  if (member.partial) {
    try {
      member = await member.fetch();
    } catch (e) {
      console.warn('Could not fetch full member object:', e.message);
    }
  }

  const guild = member.guild;
  const config = getGuildWelcomerConfig(guild.id);
  if (!config.enabled) return;

  console.log(`👋 [Welcomer] New member joined ${guild.name}: ${member.user?.tag || member.id} (Member #${guild.memberCount})`);

  // 1. Bulletproof Auto-Role Assignment
  if (config.autoRoleId) {
    try {
      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      const role = guild.roles.cache.get(config.autoRoleId) || (await guild.roles.fetch(config.autoRoleId).catch(() => null));

      if (role && me) {
        const botCanManage = me.permissions.has(PermissionFlagsBits.ManageRoles);
        const botRoleHigher = me.roles.highest.position > role.position;

        if (botCanManage && botRoleHigher) {
          await member.roles.add(role, 'Auto-Role on Join (24/7 Welcomer)').catch(err => {
            console.warn(`⚠️ Failed to add auto-role ${role.name}:`, err.message);
          });
          console.log(`✅ [Welcomer] Auto-role @${role.name} assigned to ${member.user?.tag}`);
        } else {
          console.warn(`⚠️ [Welcomer] Cannot assign auto-role: Bot lacks ManageRoles or role is higher than bot's highest role.`);
        }
      }
    } catch (roleErr) {
      console.warn('⚠️ [Welcomer] Error during auto-role assignment:', roleErr.message);
    }
  }

  // 2. Robust Channel Welcome Message Dispatch
  try {
    const welcomeChannel = await resolveWelcomeChannel(guild, config.channelId);

    if (welcomeChannel) {
      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      const canEmbed = !me || welcomeChannel.permissionsFor(me)?.has(PermissionFlagsBits.EmbedLinks);

      if (canEmbed) {
        const welcomeEmbed = createWelcomeEmbed(config, member);
        await welcomeChannel.send({
          content: `👋 Hey <@${member.id}>, welcome to **${guild.name}**!`,
          embeds: [welcomeEmbed]
        });
      } else {
        // Text-only fallback if EmbedLinks is disabled in that channel
        const descText = formatWelcomeText(config.description || DEFAULT_CONFIG.description, member);
        await welcomeChannel.send({
          content: `👋 Hey <@${member.id}>, welcome to **${guild.name}**!\n\n${descText}`
        });
      }

      // Auto-save the resolved channel if not configured yet
      if (!config.channelId) {
        setGuildWelcomerConfig(guild.id, { channelId: welcomeChannel.id });
      }

      console.log(`✅ [Welcomer] Welcome message sent to #${welcomeChannel.name}`);
    } else {
      console.warn(`⚠️ [Welcomer] No suitable welcome channel found in ${guild.name}.`);
    }
  } catch (chErr) {
    console.error('❌ [Welcomer] Failed to send welcome message to channel:', chErr.message);
  }

  // 3. Optional DM Welcome Message
  if (config.dmEnabled && config.dmMessage && member.user) {
    try {
      const dmText = formatWelcomeText(config.dmMessage, member);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`👋 Welcome to ${guild.name}!`)
        .setDescription(dmText)
        .setColor(parseInt((config.color || '#5865F2').replace('#', ''), 16) || 0x5865F2)
        .setThumbnail(guild.iconURL({ dynamic: true }) || undefined)
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] });
      console.log(`📬 [Welcomer] Welcome DM dispatched to ${member.user.tag}`);
    } catch (dmErr) {
      // DMs closed or member blocks bot - standard discord behavior
      console.log(`ℹ️ [Welcomer] Could not DM welcome message to ${member.user.tag} (DMs closed or blocked)`);
    }
  }
}

/**
 * Sends a simulated test welcome message into a channel
 */
async function sendTestWelcome(guild, channel, member) {
  const config = getGuildWelcomerConfig(guild.id);
  const welcomeEmbed = createWelcomeEmbed(config, member);

  return await channel.send({
    content: `🧪 **[TEST PREVIEW]** 👋 Hey <@${member.id}>, welcome to **${guild.name}**!`,
    embeds: [welcomeEmbed]
  });
}

module.exports = {
  getWelcomerData,
  saveWelcomerData,
  getGuildWelcomerConfig,
  setGuildWelcomerConfig,
  formatWelcomeText,
  createWelcomeEmbed,
  resolveWelcomeChannel,
  handleMemberJoin,
  sendTestWelcome
};

