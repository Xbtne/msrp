const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../utils/ticketHandler');

const reviewsDataPath = path.join(__dirname, '../../data/reviews.json');

function getReviewsData() {
  try {
    if (!fs.existsSync(reviewsDataPath)) {
      fs.writeFileSync(reviewsDataPath, '{}', 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(reviewsDataPath, 'utf8'));
  } catch (err) {
    console.error('Error reading reviews.json:', err);
    return {};
  }
}

function saveReviewsData(data) {
  try {
    fs.writeFileSync(reviewsDataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving reviews.json:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffreview')
    .setDescription('Submit a review and star rating for a staff member')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addUserOption(opt =>
      opt
        .setName('staff')
        .setDescription('The staff member you want to review')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('rating')
        .setDescription('Star rating for the staff member')
        .setRequired(true)
        .addChoices(
          { name: '⭐⭐⭐⭐⭐ (5/5 Stars - Excellent)', value: 5 },
          { name: '⭐⭐⭐⭐ (4/5 Stars - Great)', value: 4 },
          { name: '⭐⭐⭐ (3/5 Stars - Average)', value: 3 },
          { name: '⭐⭐ (2/5 Stars - Needs Improvement)', value: 2 },
          { name: '⭐ (1/5 Star - Poor)', value: 1 }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('review')
        .setDescription('Your feedback and review details')
        .setRequired(true)
    )
    .addBooleanOption(opt =>
      opt
        .setName('anonymous')
        .setDescription('Submit this review anonymously (default: False)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetStaff = interaction.options.getUser('staff');
    const rating = interaction.options.getInteger('rating');
    const reviewText = interaction.options.getString('review');
    const isAnonymous = interaction.options.getBoolean('anonymous') || false;

    if (targetStaff.bot) {
      return interaction.reply({
        content: '❌ You cannot submit a staff review for a bot.',
        ephemeral: true
      });
    }

    const starIcons = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

    // Dynamic color based on rating
    let embedColor = 0x5865F2;
    if (rating === 5) embedColor = 0x57F287; // Green
    else if (rating === 4) embedColor = 0x5865F2; // Blurple
    else if (rating === 3) embedColor = 0xFEE75C; // Yellow
    else embedColor = 0xED4245; // Red

    const reviewEmbed = new EmbedBuilder()
      .setTitle('⭐ Staff Review Submitted')
      .setColor(embedColor)
      .setThumbnail(targetStaff.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: '👤 Staff Member',
          value: `<@${targetStaff.id}> (\`${targetStaff.tag}\`)`,
          inline: true
        },
        {
          name: '⭐ Rating',
          value: `**${starIcons}** (${rating}/5)`,
          inline: true
        },
        {
          name: '💬 Feedback / Review',
          value: reviewText,
          inline: false
        },
        {
          name: '✍️ Submitted By',
          value: isAnonymous ? '🕵️ *Anonymous Member*' : `<@${interaction.user.id}> (\`${interaction.user.tag}\`)`,
          inline: false
        }
      )
      .setFooter({
        text: `Monroe County Staff Feedback • Review ID: ${Date.now().toString(36)}`,
        iconURL: interaction.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    // Save to reviews.json
    const reviewsData = getReviewsData();
    const guildId = interaction.guild.id;
    if (!reviewsData[guildId]) reviewsData[guildId] = [];

    const reviewRecord = {
      id: Date.now().toString(36),
      staffId: targetStaff.id,
      staffTag: targetStaff.tag,
      reviewerId: isAnonymous ? 'Anonymous' : interaction.user.id,
      reviewerTag: isAnonymous ? 'Anonymous' : interaction.user.tag,
      rating: rating,
      review: reviewText,
      anonymous: isAnonymous,
      timestamp: new Date().toISOString()
    };

    reviewsData[guildId].push(reviewRecord);
    saveReviewsData(reviewsData);

    const config = getConfig();
    const reviewsChannelId = config.reviewsChannelId || process.env.REVIEWS_CHANNEL_ID;

    // If designated reviews channel is configured, send there and reply with confirmation
    if (reviewsChannelId && reviewsChannelId !== interaction.channel.id) {
      const reviewsChannel =
        interaction.guild.channels.cache.get(reviewsChannelId) ||
        (await interaction.guild.channels.fetch(reviewsChannelId).catch(() => null));

      if (reviewsChannel) {
        await reviewsChannel.send({ embeds: [reviewEmbed] }).catch(console.error);

        return interaction.reply({
          content: `✅ Thank you! Your **${rating}⭐ review** for <@${targetStaff.id}> has been posted to ${reviewsChannel}!`,
          ephemeral: true
        });
      }
    }

    // Otherwise, post directly in current channel
    return interaction.reply({
      embeds: [reviewEmbed]
    });
  }
};
