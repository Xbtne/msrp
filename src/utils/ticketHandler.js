const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ComponentType
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const fs = require('fs');
const path = require('path');

function getConfig() {
  let config = { staffRoleIds: [], ticketTypes: [] };
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8');
    config = JSON.parse(raw);
  } catch (err) {
    console.error('Error reading config.json:', err);
  }

  // Allow Railway / Render environment variables to override if present
  if (process.env.LOG_CHANNEL_ID) config.logChannelId = process.env.LOG_CHANNEL_ID;
  if (process.env.SHIFT_LOG_CHANNEL_ID) config.shiftLogChannelId = process.env.SHIFT_LOG_CHANNEL_ID;
  if (process.env.APP_LOG_CHANNEL_ID) config.appLogChannelId = process.env.APP_LOG_CHANNEL_ID;
  if (process.env.CATEGORY_ID) config.defaultCategoryId = process.env.CATEGORY_ID;
  if (process.env.PING_ROLE_ID) config.pingRoleId = process.env.PING_ROLE_ID;
  if (process.env.REVIEWS_CHANNEL_ID) config.reviewsChannelId = process.env.REVIEWS_CHANNEL_ID;
  if (process.env.BIBI_CHANNEL_ID) config.bibiChannelId = process.env.BIBI_CHANNEL_ID;
  if (process.env.STAFF_ROLE_IDS) {
    config.staffRoleIds = process.env.STAFF_ROLE_IDS.split(',').map(id => id.trim());
  }
  if (process.env.ALLOWED_PING_CATEGORY_IDS) {
    config.allowedMassPingCategoryIds = process.env.ALLOWED_PING_CATEGORY_IDS.split(',').map(id => id.trim());
  }
  if (process.env.STAFF_ACCEPTED_ROLE_ID) {
    config.staffAcceptedRoleId = process.env.STAFF_ACCEPTED_ROLE_ID;
  }
  if (!config.staffAcceptedRoleId) {
    config.staffAcceptedRoleId = '1536402083438133297';
  }

  return config;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(path.join(__dirname, '../../config.json'), JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing config.json:', err);
    return false;
  }
}

/**
 * Checks if a member has Staff privileges
 */
function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

  const config = getConfig();
  const staffRoleIds = config.staffRoleIds || [];

  // Check defined role IDs
  for (const roleId of staffRoleIds) {
    if (roleId && member.roles.cache.has(roleId)) return true;
  }

  // Fallback: check if member has any role named "Staff", "Admin", "Moderator", "Support"
  const staffRoleNames = ['staff', 'admin', 'administrator', 'moderator', 'mod', 'support', 'helper'];
  const hasNamedRole = member.roles.cache.some(role =>
    staffRoleNames.some(name => role.name.toLowerCase().includes(name))
  );

  return hasNamedRole;
}

/**
 * Parse metadata stored in channel topic
 */
function parseTicketTopic(topic) {
  if (!topic) return null;
  const ownerMatch = topic.match(/Owner: (\d+)/);
  const typeMatch = topic.match(/Type: ([a-zA-Z0-9_-]+)/);
  const claimedMatch = topic.match(/Claimed: (\d+|None)/);

  return {
    ownerId: ownerMatch ? ownerMatch[1] : null,
    typeId: typeMatch ? typeMatch[1] : null,
    claimedBy: claimedMatch && claimedMatch[1] !== 'None' ? claimedMatch[1] : null
  };
}

/**
 * Format topic string
 */
function formatTopic(ownerId, typeId, claimedBy = 'None') {
  return `Ticket | Owner: ${ownerId} | Type: ${typeId} | Claimed: ${claimedBy}`;
}

/**
 * Generates the ticket control action row (Claim/Unclaim, Close, Transcript)
 */
function createTicketControlRow(isClaimed = false, claimedBy = null) {
  const claimButton = new ButtonBuilder()
    .setCustomId(isClaimed ? 'ticket_unclaim' : 'ticket_claim')
    .setLabel(isClaimed ? 'Unclaim Ticket' : 'Claim Ticket')
    .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setEmoji(isClaimed ? '🔓' : '🙋');

  const closeButton = new ButtonBuilder()
    .setCustomId('ticket_close_request')
    .setLabel('Close')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔒');

  const transcriptButton = new ButtonBuilder()
    .setCustomId('ticket_transcript')
    .setLabel('Transcript')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📑');

  return new ActionRowBuilder().addComponents(claimButton, closeButton, transcriptButton);
}

