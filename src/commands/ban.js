const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName('target').setDescription('The member to ban').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the ban').setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('delete_messages')
        .setDescription('Number of days of message history to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_messages') || 0;

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (targetMember) {
      if (targetMember.id === interaction.guild.ownerId) {
        return interaction.reply({ content: '❌ You cannot ban the server owner.', ephemeral: true });
      }

      if (targetMember.id === interaction.user.id) {
        return interaction.reply({ content: '❌ You cannot ban yourself.', ephemeral: true });
      }

      if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({ content: '❌ You cannot ban this member because they have an equal or higher role than you.', ephemeral: true });
      }

      if (!targetMember.bannable) {
        return interaction.reply({ content: '❌ I cannot ban this member. Check my role hierarchy and permissions.', ephemeral: true });
      }

      // Send DM to user before ban
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`🔨 You were banned from ${interaction.guild.name}`)
          .setDescription(`**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)
          .setColor(0xED4245)
          .setTimestamp();
        await targetMember.send({ embeds: [dmEmbed] });
      } catch (err) {
        // DM failed, continue ban
      }
    }

    try {
      await interaction.guild.members.ban(targetUser.id, {
        deleteMessageSeconds: deleteDays * 86400,
        reason: `${reason} | Banned by ${interaction.user.tag}`
      });

      const banEmbed = new EmbedBuilder()
        .setTitle('🔨 Member Banned')
        .setColor(0xED4245)
        .addFields(
          { name: 'Target', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      return interaction.reply({ embeds: [banEmbed] });
    } catch (err) {
      console.error('Ban error:', err);
      return interaction.reply({ content: `❌ Failed to ban user: ${err.message}`, ephemeral: true });
    }
  }
};
