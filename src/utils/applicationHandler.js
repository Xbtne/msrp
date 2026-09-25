const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getConfig, isStaff } = require('./ticketHandler');

const applicationsDataPath = path.join(__dirname, '../../data/applications.json');

const APPLICATION_QUESTIONS = [
  {
    index: 1,
    title: '(1/9): Roblox and discord User',
    prompt: 'Please provide your **Roblox username** and your **Discord username**.'
  },
  {
    index: 2,
    title: '(2/9): How old are you',
    prompt: 'Please state your **age**.'
  },
  {
    index: 3,
    title: '(3/9): What do you look for in a team?',
    prompt: 'What qualities, values, and environment do you look for in a team?'
  },
  {
    index: 4,
    title: '(4/9): What does it mean to be a leader to you?',
    prompt: 'Explain what being a leader means to you personally.'
  },
  {
    index: 5,
    title: '(5/9): What can you bring to the MSRC Staff Team?',
    prompt: 'What skills, dedication, or unique contributions can you bring to the MSRC Staff Team?'
  },
  {
    index: 6,
    title: '(6/9): How many hrs will you be able to be active a week?',
    prompt: 'How many hours will you be able to dedicate and remain active per week?'
  },
  {
    index: 7,
    title: '(7/9): What are 5 rules that should be followed as a staff team member?',
    prompt: 'List **5 important rules** that every staff team member should follow.'
  },
  {
    index: 8,
    title: '(8/9): How well can you handle conflict?',
    prompt: 'Describe how you handle arguments, difficult players, toxic behavior, and high-stress situations.'
  },
  {
    index: 9,
    title: '(9/9): Have you ever been staff? If yes how long?',
    prompt: 'Have you ever held a staff role in any other Roblox group or Discord server? If yes, where and for how long?'
  }
];

function getApplicationsData() {
  try {
    if (!fs.existsSync(applicationsDataPath)) {
      const init = { sessions: {}, applications: {}, channels: {} };
      fs.writeFileSync(applicationsDataPath, JSON.stringify(init, null, 2), 'utf8');
      return init;
    }
    const data = JSON.parse(fs.readFileSync(applicationsDataPath, 'utf8'));
    if (!data.sessions) data.sessions = {};
    if (!data.applications) data.applications = {};
    if (!data.channels) data.channels = {};
    return data;
  } catch (err) {
    console.error('Error reading applications.json:', err);
    return { sessions: {}, applications: {}, channels: {} };
  }
}

function saveApplicationsData(data) {
  try {
    fs.writeFileSync(applicationsDataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving applications.json:', err);
  }
}

/**
 * Creates the persistent server application panel embed
 */
function createApplicationPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('📋 MSRC Staff Team Application')
    .setColor(0x5865F2)
    .setDescription(
      `Interested in joining the **Monroe County Staff Team**?\n\n` +
      `Click the **Apply** button below to begin your private staff application.\n` +
      `The bot will send you a DM asking if you want to start or decline your application.\n\n` +
      `**Requirements & Instructions:**\n` +
      `• Make sure your **Direct Messages (DMs)** are open\n` +
      `• Answer all **9 questions** thoroughly and honestly\n` +
      `• You can type \`cancel\` in DMs at any time to cancel\n\n` +
      `*Click the button below to get started!*`
    )
    .setFooter({ text: 'MSRC Staff Applications • Powered by Monroe County Bot' })
    .setTimestamp();
}

/**
 * Creates the Apply button row for the server panel
 */
function createApplicationPanelRow() {
  const applyBtn = new ButtonBuilder()
    .setCustomId('app_server_apply')
    .setLabel('Apply for Staff')
    .setEmoji('📝')
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(applyBtn);
}

/**
 * Handles user clicking "Apply for Staff" button in the server
 */