/**
 * Generates the main embed inside the ticket channel
 */
function createTicketEmbed(typeConfig, user, claimedMember = null) {
  const embed = new EmbedBuilder()
    .setTitle(typeConfig.welcomeTitle || `${typeConfig.label} Ticket`)
    .setDescription(
      `${typeConfig.welcomeDescription || 'Staff will be with you shortly.'}\n\n` +
      `👤 **Ticket Creator:** <@${user.id}> (${user.tag})\n` +
      `🏷️ **Category:** ${typeConfig.label}\n` +
      `📌 **Status:** ${claimedMember ? `Claimed by <@${claimedMember.id}>` : '🟢 Open / Awaiting Staff'}`
    )
    .setColor(claimedMember ? 0xFEE75C : 0x5865F2)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setFooter({
      text: `Ticket ID: ${user.id} • Use buttons below to manage`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    })
    .setTimestamp();

  embed.addFields({
    name: '📸 Screenshots & Proof',
    value: 'You can upload or paste your screenshots, image files, or video clips directly into this channel below.',
    inline: false
  });

  if (claimedMember) {
    embed.addFields({
      name: '👑 Claimed By Staff Member',
      value: `<@${claimedMember.id}> (${claimedMember.user.tag})`,
      inline: true
    });
  }

  return embed;
}

/**
 * Creates a new ticket channel when a user clicks one of the 3 buttons
 */
