const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const warningsPath = path.join(__dirname, '../../data/warnings.json');

function getWarnings() {
  try {
    if (!fs.existsSync(warningsPath)) {
      fs.writeFileSync(warningsPath, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(warningsPath, 'utf8'));
  } catch (err) {
    console.error('Error reading warnings:', err);
    return {};
  }
}

function saveWarnings(data) {
  try {
    fs.writeFileSync(warningsPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving warnings:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Manage user warnings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Issue a warning to a member')
        .addUserOption(opt => opt.setName('target').setDescription('The member to warn').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for warning').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('View warnings for a member')
        .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Clear all warnings for a member')
        .addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');
    const guildId = interaction.guild.id;
    const warnings = getWarnings();

    if (!warnings[guildId]) warnings[guildId] = {};
    if (!warnings[guildId][targetUser.id]) warnings[guildId][targetUser.id] = [];

    if (subcommand === 'add') {
      const reason = interaction.options.getString('reason');
      const warnEntry = {
        id: Date.now().toString(36),
        reason: reason,
        moderator: interaction.user.tag,
        moderatorId: interaction.user.id,
        date: new Date().toISOString()
      };

      warnings[guildId][targetUser.id].push(warnEntry);
      saveWarnings(warnings);

      // DM target if possible
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`⚠️ You received a warning in ${interaction.guild.name}`)
          .setDescription(`**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)
          .setColor(0xFEE75C)
          .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] });
      } catch (e) {}

      const warnEmbed = new EmbedBuilder()
        .setTitle('⚠️ Member Warned')
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Target', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
          { name: 'Total Warnings', value: `${warnings[guildId][targetUser.id].length}`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      return interaction.reply({ embeds: [warnEmbed] });
    } else if (subcommand === 'list') {
      const userWarns = warnings[guildId][targetUser.id];

      if (!userWarns || userWarns.length === 0) {
        return interaction.reply({
          content: `✅ <@${targetUser.id}> has no warnings in this server.`,
          ephemeral: true
        });
      }

      const listEmbed = new EmbedBuilder()
        .setTitle(`📋 Warnings for ${targetUser.tag}`)
        .setDescription(
          userWarns
            .map(
              (w, idx) =>
                `**${idx + 1}.** \`${w.id}\` — **${w.reason}**\n*By:* <@${w.moderatorId}> on <t:${Math.floor(
                  new Date(w.date).getTime() / 1000
                )}:D>`
            )
            .join('\n\n')
        )
        .setColor(0x5865F2)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Total Warnings: ${userWarns.length}` });

      return interaction.reply({ embeds: [listEmbed] });
    } else if (subcommand === 'clear') {
      const count = warnings[guildId][targetUser.id].length;
      warnings[guildId][targetUser.id] = [];
      saveWarnings(warnings);

      return interaction.reply({
        content: `✅ Cleared **${count}** warning(s) for <@${targetUser.id}>.`,
        ephemeral: false
      });
    }
  }
};
