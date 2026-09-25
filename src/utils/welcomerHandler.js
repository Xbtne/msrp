const { EmbedBuilder } = require('discord.js');
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

  // If not configured in welcomer.json, check config.json or environment
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

  const createdUnix = Math.floor(user.createdTimestamp / 1000);
  const joinedUnix = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : Math.floor(Date.now() / 1000);

  return text
    .replace(/{user}/g, `<@${user.id}>`)
    .replace(/{username}/g, user.username)
    .replace(/{user_tag}/g, user.tag || user.username)
    .replace(/{userId}/g, user.id)
    .replace(/{server}/g, guild.name)
    .replace(/{guild}/g, guild.name)
    .replace(/{memberCount}/g, (guild.memberCount || 1).toString())
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

  if (config.showAvatar !== false) {
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
 * Handles incoming new member join event
 */
async function handleMemberJoin(member) {
  if (member.user.bot) return;

  const config = getGuildWelcomerConfig(member.guild.id);
  if (!config.enabled) return;

  // 1. Auto-Role Assignment
  if (config.autoRoleId) {
    try {
      const role = member.guild.roles.cache.get(config.autoRoleId);
      if (role && member.guild.members.me.permissions.has('ManageRoles') && role.position < member.guild.members.me.roles.highest.position) {
        await member.roles.add(role, 'Auto-Role on Join');
      }
    } catch (roleErr) {
      console.warn('Failed to assign auto-role on join:', roleErr.message);
    }
  }

  // 2. Channel Welcome Embed
  if (config.channelId) {
    try {
      const channel =
        member.guild.channels.cache.get(config.channelId) ||
        (await member.guild.channels.fetch(config.channelId).catch(() => null));

      if (channel) {
        const welcomeEmbed = createWelcomeEmbed(config, member);
        await channel.send({
          content: `👋 Hey <@${member.id}>, welcome to **${member.guild.name}**!`,
          embeds: [welcomeEmbed]
        });
      }
    } catch (chErr) {
      console.error('Failed to send welcome message to channel:', chErr);
    }
  }

  // 3. Optional DM Welcome Message
  if (config.dmEnabled && config.dmMessage) {
    try {
      const dmText = formatWelcomeText(config.dmMessage, member);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`👋 Welcome to ${member.guild.name}!`)
        .setDescription(dmText)
        .setColor(parseInt((config.color || '#5865F2').replace('#', ''), 16) || 0x5865F2)
        .setThumbnail(member.guild.iconURL({ dynamic: true }) || undefined)
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] });
    } catch (dmErr) {
      console.log(`Could not DM welcome message to ${member.user.tag} (DMs closed)`);
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
  handleMemberJoin,
  sendTestWelcome
};