async function handleTicketCreate(interaction, typeId) {
  const config = getConfig();
  const guild = interaction.guild;
  const user = interaction.user;

  const typeConfig = config.ticketTypes.find(t => t.id === typeId);
  if (!typeConfig) {
    return interaction.reply({
      content: '❌ Invalid ticket type configuration.',
      ephemeral: true
    });
  }

  // Check if user already has an open ticket of this type or in general
  const existingChannel = guild.channels.cache.find(c => {
    if (c.type !== ChannelType.GuildText) return false;
    const metadata = parseTicketTopic(c.topic);
    return metadata && metadata.ownerId === user.id && metadata.typeId === typeId;
  });

  if (existingChannel) {
    return interaction.reply({
      content: `⚠️ You already have an open **${typeConfig.label}** ticket: ${existingChannel}`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (!interaction.client.token && process.env.DISCORD_TOKEN) {
      interaction.client.token = process.env.DISCORD_TOKEN;
      interaction.client.rest.setToken(process.env.DISCORD_TOKEN);
    }

    const botUserId = interaction.client.user.id;

    // Determine permissions
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: botUserId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory
        ]
      }
    ];

    // Add configured staff roles to permissions
    if (config.staffRoleIds && Array.isArray(config.staffRoleIds)) {
      for (const roleId of config.staffRoleIds) {
        if (roleId && guild.roles.cache.has(roleId)) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ReadMessageHistory
            ]
          });
        }
      }
    }

    const channelName = `${typeConfig.channelPrefix || 'ticket'}-${user.username}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');

    const channelOptions = {
      name: channelName,
      type: ChannelType.GuildText,
      topic: formatTopic(user.id, typeId, 'None'),
      permissionOverwrites: permissionOverwrites
    };

    const targetCategoryId = typeConfig.categoryId || config.defaultCategoryId;
    if (targetCategoryId) {
      const categoryExists =
        guild.channels.cache.get(targetCategoryId) ||
        (await guild.channels.fetch(targetCategoryId).catch(() => null));
      if (categoryExists) {
        channelOptions.parent = targetCategoryId;
      }
    }

    const channel = await guild.channels.create(channelOptions);

    const embed = createTicketEmbed(typeConfig, user, null);
    const row = createTicketControlRow(false, null);

    const pingRoleStr = config.pingRoleId ? `<@&${config.pingRoleId}>` : 'Our staff team';

    const ticketMsg = await channel.send({
      content: `👋 Hello <@${user.id}>, welcome to your **${typeConfig.label}** ticket! ${pingRoleStr} will assist you shortly.`,
      embeds: [embed],
      components: [row]
    });

    await ticketMsg.pin().catch(() => {});

    await interaction.editReply({
      content: `✅ Your ticket has been created: ${channel}`
    });
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    await interaction.editReply({
      content: `❌ Failed to create ticket: ${error.message}`
    });
  }
}

/**
 * Handle staff claiming a ticket
 */
async function handleTicketClaim(interaction) {
  if (!isStaff(interaction.member)) {
    const errorMsg = '❌ Only staff members can claim tickets.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: errorMsg });
    }
    return interaction.reply({ content: errorMsg, ephemeral: true });
  }

  const channel = interaction.channel;
  const metadata = parseTicketTopic(channel.topic);

  if (!metadata) {
    const errorMsg = '❌ This channel is not a valid ticket channel.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: errorMsg });
    }
    return interaction.reply({ content: errorMsg, ephemeral: true });
  }

  if (metadata.claimedBy && metadata.claimedBy !== 'None') {
    const errorMsg = `⚠️ This ticket is already claimed by <@${metadata.claimedBy}>.`;
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: errorMsg });
    }
    return interaction.reply({ content: errorMsg, ephemeral: true });
  }

  try {
    if (!interaction.deferred && !interaction.replied) {
      if (interaction.isButton && interaction.isButton()) {
        await interaction.deferUpdate();
      } else {
        await interaction.deferReply({ ephemeral: false });
      }
    }
  } catch (err) {
    if (err.code === 40060 || err.code === 10062) return;
  }

  const config = getConfig();
  const typeConfig = config.ticketTypes.find(t => t.id === metadata.typeId) || {
    label: 'Support',
    welcomeTitle: 'Support Ticket',
    welcomeDescription: ''
  };

  const owner = await interaction.client.users.fetch(metadata.ownerId).catch(() => null);

  // Update channel topic
  await channel.setTopic(formatTopic(metadata.ownerId, metadata.typeId, interaction.user.id));

  // Update original pinned embed / message
  const pinnedMessages = await channel.messages.fetchPinned().catch(() => null);
  const ticketMessage = pinnedMessages ? pinnedMessages.first() : null;

  if (ticketMessage && ticketMessage.author.id === interaction.client.user.id) {
    const updatedEmbed = createTicketEmbed(typeConfig, owner || { id: metadata.ownerId, tag: 'User', displayAvatarURL: () => '' }, interaction.member);
    const updatedRow = createTicketControlRow(true, interaction.user.id);
    await ticketMessage.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(console.error);
  }

  const claimNotificationEmbed = new EmbedBuilder()
    .setTitle('🙋 Ticket Claimed')
    .setDescription(`This ticket has been claimed by staff member **<@${interaction.user.id}>** (${interaction.user.tag}). They will be handling your request from now on!`)
    .setColor(0x57F287)
    .setTimestamp();

  if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
    await interaction.editReply({ embeds: [claimNotificationEmbed] });
  } else {
    await channel.send({ embeds: [claimNotificationEmbed] });
  }
}

/**
 * Handle staff unclaiming a ticket
 */
async function handleTicketUnclaim(interaction) {
  if (!isStaff(interaction.member)) {
    const errorMsg = '❌ Only staff members can unclaim tickets.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: errorMsg });
    }
    return interaction.reply({ content: errorMsg, ephemeral: true });
  }

  const channel = interaction.channel;
  const metadata = parseTicketTopic(channel.topic);

  if (!metadata || !metadata.claimedBy || metadata.claimedBy === 'None') {
    const errorMsg = '⚠️ This ticket is not currently claimed.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: errorMsg });
    }
    return interaction.reply({ content: errorMsg, ephemeral: true });
  }

  // Only the claiming staff member or an administrator can unclaim
  if (metadata.claimedBy !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    const errorMsg = `❌ Only <@${metadata.claimedBy}> or an Administrator can unclaim this ticket.`;
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: errorMsg });
    }
    return interaction.reply({ content: errorMsg, ephemeral: true });
  }

  try {
    if (!interaction.deferred && !interaction.replied) {
      if (interaction.isButton && interaction.isButton()) {
        await interaction.deferUpdate();
      } else {
        await interaction.deferReply({ ephemeral: false });
      }
    }
  } catch (err) {
    if (err.code === 40060 || err.code === 10062) return;
  }

  const config = getConfig();
  const typeConfig = config.ticketTypes.find(t => t.id === metadata.typeId) || {
    label: 'Support',
    welcomeTitle: 'Support Ticket',
    welcomeDescription: ''
  };

  const owner = await interaction.client.users.fetch(metadata.ownerId).catch(() => null);

  // Update channel topic
  await channel.setTopic(formatTopic(metadata.ownerId, metadata.typeId, 'None'));

  // Update original pinned embed / message
  const pinnedMessages = await channel.messages.fetchPinned().catch(() => null);
  const ticketMessage = pinnedMessages ? pinnedMessages.first() : null;

  if (ticketMessage && ticketMessage.author.id === interaction.client.user.id) {
    const updatedEmbed = createTicketEmbed(typeConfig, owner || { id: metadata.ownerId, tag: 'User', displayAvatarURL: () => '' }, null);
    const updatedRow = createTicketControlRow(false, null);
    await ticketMessage.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(console.error);
  }

  const unclaimNotificationEmbed = new EmbedBuilder()
    .setTitle('🔓 Ticket Unclaimed')
    .setDescription(`This ticket was unclaimed by <@${interaction.user.id}> and is now open for any staff member to assist.`)
    .setColor(0xED4245)
    .setTimestamp();

  if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
    await interaction.editReply({ embeds: [unclaimNotificationEmbed] });
  } else {
    await channel.send({ embeds: [unclaimNotificationEmbed] });
  }
}

/**
 * Handle Close Ticket prompt
 */
async function handleTicketCloseRequest(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_confirm_close')
      .setLabel('Yes, Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
    new ButtonBuilder()
      .setCustomId('ticket_cancel_close')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✖️')
  );

  const confirmEmbed = new EmbedBuilder()
    .setTitle('🔒 Close Ticket Confirmation')
    .setDescription('Are you sure you want to close this ticket? A transcript will be saved automatically.')
    .setColor(0xED4245);

  await interaction.reply({
    embeds: [confirmEmbed],
    components: [row]
  });
}

/**
 * Handle Cancel Close
 */
async function handleTicketCancelClose(interaction) {
  await interaction.message.delete().catch(() => {});
  await interaction.reply({
    content: '✅ Ticket close cancelled.',
    ephemeral: true
  });
}

/**
 * Handle Confirm Close and Generate Transcript
 */
async function handleTicketConfirmClose(interaction) {
  const channel = interaction.channel;
  const metadata = parseTicketTopic(channel.topic);

  await interaction.update({
    content: '⏳ Closing ticket and generating transcript...',
    embeds: [],
    components: []
  });

  try {
    // Generate HTML Transcript
    const attachment = await discordTranscripts.createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      filename: `${channel.name}-transcript.html`,
      saveImages: true,
      poweredBy: false
    });

    const config = getConfig();
    const typeConfig = config.ticketTypes.find(t => t.id === metadata?.typeId);

    // Fetch messages to compute message statistics
    const messageCounts = {};
    let totalMessages = 0;
    try {
      let lastId;
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const fetched = await channel.messages.fetch(options);
        if (fetched.size === 0) break;

        for (const msg of fetched.values()) {
          if (!msg.author.bot) {
            const uid = msg.author.id;
            messageCounts[uid] = (messageCounts[uid] || 0) + 1;
            totalMessages++;
          }
        }

        lastId = fetched.last().id;
        if (fetched.size < 100) break;
      }
    } catch (countErr) {
      console.warn('Error fetching message stats for log:', countErr);
    }

    // Build message breakdown string
    let messageBreakdown = '';
    const sortedParticipants = Object.entries(messageCounts).sort(([, a], [, b]) => b - a);
    if (sortedParticipants.length > 0) {
      messageBreakdown = sortedParticipants
        .map(([uid, count]) => `• <@${uid}> — **${count}** message${count === 1 ? '' : 's'}`)
        .join('\n');
      messageBreakdown += `\n\n📊 **Total User Messages:** ${totalMessages}`;
    } else {
      messageBreakdown = '*No user messages sent.*';
    }

    // Send transcript to log channel if configured
    if (config.logChannelId) {
      const logChannel =
        interaction.guild.channels.cache.get(config.logChannelId) ||
        (await interaction.guild.channels.fetch(config.logChannelId).catch(() => null));

      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📁 Ticket Closed & Transcript Logged')
          .setColor(0x5865F2)
          .addFields(
            {
              name: '🏷️ Ticket Name',
              value: `\`#${channel.name}\``,
              inline: true
            },
            {
              name: '🆔 Ticket ID',
              value: `\`${channel.id}\``,
              inline: true
            },
            {
              name: '📂 Category',
              value: typeConfig ? `${typeConfig.emoji || ''} ${typeConfig.label}` : (metadata?.typeId || 'General'),
              inline: true
            },
            {
              name: '👤 Ticket Owner',
              value: metadata?.ownerId ? `<@${metadata.ownerId}> (\`${metadata.ownerId}\`)` : 'Unknown',
              inline: true
            },
            {
              name: '👑 Staff Claimed',
              value: metadata?.claimedBy && metadata.claimedBy !== 'None'
                ? `<@${metadata.claimedBy}> (\`${metadata.claimedBy}\`)`
                : '🔓 *Unclaimed*',
              inline: true
            },
            {
              name: '🔒 Closed By',
              value: `<@${interaction.user.id}> (${interaction.user.tag})`,
              inline: true
            },
            {
              name: '💬 Messages Sent by Each Member',
              value: messageBreakdown.length > 1024 ? messageBreakdown.slice(0, 1020) + '...' : messageBreakdown,
              inline: false
            }
          )
          .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
          .setFooter({ text: `Ticket ID: ${channel.id} • Closed at` })
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed], files: [attachment] }).catch(err => {
          console.error('Failed to send transcript to log channel:', err);
        });
      }
    }

    // Try to DM the transcript to the ticket owner
    if (metadata && metadata.ownerId) {
      try {
        const owner = await interaction.client.users.fetch(metadata.ownerId);
        if (owner) {
          const dmEmbed = new EmbedBuilder()
            .setTitle('📄 Ticket Transcript')
            .setDescription(
              `Your ticket **#${channel.name}** in **${interaction.guild.name}** has been closed.\n\n` +
              `• **Ticket ID:** \`${channel.id}\`\n` +
              `• **Closed By:** <@${interaction.user.id}>\n` +
              `• **Claimed By:** ${metadata.claimedBy && metadata.claimedBy !== 'None' ? `<@${metadata.claimedBy}>` : '*Unclaimed*'}\n\n` +
              `Attached is your full conversation transcript file.`
            )
            .setColor(0x5865F2)
            .setTimestamp();

          await owner.send({ embeds: [dmEmbed], files: [attachment] });
        }
      } catch (dmErr) {
        console.log(`Could not DM user ${metadata.ownerId}: DMs likely closed.`);
      }
    }

    await channel.send('🛑 Ticket will be deleted in 5 seconds...');
    setTimeout(() => {
      channel.delete().catch(console.error);
    }, 5000);
  } catch (error) {
    console.error('Error during ticket close:', error);
    await channel.send(`❌ Error while saving transcript or closing: ${error.message}`);
  }
}

/**
 * Handle Manual Transcript generation button
 */
async function handleTicketTranscript(interaction) {
  await interaction.deferReply({ ephemeral: false });

  try {
    const channel = interaction.channel;
    const attachment = await discordTranscripts.createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      filename: `${channel.name}-transcript.html`,
      saveImages: true,
      poweredBy: false
    });

    const embed = new EmbedBuilder()
      .setTitle('📑 Ticket Transcript Generated')
      .setDescription(`Transcript successfully exported for ${channel.name}. Download the HTML file below to view the entire chat log.`)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  } catch (err) {
    console.error('Error generating manual transcript:', err);
    await interaction.editReply({ content: `❌ Error generating transcript: ${err.message}` });
  }
}

module.exports = {
  isStaff,
  getConfig,
  saveConfig,
  parseTicketTopic,
  createTicketControlRow,
  createTicketEmbed,
  handleTicketCreate,
  handleTicketClaim,
  handleTicketUnclaim,
  handleTicketCloseRequest,
  handleTicketCancelClose,
  handleTicketConfirmClose,
  handleTicketTranscript
};
