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
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../../config.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading config.json:', err);
    return { staffRoleIds: [], ticketTypes: [] };
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
        id: guild.members.me.id,
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

    if (typeConfig.categoryId && guild.channels.cache.has(typeConfig.categoryId)) {
      channelOptions.parent = typeConfig.categoryId;
    }

    const channel = await guild.channels.create(channelOptions);

    const embed = createTicketEmbed(typeConfig, user, null);
    const row = createTicketControlRow(false, null);

    const ticketMsg = await channel.send({
      content: `👋 Hello <@${user.id}>, welcome to your **${typeConfig.label}** ticket! Our staff team has been notified.`,
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
    return interaction.reply({
      content: '❌ Only staff members can claim tickets.',
      ephemeral: true
    });
  }

  const channel = interaction.channel;
  const metadata = parseTicketTopic(channel.topic);

  if (!metadata) {
    return interaction.reply({
      content: '❌ This channel is not a valid ticket channel.',
      ephemeral: true
    });
  }

  if (metadata.claimedBy && metadata.claimedBy !== 'None') {
    return interaction.reply({
      content: `⚠️ This ticket is already claimed by <@${metadata.claimedBy}>.`,
      ephemeral: true
    });
  }

  await interaction.deferUpdate();

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

  await channel.send({ embeds: [claimNotificationEmbed] });
}

/**
 * Handle staff unclaiming a ticket
 */
async function handleTicketUnclaim(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      content: '❌ Only staff members can unclaim tickets.',
      ephemeral: true
    });
  }

  const channel = interaction.channel;
  const metadata = parseTicketTopic(channel.topic);

  if (!metadata || !metadata.claimedBy || metadata.claimedBy === 'None') {
    return interaction.reply({
      content: '⚠️ This ticket is not currently claimed.',
      ephemeral: true
    });
  }

  // Only the claiming staff member or an administrator can unclaim
  if (metadata.claimedBy !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: `❌ Only <@${metadata.claimedBy}> or an Administrator can unclaim this ticket.`,
      ephemeral: true
    });
  }

  await interaction.deferUpdate();

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

  await channel.send({ embeds: [unclaimNotificationEmbed] });
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

    // Send transcript to log channel if configured
    if (config.logChannelId) {
      const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📁 Ticket Closed & Transcript Logged')
          .setDescription(
            `• **Channel:** \`${channel.name}\`\n` +
            `• **Closed By:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
            `• **Ticket Owner:** ${metadata ? `<@${metadata.ownerId}>` : 'Unknown'}\n` +
            `• **Type:** ${metadata ? metadata.typeId : 'Unknown'}\n` +
            `• **Claimed By:** ${metadata && metadata.claimedBy !== 'None' ? `<@${metadata.claimedBy}>` : 'Unclaimed'}`
          )
          .setColor(0x5865F2)
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed], files: [attachment] }).catch(console.error);
      }
    }

    // Try to DM the transcript to the ticket owner
    if (metadata && metadata.ownerId) {
      try {
        const owner = await interaction.client.users.fetch(metadata.ownerId);
        if (owner) {
          const dmEmbed = new EmbedBuilder()
            .setTitle('📄 Ticket Transcript')
            .setDescription(`Your ticket **${channel.name}** in **${interaction.guild.name}** has been closed.\nAttached is your full conversation transcript.`)
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
