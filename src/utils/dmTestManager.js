const { EmbedBuilder } = require('discord.js');

/**
 * In-memory map of active DM test tasks
 * Key: userId (string) -> TaskState object
 */
const activeDmTasks = new Map();

/**
 * Retrieves an active DM test task for a user
 * @param {string} userId
 * @returns {object|null}
 */
function getActiveTask(userId) {
  return activeDmTasks.get(userId) || null;
}

/**
 * Checks if a user currently has an active DM test task
 * @param {string} userId
 * @returns {boolean}
 */
function hasActiveTask(userId) {
  return activeDmTasks.has(userId);
}

/**
 * Cancels an active DM test task
 * @param {string} userId
 * @param {string} reason
 * @returns {object|null} The cancelled task object if found, otherwise null
 */
function cancelActiveTask(userId, reason = 'Cancelled by administrator') {
  const task = activeDmTasks.get(userId);
  if (!task) return null;

  task.cancel(reason);
  activeDmTasks.delete(userId);
  return task;
}

/**
 * Asynchronously executes a DM test task with rate limit, infinite mode, and cancellation support
 * @param {object} params
 * @param {import('discord.js').User} params.targetUser - The recipient user
 * @param {import('discord.js').User} params.adminUser - The admin who initiated the test
 * @param {string} params.messageText - The message content to send
 * @param {number} params.count - Number of messages to send (0 for infinite)
 * @param {number} params.delayMs - Delay in milliseconds between messages
 * @param {import('discord.js').TextBasedChannel} [params.channel] - Channel to post status updates
 * @returns {object} The created task state
 */
