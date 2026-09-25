const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const {
  getGuildWelcomerConfig,
  setGuildWelcomerConfig,
  sendTestWelcome
} = require('../utils/welcomerHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcomer')
    .setDescription('Configure server welcome messages, auto-roles, and member greetings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('channel')
        .setDescription('Set the channel where welcome cards will be posted')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Target welcome channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('message')
        .setDescription('Customize the welcome message description')
        .addStringOption(opt =>
          opt
            .setName('text')
            .setDescription('Welcome text (Variables: {user}, {server}, {memberCount}, {accountAge})')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('autorole')
        .setDescription('Set a role to automatically give new members when they join')
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('Role to assign on join (leave empty to disable)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('dm')
        .setDescription('Configure DM welcome messages to new members')
        .addBooleanOption(opt =>
          opt
            .setName('enabled')
            .setDescription('Enable or disable sending a welcome DM')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('message')
            .setDescription('Custom DM message text')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable the welcomer system')
        .addBooleanOption(opt =>
          opt
            .setName('enabled')
            .setDescription('Enable or disable welcome messages')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('test')
        .setDescription('Send a test welcome card into a channel')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel to send test preview (defaults to configured welcome channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('View current welcomer configuration')
    ),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
    } catch (e) {}

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // 1. Set Channel
    if (subcommand === 'channel') {
      const targetChannel = interaction.options.getChannel('channel');
      setGuildWelcomerConfig(guildId, { channelId: targetChannel.id, enabled: true });

      return interaction.editReply({
        content: `✅ Welcome channel set to ${targetChannel}! New members will be welcomed here.`
      });
    }

    // 2. Set Message
    if (subcommand === 'message') {
      const text = interaction.options.getString('text');
      setGuildWelcomerConfig(guildId, { description: text });

      return interaction.editReply({
        content: `✅ Welcome message updated!\n\n**Preview Template:**\n\`\`\`\n${text}\n\`\`\``
      });
    }

    // 3. Auto-Role
    if (subcommand === 'autorole') {
      const role = interaction.options.getRole('role');
      if (role) {
        setGuildWelcomerConfig(guildId, { autoRoleId: role.id });
        return interaction.editReply({
          content: `✅ Auto-Role set to ${role}! New members will automatically receive this role upon joining.`
        });
      } else {
        setGuildWelcomerConfig(guildId, { autoRoleId: null });
        return interaction.editReply({
          content: '✅ Auto-Role disabled. No role will be assigned automatically on join.'
        });
      }
    }

    // 4. DM Config
    if (subcommand === 'dm') {
      const enabled = interaction.options.getBoolean('enabled');
      const message = interaction.options.getString('message');

      const updates = { dmEnabled: enabled };
      if (message) updates.dmMessage = message;

      setGuildWelcomerConfig(guildId, updates);

      return interaction.editReply({
        content: `✅ Welcome DMs are now **${enabled ? 'ENABLED' : 'DISABLED'}**!${message ? `\n\n**DM Text:**\n\`\`\`\n${message}\n\`\`\`` : ''}`
      });
    }

    // 5. Toggle Welcomer
    if (subcommand === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled');
      setGuildWelcomerConfig(guildId, { enabled });

      return interaction.editReply({
        content: `✅ Welcomer system is now **${enabled ? 'ENABLED' : 'DISABLED'}** for this server.`
      });
    }

    // 6. Test Welcome Card
    if (subcommand === 'test') {
      const config = getGuildWelcomerConfig(guildId);
      const targetChannel = interaction.options.getChannel('channel') ||
        (config.channelId ? (interaction.guild.channels.cache.get(config.channelId) || await interaction.guild.channels.fetch(config.channelId).catch(() => null)) : interaction.channel);

      if (!targetChannel) {
        return interaction.editReply({
          content: '❌ No channel found. Please set a welcome channel first with `/welcomer channel` or select one in the command options.'
        });
      }

      try {
        await sendTestWelcome(interaction.guild, targetChannel, interaction.member);
        return interaction.editReply({
          content: `✅ Test welcome message sent to ${targetChannel}!`
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Error sending test message: ${err.message}`
        });
      }
    }

    // 7. Status
    if (subcommand === 'status') {
      const config = getGuildWelcomerConfig(guildId);

      const statusEmbed = new EmbedBuilder()
        .setTitle('👋 Server Welcomer Configuration')
        .setColor(0x5865F2)
        .addFields(
          {
            name: '📌 System Status',
            value: config.enabled ? '🟢 **Enabled**' : '🔴 **Disabled**',
            inline: true
          },
          {
            name: '📢 Welcome Channel',
            value: config.channelId ? `<#${config.channelId}> (\`${config.channelId}\`)` : '⚠️ *Not configured*',
            inline: true
          },
          {
            name: '👑 Auto-Role on Join',
            value: config.autoRoleId ? `<@&${config.autoRoleId}>` : '❌ *None*',
            inline: true
          },
          {
            name: '📬 Welcome DM',
            value: config.dmEnabled ? '🟢 **Enabled**' : '🔴 **Disabled**',
            inline: true
          },
          {
            name: '📝 Welcome Card Description',
            value: `\`\`\`\n${config.description.slice(0, 500)}\n\`\`\``,
            inline: false
          }
        )
        .setFooter({ text: 'Use /welcomer to update any setting' })
        .setTimestamp();

      return interaction.editReply({ embeds: [statusEmbed] });
    }
  }
};
