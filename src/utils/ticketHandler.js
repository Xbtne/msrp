const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
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

  // Check admin & manage channels permissions
  if (member.permissions && typeof member.permissions.has === 'function') {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  }

  const config = getConfig();
  const staffRoleIds = config.staffRoleIds || [];

  // Check roles cache
  if (member.roles?.cache) {
    for (const roleId of staffRoleIds) {
      if (roleId && member.roles.cache.has(roleId)) return true;
    }

    const staffRoleNames = ['staff', 'admin', 'administrator', 'moderator', 'mod', 'support', 'helper'];
    const hasNamedRole = member.roles.cache.some(role =>
      staffRoleNames.some(name => role.name.toLowerCase().includes(name))
    );
    if (hasNamedRole) return true;
  } else if (Array.isArray(member.roles)) {
    // Array of role IDs (API interaction)
    for (const roleId of staffRoleIds) {
      if (roleId && member.roles.includes(roleId)) return true;
    }
  }

  return false;
}

/**
 * Parse metadata stored in channel topic
 */
function parseTicketTopic(topic) {
  if (!topic || typeof topic !== 'string') return null;
  const ownerMatch = topic.match(/Owner:\s*(\d+)/i);
  const typeMatch = topic.match(/Type:\s*([a-zA-Z0-9_-]+)/i);
  const claimedMatch = topic.match(/Claimed:\s*(\d+|None)/i);

  if (!ownerMatch && !typeMatch) return null;

  return {
    ownerId: ownerMatch ? ownerMatch[1] : null,
    typeId: typeMatch ? typeMatch[1] : null,
    claimedBy: claimedMatch && claimedMatch[1] !== 'None' ? claimedMatch[1] : null
  };
}

/**
 * Robust ticket metadata detector (topic -> channel name -> overwrites -> message search)
 */
async function getTicketMetadata(channel) {
  if (!channel) return null;

  // 1. Try channel topic
  let topic = channel.topic;
  if (!topic && channel.id && channel.guild) {
    const fetched = await channel.guild.channels.fetch(channel.id).catch(() => null);
    if (fetched?.topic) topic = fetched.topic;
  }

  const fromTopic = parseTicketTopic(topic);
  if (fromTopic) return fromTopic;

  // 2. Fallback: check channel name prefix (e.g. game-username, support-username, etc.)
  const config = getConfig();
  const name = channel.name || '';
  let matchedType = config.ticketTypes.find(t => name.startsWith((t.channelPrefix || t.id).toLowerCase() + '-'));

  if (!matchedType && (name.startsWith('ticket-') || name.startsWith('close-'))) {
    matchedType = config.ticketTypes[0] || { id: 'support_ticket', label: 'Support' };
  }

  if (matchedType) {
    // Try to find non-staff user overwrite as owner
    let ownerId = null;
    if (channel.permissionOverwrites?.cache) {
      for (const [id, overwrite] of channel.permissionOverwrites.cache) {
        if (overwrite.type === 1 && id !== channel.client.user.id && !config.staffRoleIds?.includes(id)) {
          ownerId = id;
          break;
        }
      }
    }

    return {
      ownerId: ownerId || null,
      typeId: matchedType.id,
      claimedBy: null
    };
  }

  return null;
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
    .setTitle(typeConfig.welcomeTitle || `${typeConfig.label || 'Support'} Ticket`)
    .setDescription(
      `${typeConfig.welcomeDescription || 'Staff will be with you shortly.'}\n\n` +
      `👤 **Ticket Creator:** <@${user.id}> (${user.tag || user.username || 'User'})\n` +
      `🏷️ **Category:** ${typeConfig.label || 'Support'}\n` +
      `📌 **Status:** ${claimedMember ? `Claimed by <@${claimedMember.id}>` : '🟢 Open / Awaiting Staff'}`
    )
    .setColor(claimedMember ? 0xFEE75C : 0x5865F2)
    .setThumbnail(user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : null)
    .setFooter({
      text: `Ticket ID: ${user.id} • Use buttons below to manage`,
      iconURL: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : null
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
      value: `<@${claimedMember.id}> (${claimedMember.user?.tag || claimedMember.displayName || 'Staff'})`,
      inline: true
    });
  }

  return embed;
}

/**
 * Creates a new ticket channel when a user clicks one of the buttons
 */
