const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { hasActiveTask, startDmTestTask } = require('../utils/dmTestManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spamdm')
    .setDescription('Send a controlled series of test DM messages to a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user to receive the test DM messages')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('message')
        .setDescription('The message content to send')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('count')
        .setDescription('Number of test messages (0 for infinite until /stopspam)')
        .setMinValue(0)
        .setRequired(true)
    )
    .addNumberOption(opt =>
      opt
        .setName('delay')
        .setDescription('Delay between messages in seconds (min 1.0s, default 1.0s)')
        .setMinValue(1.0)
        .setMaxValue(30.0)
        .setRequired(false)
    ),

  async execute(interaction) {
    // 1. Permission check: Administrator or Guild Owner only
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.user.id === interaction.guild?.ownerId;

    if (!isAdmin) {
      return interaction.reply({
        content: '❌ **Access Denied:** Only administrators and server owners can use the DM testing command.',
        ephemeral: true
      });
    }

    const targetUser = interaction.options.getUser('user');
    const message = interaction.options.getString('message');
    const count = interaction.options.getInteger('count');
    const delaySeconds = interaction.options.getNumber('delay') || 1.0;
    const delayMs = Math.round(delaySeconds * 1000);

    // 2. Validate Target User
    if (targetUser.bot) {
      return interaction.reply({
        content: '❌ Cannot send test DMs to a bot user.',
        ephemeral: true
      });
    }

    // 3. Check for existing active tasks
    if (hasActiveTask(targetUser.id)) {
      return interaction.reply({
        content: `⚠️ An active DM test is already running for <@${targetUser.id}>. Use \`/stopspam <user>\` to cancel it first.`,
        ephemeral: true
      });
    }

    const countDisplay = count === 0 ? '♾️ Infinite (until /stopspam)' : `\`${count}\``;

    // 4. Send initial confirmation embed
    const startEmbed = new EmbedBuilder()
      .setTitle('🚀 DM Test Session Started')
      .setDescription(
        `Starting background DM test session for <@${targetUser.id}>.\n\n` +
        `• **Target User:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
        `• **Message Count:** ${countDisplay}\n` +
        `• **Interval:** \`${delaySeconds.toFixed(1)}s\`\n` +
        `• **Initiated By:** <@${interaction.user.id}>\n` +
        `• **Message Content:**\n\`\`\`\n${message.length > 500 ? message.slice(0, 497) + '...' : message}\n\`\`\`\n` +
        `*Messages are being dispatched asynchronously. You can stop this session anytime with \`/stopspam <user>\`.*`
      )
      .setColor(0x57F287)
      .setFooter({ text: 'Monroe County DM Testing & Diagnostics' })
      .setTimestamp();

    await interaction.reply({
      embeds: [startEmbed]
    });

    // 5. Launch async sending task immediately in background
    startDmTestTask({
      targetUser,
      adminUser: interaction.user,
      messageText: message,
      count,
      delayMs,
      channel: interaction.channel
    });
  }
};