async function handleApplyButtonClick(interaction) {
  const user = interaction.user;
  const guildId = interaction.guild.id;

  const data = getApplicationsData();

  // Check if already in an active session
  if (data.sessions[user.id]) {
    return interaction.reply({
      content: '⚠️ You already have an active application in progress! Please check your DMs or type `cancel` in DMs to restart.',
      ephemeral: true
    });
  }

  // Create prompt DM embed
  const promptEmbed = new EmbedBuilder()
    .setTitle('📋 MSRC Staff Application Prompt')
    .setColor(0x5865F2)
    .setDescription(
      `Hello **${user.username}**! You requested to apply for the **Monroe County Staff Team**.\n\n` +
      `Would you like to start your application now?\n` +
      `• Total Questions: **9**\n` +
      `• You will type your answers directly here in DMs.\n` +
      `• You can cancel at any time by clicking **Decline** or typing \`cancel\`.\n\n` +
      `Click **Start Application** when you are ready to begin!`
    )
    .setFooter({ text: 'Monroe County Staff Application System' })
    .setTimestamp();

  const promptRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('app_dm_start')
      .setLabel('Start Application')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('app_dm_decline')
      .setLabel('Decline')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger)
  );

  try {
    const dmMessage = await user.send({
      embeds: [promptEmbed],
      components: [promptRow]
    });

    // Save session
    data.sessions[user.id] = {
      userId: user.id,
      userTag: user.tag || user.username,
      guildId: guildId,
      guildName: interaction.guild.name,
      status: 'PROMPT',
      promptMessageId: dmMessage.id,
      questionIndex: 0,
      answers: [],
      startedAt: Date.now()
    };
    saveApplicationsData(data);

    return interaction.reply({
      content: '📬 I have sent you a direct message! Please check your DMs to start or decline your staff application.',
      ephemeral: true
    });
  } catch (err) {
    console.error('Failed to DM applicant:', err);
    return interaction.reply({
      content: '❌ I was unable to send you a Direct Message. Please enable **"Allow Direct Messages from server members"** in your Discord Privacy Settings and try again!',
      ephemeral: true
    });
  }
}

/**
 * Handles DM Button Clicks (Start, Decline, Submit, Cancel)
 */
async function handleApplicationDmInteraction(interaction) {
  const customId = interaction.customId;
  const user = interaction.user;
  const data = getApplicationsData();
  const session = data.sessions[user.id];

  if (!session) {
    return interaction.reply({
      content: '⚠️ You do not have an active application session. Please click **Apply** in the server to start a new one.',
      ephemeral: true
    });
  }

  // 1. Decline
  if (customId === 'app_dm_decline' || customId === 'app_dm_cancel') {
    delete data.sessions[user.id];
    saveApplicationsData(data);

    const cancelEmbed = new EmbedBuilder()
      .setTitle('✖️ Staff Application Cancelled')
      .setColor(0xED4245)
      .setDescription('You have declined / cancelled your staff application. Feel free to re-apply in the server whenever you are ready!')
      .setTimestamp();

    if (interaction.message) {
      await interaction.message.edit({ components: [] }).catch(() => {});
    }

    return interaction.reply({ embeds: [cancelEmbed] });
  }

  // 2. Start Application
  if (customId === 'app_dm_start') {
    session.status = 'IN_PROGRESS';
    session.questionIndex = 0;
    session.answers = [];
    saveApplicationsData(data);

    if (interaction.message) {
      await interaction.message.edit({ components: [] }).catch(() => {});
    }

    const firstQ = APPLICATION_QUESTIONS[0];
    const questionEmbed = new EmbedBuilder()
      .setTitle(`📝 ${firstQ.title}`)
      .setColor(0x5865F2)
      .setDescription(`**Question:** ${firstQ.prompt}\n\n*Please type your answer directly in this chat below:*`)
      .setFooter({ text: `Question 1 of ${APPLICATION_QUESTIONS.length} • Type 'cancel' at any time to abort.` })
      .setTimestamp();

    return interaction.reply({ embeds: [questionEmbed] });
  }

  // 3. Submit Application
  if (customId === 'app_dm_submit') {
    if (!session.answers || session.answers.length < APPLICATION_QUESTIONS.length) {
      return interaction.reply({
        content: '❌ Your application is incomplete. Please answer all questions before submitting.',
        ephemeral: true
      });
    }

    const appId = 'app-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    const now = Date.now();

    const applicationRecord = {
      appId,
      userId: user.id,
      userTag: user.tag || user.username,
      guildId: session.guildId,
      guildName: session.guildName,
      submittedAt: now,
      status: 'PENDING',
      answers: session.answers,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null
    };

    data.applications[appId] = applicationRecord;
    delete data.sessions[user.id];
    saveApplicationsData(data);

    if (interaction.message) {
      await interaction.message.edit({ components: [] }).catch(() => {});
    }

    const successEmbed = new EmbedBuilder()
      .setTitle('🎉 Staff Application Submitted!')
      .setColor(0x57F287)
      .setDescription(
        `Thank you for applying to the **Monroe County Staff Team**!\n\n` +
        `Your application has been received and forwarded to our Management Team for review.\n` +
        `You will receive a notification here in DMs once your application is processed.\n\n` +
        `• **Application ID:** \`${appId}\`\n` +
        `• **Status:** ⏳ Pending Review`
      )
      .setFooter({ text: `Application ID: ${appId}` })
      .setTimestamp();

    await interaction.reply({ embeds: [successEmbed] });

    // Send application to staff review channel
    await dispatchApplicationToReviewChannel(interaction.client, applicationRecord);
  }
}

