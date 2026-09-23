const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

function parseDuration(str) {
  const match = str.match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member or remove a timeout')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Place a member in timeout')
        .addUserOption(opt => opt.setName('target').setDescription('The member to timeout').setRequired(true))
        .addStringOption(opt =>
          opt
            .setName('duration')
            .setDescription('Duration (e.g., 60s, 10m, 2h, 1d, max 28d)')
            .setRequired(true)
        )
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for timeout').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove timeout from a member')
        .addUserOption(opt => opt.setName('target').setDescription('The member to untimeout').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (e) {}

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: '❌ That member is not in this server.' });
    }

    if (targetMember.id === interaction.guild.ownerId) {
      return interaction.editReply({ content: '❌ You cannot timeout the server owner.' });
    }

    if (targetMember.id === interaction.user.id) {
      return interaction.editReply({ content: '❌ You cannot timeout yourself.' });
    }

    if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.editReply({ content: '❌ You cannot moderate this member due to role hierarchy.' });
    }

    if (!targetMember.moderatable) {
      return interaction.editReply({ content: '❌ I cannot moderate this member. Check my role hierarchy.' });
    }

    if (subcommand === 'set') {
      const durationStr = interaction.options.getString('duration');
      const durationMs = parseDuration(durationStr);

      if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000) {
        return interaction.editReply({
          content: '❌ Invalid duration. Please provide a duration like `60s`, `10m`, `2h`, or `1d` (up to 28 days).'
        });
      }

      try {
        await targetMember.timeout(durationMs, `${reason} | Timed out by ${interaction.user.tag}`);

        const embed = new EmbedBuilder()
          .setTitle('⏳ Member Timed Out')
          .setColor(0xED4245)
          .addFields(
            { name: 'Target', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
            { name: 'Duration', value: `\`${durationStr}\``, inline: true },
            { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason, inline: false }
          )
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('Timeout error:', err);
        return interaction.editReply({ content: `❌ Failed to timeout: ${err.message}` });
      }
    } else if (subcommand === 'remove') {
      try {
        await targetMember.timeout(null, `${reason} | Timeout removed by ${interaction.user.tag}`);

        const embed = new EmbedBuilder()
          .setTitle('⏱️ Timeout Removed')
          .setColor(0x57F287)
          .addFields(
            { name: 'Target', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
            { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Reason', value: reason, inline: false }
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('Untimeout error:', err);
        return interaction.editReply({ content: `❌ Failed to remove timeout: ${err.message}` });
      }
    }
  }
};