async function handleTicketCreate(interaction, typeId) {
  const config = getConfig();
  const guild = interaction.guild;
  const user = interaction.user;

  const typeConfig = config.ticketTypes.find(t => t.id === typeId) || {
    id: typeId,
    label: 'Support Ticket',
    channelPrefix: 'support',
    welcomeTitle: '🎫 Support Ticket',
    welcomeDescription: 'Thank you for reaching out! A staff member will assist you shortly.'
  };

  // Check if user already has an open ticket of this type
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

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
  } catch (deferErr) {
    if (deferErr.code === 40060 || deferErr.code === 10062) return;
  }

  try {
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
        if (!roleId) continue;
        const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
        if (role) {
          permissionOverwrites.push({
            id: role.id,
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

    const rawName = `${typeConfig.channelPrefix || 'ticket'}-${user.username || 'user'}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const channelName = rawName.slice(0, 30) || `ticket-${user.id.slice(-4)}`;

    const channelOptions = {
      name: channelName,
      type: ChannelType.GuildText,
      topic: formatTopic(user.id, typeId, 'None'),
      permissionOverwrites: permissionOverwrites
    };

    const targetCategoryId = typeConfig.categoryId || config.defaultCategoryId;
    if (targetCategoryId) {
      const category =
        guild.channels.cache.get(targetCategoryId) ||
        (await guild.channels.fetch(targetCategoryId).catch(() => null));
      if (category && category.type === ChannelType.GuildCategory) {
        // Only set parent if category is not full (max 50)
        const childCount = guild.channels.cache.filter(c => c.parentId === category.id).size;
        if (childCount < 50) {
          channelOptions.parent = category.id;
        }
      }
    }

    let channel;
    try {
      channel = await guild.channels.create(channelOptions);
    } catch (createErr) {
      // If parent category caused failure, retry without parent
      if (channelOptions.parent) {
        delete channelOptions.parent;
        channel = await guild.channels.create(channelOptions);
      } else {
        throw createErr;
      }
    }

    const embed = createTicketEmbed(typeConfig, user, null);
    const row = createTicketControlRow(false, null);
    const pingRoleStr = config.pingRoleId ? `<@&${config.pingRoleId}>` : 'Our staff team';

    const ticketMsg = await channel.send({
      content: `👋 Hello <@${user.id}>, welcome to your **${typeConfig.label}** ticket! ${pingRoleStr} will assist you shortly.`,
      embeds: [embed],
      components: [row]
    });

    await ticketMsg.pin().catch(() => {});

    return await interaction.editReply({
      content: `✅ Your ticket has been created: ${channel}`
    });
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    try {
      await interaction.editReply({
        content: `❌ Failed to create ticket: ${error.message}`
      });
    } catch (e) {}
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
  const metadata = await getTicketMetadata(channel);

  if (!metadata) {
    const errorMsg = '❌ This channel is not recognized as an active ticket.';
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

  const owner = metadata.ownerId
    ? await interaction.client.users.fetch(metadata.ownerId).catch(() => ({ id: metadata.ownerId, tag: 'User', displayAvatarURL: () => '' }))
    : { id: interaction.user.id, tag: 'User', displayAvatarURL: () => '' };

  // Update channel topic
  await channel.setTopic(formatTopic(metadata.ownerId || owner.id, metadata.typeId, interaction.user.id)).catch(() => {});

  // Update original embed / message
  try {
    const messages = await channel.messages.fetch({ limit: 15 }).catch(() => null);
    const ticketMessage = messages?.find(m => m.author.id === interaction.client.user.id && m.components.length > 0);

    if (ticketMessage) {
      const updatedEmbed = createTicketEmbed(typeConfig, owner, interaction.member);
      const updatedRow = createTicketControlRow(true, interaction.user.id);
      await ticketMessage.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {});
    }
  } catch (e) {}

  const claimNotificationEmbed = new EmbedBuilder()
    .setTitle('🙋 Ticket Claimed')
    .setDescription(`This ticket has been claimed by staff member **<@${interaction.user.id}>** (${interaction.user.tag}). They will be handling your request from now on!`)
    .setColor(0x57F287)
    .setTimestamp();

  if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
    await interaction.editReply({ embeds: [claimNotificationEmbed] }).catch(() => {});
  } else {
    await channel.send({ embeds: [claimNotificationEmbed] }).catch(() => {});
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
  const metadata = await getTicketMetadata(channel);

  if (!metadata || !metadata.claimedBy || metadata.claimedBy === 'None') {
    const errorMsg = '⚠️ This ticket is not currently claimed.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: errorMsg });
    }
    return interaction.reply({ content: errorMsg, ephemeral: true });
  }

  const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator) || interaction.user.id === interaction.guild.ownerId;
  if (metadata.claimedBy !== interaction.user.id && !isAdmin) {
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

  const owner = metadata.ownerId
    ? await interaction.client.users.fetch(metadata.ownerId).catch(() => ({ id: metadata.ownerId, tag: 'User', displayAvatarURL: () => '' }))
    : { id: interaction.user.id, tag: 'User', displayAvatarURL: () => '' };

  // Update channel topic
  await channel.setTopic(formatTopic(metadata.ownerId || owner.id, metadata.typeId, 'None')).catch(() => {});

  // Update original embed / message
  try {
    const messages = await channel.messages.fetch({ limit: 15 }).catch(() => null);
    const ticketMessage = messages?.find(m => m.author.id === interaction.client.user.id && m.components.length > 0);

    if (ticketMessage) {
      const updatedEmbed = createTicketEmbed(typeConfig, owner, null);
      const updatedRow = createTicketControlRow(false, null);
      await ticketMessage.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {});
    }
  } catch (e) {}

  const unclaimNotificationEmbed = new EmbedBuilder()
    .setTitle('🔓 Ticket Unclaimed')
    .setDescription(`This ticket was unclaimed by <@${interaction.user.id}> and is now open for any staff member to assist.`)
    .setColor(0xED4245)
    .setTimestamp();

  if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
    await interaction.editReply({ embeds: [unclaimNotificationEmbed] }).catch(() => {});
  } else {
    await channel.send({ embeds: [unclaimNotificationEmbed] }).catch(() => {});
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

  return await interaction.reply({
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
  const metadata = await getTicketMetadata(channel);

  try {
    await interaction.update({
      content: '⏳ Closing ticket and generating transcript...',
      embeds: [],
      components: []
    });
  } catch (e) {}

  let attachment = null;
  try {
    // Generate HTML Transcript with fallback
    try {
      attachment = await discordTranscripts.createTranscript(channel, {
        limit: -1,
        returnType: 'attachment',
        filename: `${channel.name}-transcript.html`,
        saveImages: false,
        poweredBy: false
      });
    } catch (transcriptErr) {
      console.warn('First transcript attempt failed, trying safe mode:', transcriptErr.message);
      attachment = await discordTranscripts.createTranscript(channel, {
        limit: 100,
        returnType: 'attachment',
        filename: `${channel.name}-transcript.html`,
        saveImages: false,
        poweredBy: false
      }).catch(() => null);
    }

    const config = getConfig();
    const typeConfig = config.ticketTypes.find(t => t.id === metadata?.typeId);

    // Fetch messages to compute message statistics (capped at 500 messages)
    const messageCounts = {};
    let totalMessages = 0;
    try {
      const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (fetched) {
        for (const msg of fetched.values()) {
          if (!msg.author.bot) {
            const uid = msg.author.id;
            messageCounts[uid] = (messageCounts[uid] || 0) + 1;
            totalMessages++;
          }
        }
      }
    } catch (countErr) {}

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

    // Send transcript to log channel
    if (config.logChannelId) {
      const logChannel =
        interaction.guild.channels.cache.get(config.logChannelId) ||
        (await interaction.guild.channels.fetch(config.logChannelId).catch(() => null));

      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📁 Ticket Closed & Transcript Logged')
          .setColor(0x5865F2)
          .addFields(
            { name: '🏷️ Ticket Name', value: `\`#${channel.name}\``, inline: true },
            { name: '🆔 Ticket ID', value: `\`${channel.id}\``, inline: true },
            { name: '📂 Category', value: typeConfig ? `${typeConfig.emoji || ''} ${typeConfig.label}` : (metadata?.typeId || 'General'), inline: true },
            { name: '👤 Ticket Owner', value: metadata?.ownerId ? `<@${metadata.ownerId}> (\`${metadata.ownerId}\`)` : 'Unknown', inline: true },
            { name: '👑 Staff Claimed', value: metadata?.claimedBy && metadata.claimedBy !== 'None' ? `<@${metadata.claimedBy}> (\`${metadata.claimedBy}\`)` : '🔓 *Unclaimed*', inline: true },
            { name: '🔒 Closed By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
            { name: '💬 Messages Sent', value: messageBreakdown.length > 1024 ? messageBreakdown.slice(0, 1020) + '...' : messageBreakdown, inline: false }
          )
          .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
          .setFooter({ text: `Ticket ID: ${channel.id} • Closed at` })
          .setTimestamp();

        const filesToSend = attachment ? [attachment] : [];
        await logChannel.send({ embeds: [logEmbed], files: filesToSend }).catch(console.error);
      }
    }

    // Try to DM transcript to ticket owner
    if (metadata && metadata.ownerId) {
      try {
        const owner = await interaction.client.users.fetch(metadata.ownerId).catch(() => null);
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

          const dmFiles = attachment ? [attachment] : [];
          await owner.send({ embeds: [dmEmbed], files: dmFiles }).catch(() => {});
        }
      } catch (dmErr) {}
    }
  } catch (error) {
    console.error('Error during ticket close processing:', error);
  } finally {
    await channel.send('🛑 Ticket will be deleted in 4 seconds...').catch(() => {});
    setTimeout(() => {
      channel.delete().catch(console.error);
    }, 4000);
  }
}

/**
 * Handle Manual Transcript generation
 */
async function handleTicketTranscript(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false });
    }
  } catch (e) {}

  try {
    const channel = interaction.channel;
    const attachment = await discordTranscripts.createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      filename: `${channel.name}-transcript.html`,
      saveImages: false,
      poweredBy: false
    });

    const embed = new EmbedBuilder()
      .setTitle('📑 Ticket Transcript Generated')
      .setDescription(`Transcript successfully exported for #${channel.name}. Download the HTML file below to view the entire chat log.`)
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
  getTicketMetadata,
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