/**
 * Handles incoming DM text messages from applicants
 */
async function handleApplicationDmMessage(message, client) {
  if (message.guild || message.author.bot) return;

  const data = getApplicationsData();
  const session = data.sessions[message.author.id];

  if (!session || session.status !== 'IN_PROGRESS') return;

  const text = message.content.trim();

  // Handle cancellation
  if (text.toLowerCase() === 'cancel') {
    delete data.sessions[message.author.id];
    saveApplicationsData(data);

    const cancelEmbed = new EmbedBuilder()
      .setTitle('✖️ Application Cancelled')
      .setColor(0xED4245)
      .setDescription('Your staff application has been cancelled. You can start a new application anytime in the server.')
      .setTimestamp();

    return message.channel.send({ embeds: [cancelEmbed] });
  }

  const currentQ = APPLICATION_QUESTIONS[session.questionIndex];
  if (!currentQ) return;

  // Record answer
  session.answers.push({
    index: currentQ.index,
    title: currentQ.title,
    answer: text
  });

  session.questionIndex += 1;

  // Check if more questions remain
  if (session.questionIndex < APPLICATION_QUESTIONS.length) {
    const nextQ = APPLICATION_QUESTIONS[session.questionIndex];
    saveApplicationsData(data);

    const questionEmbed = new EmbedBuilder()
      .setTitle(`📝 ${nextQ.title}`)
      .setColor(0x5865F2)
      .setDescription(`**Question:** ${nextQ.prompt}\n\n*Please type your answer directly in this chat below:*`)
      .setFooter({ text: `Question ${nextQ.index} of ${APPLICATION_QUESTIONS.length} • Type 'cancel' to abort.` })
      .setTimestamp();

    return message.channel.send({ embeds: [questionEmbed] });
  }

  // All 9 questions answered -> Present Review Embed
  session.status = 'REVIEW';
  saveApplicationsData(data);

  let reviewDescription = `You have completed all **9 questions**! Please review your answers below before submitting:\n\n`;
  for (const item of session.answers) {
    reviewDescription += `**${item.title}**\n\`\`\`\n${item.answer.slice(0, 300)}\n\`\`\`\n`;
  }

  const reviewEmbed = new EmbedBuilder()
    .setTitle('📋 Application Review — Ready to Submit')
    .setColor(0x57F287)
    .setDescription(reviewDescription.length > 4000 ? reviewDescription.slice(0, 3990) + '...' : reviewDescription)
    .setFooter({ text: 'Click Submit Application to finalize, or Cancel to abort.' })
    .setTimestamp();

  const reviewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('app_dm_submit')
      .setLabel('Submit Application')
      .setEmoji('📤')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('app_dm_cancel')
      .setLabel('Cancel')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger)
  );

  return message.channel.send({
    embeds: [reviewEmbed],
    components: [reviewRow]
  });
}