function startDmTestTask({ targetUser, adminUser, messageText, count, delayMs = 1000, channel = null }) {
  const parsedCount = parseInt(count, 10);
  const isInfinite = parsedCount === 0;
  const safeCount = isInfinite ? 0 : Math.max(1, parsedCount || 1);
  const safeDelayMs = Math.max(1000, parseInt(delayMs, 10) || 1000);

  let sleepResolver = null;

  const taskState = {
    userId: targetUser.id,
    userTag: targetUser.tag || targetUser.username,
    adminId: adminUser.id,
    adminTag: adminUser.tag || adminUser.username,
    messageText,
    count: safeCount,
    isInfinite,
    delayMs: safeDelayMs,
    sent: 0,
    status: 'running',
    isCancelled: false,
    cancelReason: null,
    startedAt: new Date(),
    cancel(reason = 'Cancelled by administrator') {
      if (this.isCancelled) return;
      this.isCancelled = true;
      this.status = 'cancelled';
      this.cancelReason = reason;
      if (sleepResolver) {
        sleepResolver(false);
        sleepResolver = null;
      }
    }
  };

  activeDmTasks.set(targetUser.id, taskState);

  // Run the sending loop asynchronously in the background so it does not block the event loop
  (async () => {
    try {
      let i = 1;
      while (!taskState.isCancelled && (taskState.isInfinite || i <= taskState.count)) {
        // Send DM
        try {
          const progressText = taskState.isInfinite
            ? `Message \`${i}\` (Continuous)`
            : `Message \`${i}\` of \`${taskState.count}\``;

          const contentPrefix = taskState.isInfinite
            ? `**[DM Test #${i}]**\n`
            : `**[DM Test ${i}/${taskState.count}]**\n`;

          const testEmbed = new EmbedBuilder()
            .setTitle('🧪 DM Bot Testing & Diagnostics')
            .setDescription(taskState.messageText)
            .setColor(0x5865F2)
            .addFields(
              { name: '📊 Progress', value: progressText, inline: true },
              { name: '⏱️ Interval', value: `\`${(taskState.delayMs / 1000).toFixed(1)}s\``, inline: true },
              { name: '🛡️ Initiated By', value: `<@${taskState.adminId}>`, inline: true }
            )
            .setFooter({ text: 'Monroe County Bot • Direct Testing' })
            .setTimestamp();

          await targetUser.send({
            content: `${contentPrefix}${taskState.messageText}`,
            embeds: [testEmbed]
          });

          taskState.sent = i;
        } catch (err) {
          // Handle specific Discord API errors
          if (err.code === 50007) {
            // Cannot send messages to this user (DMs disabled / bot blocked)
            taskState.cancel('User has direct messages closed or has blocked the bot.');
            if (channel && channel.isTextBased()) {
              await channel.send({
                content: `❌ **DM Test Aborted for <@${targetUser.id}>:** Unable to deliver direct messages. The user's DMs are closed or the bot is blocked.`
              }).catch(() => {});
            }
            break;
          } else if (err.status === 429 || err.code === 429) {
            // Rate limit hit - handle retry_after safely
            const retryAfter = (err.rawError?.retry_after || 2) * 1000;
            console.warn(`[DM Test] Rate limit encountered for user ${targetUser.id}. Pausing for ${retryAfter}ms`);
            await new Promise(r => setTimeout(r, retryAfter));
            // Retry this message without incrementing i
            continue;
          } else {
            taskState.cancel(`Error sending DM: ${err.message}`);
            if (channel && channel.isTextBased()) {
              await channel.send({
                content: `❌ **DM Test Error for <@${targetUser.id}>:** Failed delivering message \`${i}\`: \`${err.message}\``
              }).catch(() => {});
            }
            break;
          }
        }

        i++;

        // Wait delay before next message if task is still running
        const hasMoreMessages = taskState.isInfinite || i <= taskState.count;
        if (hasMoreMessages && !taskState.isCancelled) {
          const shouldContinue = await new Promise(resolve => {
            sleepResolver = resolve;
            setTimeout(() => {
              if (sleepResolver) {
                sleepResolver = null;
                resolve(true);
              }
            }, taskState.delayMs);
          });

          if (!shouldContinue || taskState.isCancelled) {
            break;
          }
        }
      }

      // Handle completion notifications
      if (taskState.status === 'running' && !taskState.isCancelled && !taskState.isInfinite) {
        taskState.status = 'completed';
        if (channel && channel.isTextBased()) {
          const doneEmbed = new EmbedBuilder()
            .setTitle('✅ DM Test Completed')
            .setDescription(`Successfully sent all **${taskState.sent}/${taskState.count}** test messages to <@${targetUser.id}>.`)
            .setColor(0x57F287)
            .addFields(
              { name: 'Target', value: `<@${targetUser.id}>`, inline: true },
              { name: 'Total Sent', value: `\`${taskState.sent}\``, inline: true },
              { name: 'Initiator', value: `<@${taskState.adminId}>`, inline: true }
            )
            .setTimestamp();

          await channel.send({ embeds: [doneEmbed] }).catch(() => {});
        }
      } else if (taskState.isCancelled && channel && channel.isTextBased()) {
        const totalCountDisplay = taskState.isInfinite ? 'Infinite mode' : `${taskState.sent}/${taskState.count}`;
        const cancelNoticeEmbed = new EmbedBuilder()
          .setTitle('⏹️ DM Test Stopped')
          .setDescription(`The DM test session for <@${targetUser.id}> was stopped.\n\n• **Messages Sent:** \`${taskState.sent}\` (${totalCountDisplay})\n• **Reason:** ${taskState.cancelReason || 'Cancelled'}`)
          .setColor(0xED4245)
          .setTimestamp();

        await channel.send({ embeds: [cancelNoticeEmbed] }).catch(() => {});
      }
    } catch (fatalErr) {
      console.error('[DM Test Manager Fatal Error]:', fatalErr);
      taskState.cancel(`Fatal error: ${fatalErr.message}`);
    } finally {
      activeDmTasks.delete(targetUser.id);
    }
  })();

  return taskState;
}

module.exports = {
  activeDmTasks,
  getActiveTask,
  hasActiveTask,
  cancelActiveTask,
  startDmTestTask
};
