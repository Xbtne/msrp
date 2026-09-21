const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isStaff, getConfig } = require('../utils/ticketHandler');

const securityDataPath = path.join(__dirname, '../../data/security.json');

function getSecurityData() {
  try {
    if (!fs.existsSync(securityDataPath)) return {};
    return JSON.parse(fs.readFileSync(securityDataPath, 'utf8'));
  } catch (err) {
    return {};
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;

    const securityData = getSecurityData();
    const guildConfig = securityData[message.guild.id];

    if (!guildConfig || !guildConfig.enabled || guildConfig.honeypotChannelId !== message.channel.id) {
      return;
    }

    // If staff/admin typed here, ignore or delete without punishment
    if (isStaff(message.member)) {
      return;
    }

    const offender = message.author;
    const member = message.member;
    const content = message.content || '*[No Text Content / Media Only]*';
    const action = guildConfig.action || 'ban';

    // 1. Delete message immediately
    await message.delete().catch(() => {});

    // 2. DM user alert
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`🚨 Security Ban Alert: ${message.guild.name}`)
        .setDescription(
          `Your Discord account was **permanently banned** from **${message.guild.name}** for sending a message into a designated **Compromised Account Security Trap**.\n\n` +
          `🔒 **Why did this happen?**\n` +
          `Compromised / hacked accounts and spam bots automatically blast scam links across all channels in a server. To protect our members and eliminate all spam, your account was banned and all recent messages were purged.\n\n` +
          `🛡️ **What you should do immediately:**\n` +
          `1. Change your Discord password immediately.\n` +
          `2. Enable Two-Factor Authentication (2FA).\n` +
          `3. Check and remove unknown Authorized Apps in your Discord Settings.\n` +
          `4. Once your account is secured, you may contact server leadership to submit an appeal.`
        )
        .setColor(0xED4245)
        .setTimestamp();

      await offender.send({ embeds: [dmEmbed] });
    } catch (dmErr) {
      console.log(`Could not DM user ${offender.id} (DMs closed)`);
    }

    // 3. Apply Punishment: Ban and purge 7 days of messages
    let actionTaken = 'Unknown';
    try {
      if (action === 'timeout' && member?.moderatable) {
        const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
        await member.timeout(maxTimeoutMs, 'Compromised Account Honeypot Trigger');
        actionTaken = '⏳ 28-Day Timeout (Quarantine)';
      } else if (action === 'kick' && member?.kickable) {
        await member.kick('Compromised Account Honeypot Trigger');
        actionTaken = '👢 Kicked from Server';
      } else {
        // Default: Full Ban and 7-day message purge across the whole server
        if (member?.bannable || !member) {
          await message.guild.members.ban(offender.id, {
            deleteMessageSeconds: 604800, // 7 Days message purge
            reason: 'Compromised Account Honeypot Trigger: Message Purged & Account Banned'
          });
          actionTaken = '🔨 Permanent Ban & 7-Day Message Purge';
        }
      }
    } catch (punishErr) {
      console.error('Error applying honeypot action:', punishErr);
      actionTaken = `⚠️ Failed to apply action: ${punishErr.message}`;
    }

    // 4. Send Log to Staff Log Channel
    const botConfig = getConfig();
    const logChannelId = botConfig.logChannelId;

    if (logChannelId) {
      const logChannel =
        message.guild.channels.cache.get(logChannelId) ||
        (await message.guild.channels.fetch(logChannelId).catch(() => null));

      if (logChannel) {
        const securityLogEmbed = new EmbedBuilder()
          .setTitle('🚨 Compromised Account Trap Triggered!')
          .setDescription(
            `A potential compromised account or spam bot was detected and neutralized.\n\n` +
            `• **Offender:** <@${offender.id}> (\`${offender.tag}\` • \`${offender.id}\`)\n` +
            `• **Honeypot Channel:** ${message.channel}\n` +
            `• **Action Applied:** **${actionTaken}**\n` +
            `• **Message Intercepted:**\n\`\`\`\n${content.slice(0, 900)}\n\`\`\``
          )
          .setColor(0xED4245)
          .setThumbnail(offender.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: 'Monroe County Automated Security' })
          .setTimestamp();

        await logChannel.send({ embeds: [securityLogEmbed] }).catch(console.error);
      }
    }

    // 5. Temporary warning in Honeypot channel
    try {
      const tempWarning = await message.channel.send({
        content: `🚨 <@${offender.id}> typed in the honeypot and was automatically quarantined (${actionTaken}).`
      });
      setTimeout(() => {
        tempWarning.delete().catch(() => {});
      }, 7000);
    } catch (tempErr) {}
  }
};