/**
 * Dispatches a completed application to the staff review channel
 */
async function dispatchApplicationToReviewChannel(client, appRecord) {
  try {
    const config = getConfig();
    const data = getApplicationsData();

    const targetChannelId =
      config.appLogChannelId ||
      process.env.APP_LOG_CHANNEL_ID ||
      data.channels[appRecord.guildId] ||
      config.logChannelId ||
      process.env.LOG_CHANNEL_ID;

    if (!targetChannelId) return;

    const guild = client.guilds.cache.get(appRecord.guildId) || (await client.guilds.fetch(appRecord.guildId).catch(() => null));
    if (!guild) return;

    const channel = guild.channels.cache.get(targetChannelId) || (await guild.channels.fetch(targetChannelId).catch(() => null));
    if (!channel) return;

    const user = await client.users.fetch(appRecord.userId).catch(() => null);

    const reviewEmbed = new EmbedBuilder()
      .setTitle(`📋 New Staff Application: ${user ? user.tag : appRecord.userTag}`)
      .setColor(0xFEE75C) // Yellow for Pending
      .setThumbnail(user ? user.displayAvatarURL({ dynamic: true }) : null)
      .addFields(
        {
          name: '👤 Applicant',
          value: `<@${appRecord.userId}> (\`${appRecord.userTag}\` • \`${appRecord.userId}\`)`,
          inline: true
        },
        {
          name: '⏰ Submitted At',
          value: `<t:${Math.floor(appRecord.submittedAt / 1000)}:F> (<t:${Math.floor(appRecord.submittedAt / 1000)}:R>)`,
          inline: true
        },
        {
          name: '📌 Application Status',
          value: '⏳ **Pending Staff Review**',
          inline: true
        }
      );

    // Add all 9 Q&A fields
    for (const item of appRecord.answers) {
      reviewEmbed.addFields({
        name: item.title,
        value: item.answer.length > 1024 ? item.answer.slice(0, 1020) + '...' : item.answer,
        inline: false
      });
    }

    reviewEmbed
      .setFooter({ text: `Application ID: ${appRecord.appId}` })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`app_staff_accept_${appRecord.appId}`)
        .setLabel('Accept Application')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`app_staff_deny_${appRecord.appId}`)
        .setLabel('Deny Application')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      embeds: [reviewEmbed],
      components: [actionRow]
    });
  } catch (err) {
    console.error('Error dispatching application to review channel:', err);
  }
}

/**
 * Handles Staff Accept / Deny Buttons and Modal Submissions
 */
