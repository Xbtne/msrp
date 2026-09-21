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
    const action = guildConfig.action || 'timeout';

    // 1. Delete message immediately
    await message.delete().catch(() => {});

    // 2. DM user alert
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`🚨 Security Quarantine Alert: ${message.guild.name}`)
        .setDescription(
          `Your Discord account just sent a message into a designated **Compromised Account Security Trap** channel in **${message.guild.name}**.\n\n` +
          `🔒 **Why did this happen?**\n` +
          `Compromised / hacked accounts and spam bots automatically post links across all channels in a server. To protect our community, your account was automatically **${action === 'ban' ? 'banned' : action === 'kick' ? 'kicked' : 'timed out for 28 days'}**.\n\n` +
          `🛡️ **What you should do now:**\n` +
          `1. Change your Discord password immediately.\n` +
          `2. Enable Two-Factor Authentication (2FA).\n` +
          `3. Scan your PC for malware and remove suspicious Authorized Apps under Discord Settings.\n` +
          `4. Once your account is secure, reach out to staff to appeal.`
        )
        .setColor(0xED4245)
        .setTimestamp();

      await offender.send({ embeds: [dmEmbed] });
    } catch (dmErr) {
      console.log(`Could not DM user ${offender.id} (DMs closed)`);
    }

    // 3. Apply Punishment
    let actionTaken = 'Unknown';
    try {
      if (action === 'ban') {
        if (member?.bannable) {
          await member.ban({ deleteMessageSeconds: 86400, reason: 'Compromised Account Honeypot Trigger' });
          actionTaken = '🔨 Permanent Ban & Message Purge';
        }
      } else if (action === 'kick') {
        if (member?.kickable) {
          await member.kick('Compromised Account Honeypot Trigger');
          actionTaken = '👢 Kicked from Server';
        }
      } else {
        // Default: 28-day timeout
        if (member?.moderatable) {
          const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
          await member.timeout(maxTimeoutMs, 'Compromised Account Honeypot Trigger');
          actionTaken = '⏳ 28-Day Timeout (Quarantine)';
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
