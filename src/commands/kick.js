const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option.setName('target').setDescription('The member to kick').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the kick').setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: false });
      }
    } catch (e) {}

    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: '❌ That member is not in this server.' });
    }

    if (targetMember.id === interaction.guild.ownerId) {
      return interaction.editReply({ content: '❌ You cannot kick the server owner.' });
    }

    if (targetMember.id === interaction.user.id) {
      return interaction.editReply({ content: '❌ You cannot kick yourself.' });
    }

    if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.editReply({ content: '❌ You cannot kick this member because they have an equal or higher role than you.' });
    }

    if (!targetMember.kickable) {
      return interaction.editReply({ content: '❌ I cannot kick this member. Check my role hierarchy and permissions.' });
    }

    // Try to DM user before kicking
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`👢 You were kicked from ${interaction.guild.name}`)
        .setDescription(`**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)
        .setColor(0xFEE75C)
        .setTimestamp();
      await targetMember.send({ embeds: [dmEmbed] });
    } catch (err) {}

    try {
      await targetMember.kick(`${reason} | Kicked by ${interaction.user.tag}`);

      const kickEmbed = new EmbedBuilder()
        .setTitle('👢 Member Kicked')
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Target', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      return interaction.editReply({ embeds: [kickEmbed] });
    } catch (err) {
      console.error('Kick error:', err);
      return interaction.editReply({ content: `❌ Failed to kick user: ${err.message}` });
    }
  }
};