async function handleStaffReviewInteraction(interaction) {
  const customId = interaction.customId;

  // 1. Staff Button Click (Accept or Deny)
  if (customId.startsWith('app_staff_accept_') || customId.startsWith('app_staff_deny_')) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        content: '❌ Only staff members with authorized permissions can review applications.',
        ephemeral: true
      });
    }

    const isAccept = customId.startsWith('app_staff_accept_');
    const appId = customId.replace(isAccept ? 'app_staff_accept_' : 'app_staff_deny_', '');

    const data = getApplicationsData();
    const app = data.applications[appId];

    if (!app) {
      return interaction.reply({
        content: '❌ Could not find application record.',
        ephemeral: true
      });
    }

    if (app.status !== 'PENDING') {
      return interaction.reply({
        content: `⚠️ This application has already been **${app.status}** by ${app.reviewedBy || 'another staff member'}.`,
        ephemeral: true
      });
    }

    // Open Modal for reason / feedback
    const modal = new ModalBuilder()
      .setCustomId(`app_modal_${isAccept ? 'accept' : 'deny'}_${appId}`)
      .setTitle(isAccept ? 'Accept Staff Application' : 'Deny Staff Application');

    const reasonInput = new TextInputBuilder()
      .setCustomId('review_reason')
      .setLabel(isAccept ? 'Welcome Message / Notes (Optional)' : 'Reason for Denial')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        isAccept
          ? 'Welcome to the team! Please check #staff-announcements for onboarding.'
          : 'Thank you for applying, but we require more detailed answers / experience at this time.'
      )
      .setRequired(!isAccept)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal);
  }

  // 2. Staff Modal Submission
  if (customId.startsWith('app_modal_accept_') || customId.startsWith('app_modal_deny_')) {
    const isAccept = customId.startsWith('app_modal_accept_');
    const appId = customId.replace(isAccept ? 'app_modal_accept_' : 'app_modal_deny_', '');
    const reason = interaction.fields.getTextInputValue('review_reason') || (isAccept ? 'Accepted by Staff Team.' : 'Denied by Staff Team.');

    const data = getApplicationsData();
    const app = data.applications[appId];

    if (!app) {
      return interaction.reply({
        content: '❌ Could not find application record.',
        ephemeral: true
      });
    }

    app.status = isAccept ? 'ACCEPTED' : 'DENIED';
    app.reviewedBy = interaction.user.tag;
    app.reviewedById = interaction.user.id;
    app.reviewedAt = Date.now();
    app.reviewReason = reason;

    saveApplicationsData(data);

    // Update the message embed in the review channel
    if (interaction.message) {
      const originalEmbed = interaction.message.embeds[0];
      if (originalEmbed) {
        const updatedEmbed = EmbedBuilder.from(originalEmbed)
          .setColor(isAccept ? 0x57F287 : 0xED4245)
          .spliceFields(2, 1, {
            name: '📌 Application Status',
            value: isAccept
              ? `✅ **ACCEPTED** by <@${interaction.user.id}>`
              : `❌ **DENIED** by <@${interaction.user.id}>`,
            inline: true
          })
          .addFields({
            name: isAccept ? '🎉 Acceptance Notes' : '📝 Reason for Denial',
            value: reason,
            inline: false
          });

        await interaction.message.edit({
          embeds: [updatedEmbed],
          components: [] // Remove buttons
        }).catch(console.error);
      }
    }

    await interaction.reply({
      content: `✅ Successfully **${isAccept ? 'ACCEPTED' : 'DENIED'}** application \`${appId}\`. A DM notification has been sent to the applicant.`,
      ephemeral: true
    });

    // Send DM notification to applicant
    try {
      const applicantUser = await interaction.client.users.fetch(app.userId);
      if (applicantUser) {
        const dmEmbed = new EmbedBuilder()
          .setTitle(isAccept ? '🎉 Staff Application Accepted!' : '📬 Staff Application Update')
          .setColor(isAccept ? 0x57F287 : 0xED4245)
          .setDescription(
            isAccept
              ? `Congratulations! Your staff application for **${interaction.guild.name}** has been **ACCEPTED**!\n\n` +
                `**Reviewer:** <@${interaction.user.id}>\n` +
                `**Notes:**\n${reason}\n\n` +
                `Please check the server for your new roles and announcements.`
              : `Thank you for your interest in joining the **${interaction.guild.name}** Staff Team.\n\n` +
                `After careful review, your application has been **DENIED**.\n\n` +
                `**Reason:**\n${reason}\n\n` +
                `You are welcome to re-apply in the future when applications are open!`
          )
          .setFooter({ text: `Application ID: ${appId}` })
          .setTimestamp();

        await applicantUser.send({ embeds: [dmEmbed] });
      }
    } catch (dmErr) {
      console.log(`Could not DM applicant ${app.userId} decision.`);
    }
  }
}

/**
 * Configure application review channel for a guild
 */
function setApplicationReviewChannel(guildId, channelId) {
  const data = getApplicationsData();
  data.channels[guildId] = channelId;
  saveApplicationsData(data);
}

module.exports = {
  APPLICATION_QUESTIONS,
  getApplicationsData,
  saveApplicationsData,
  createApplicationPanelEmbed,
  createApplicationPanelRow,
  handleApplyButtonClick,
  handleApplicationDmInteraction,
  handleApplicationDmMessage,
  handleStaffReviewInteraction,
  setApplicationReviewChannel
};
