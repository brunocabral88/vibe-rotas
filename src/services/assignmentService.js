const RotaAssignment = require('../models/RotaAssignment');
const { getSlackClient } = require('./slackClient');
const { schedulerLogger } = require('../utils/logger');

/**
 * Create a new assignment record
 */
async function createAssignment(rotaId, workspaceId, userId, channelId, assignedDate) {
  try {
    const assignment = new RotaAssignment({
      rotaId,
      workspaceId,
      userId,
      assignedDate,
      channelId,
      notified: false
    });

    await assignment.save();
    schedulerLogger.info('Created assignment', { rotaId, userId, assignedDate });
    return assignment;
  } catch (error) {
    schedulerLogger.error('Error creating assignment', { error: error.message, rotaId, userId });
    throw error;
  }
}

/**
 * Mark assignment as notified
 */
async function markAsNotified(assignmentId, messageTs) {
  try {
    const assignment = await RotaAssignment.findByIdAndUpdate(
      assignmentId,
      {
        notified: true,
        notificationSentAt: new Date(),
        messageTs
      },
      { new: true }
    );

    schedulerLogger.info('Marked assignment as notified', { assignmentId, messageTs });
    return assignment;
  } catch (error) {
    schedulerLogger.error('Error marking assignment as notified', { error: error.message, assignmentId });
    throw error;
  }
}

/**
 * Get current assignment for today for a rota
 */
async function getCurrentAssignment(rotaId) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  return await RotaAssignment.findOne({
    rotaId,
    assignedDate: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  }).sort({ createdAt: -1 });
}

/**
 * Get recent assignments for a rota
 */
async function getRecentAssignments(rotaId, limit = 10) {
  return await RotaAssignment
    .find({ rotaId })
    .sort({ assignedDate: -1 })
    .limit(limit);
}

/**
 * Get unnotified assignments (for retry logic)
 */
async function getUnnotifiedAssignments(workspaceId) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - 24); // Only retry assignments from last 24 hours

  return await RotaAssignment
    .find({
      workspaceId,
      notified: false,
      createdAt: { $gte: cutoffDate }
    })
    .sort({ createdAt: 1 });
}

/**
 * Check if assignment already exists for today
 */
async function assignmentExistsForToday(rotaId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const existing = await RotaAssignment.findOne({
    rotaId,
    assignedDate: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  });

  return !!existing;
}

/**
 * Render message template with user substitution
 * Handles both legacy mrkdwn templates and new rich_text templates
 */
function renderMessageTemplate(template, userId, rotaName) {
  const rendered = JSON.parse(JSON.stringify(template)); // Deep clone

  // Recursively replace placeholders and user mentions
  function replaceInObject(obj) {
    if (typeof obj === 'string') {
      return obj
        .replace(/\{userId\}/g, userId)
        .replace(/\{rotaName\}/g, rotaName);
    } else if (Array.isArray(obj)) {
      return obj.map(replaceInObject);
    } else if (typeof obj === 'object' && obj !== null) {
      // Handle rich_text user mentions
      if (obj.type === 'user' && obj.user_id === '{userId}') {
        return {
          ...obj,
          user_id: userId
        };
      }

      const newObj = {};
      for (const key in obj) {
        newObj[key] = replaceInObject(obj[key]);
      }
      return newObj;
    }
    return obj;
  }

  return replaceInObject(rendered);
}

/**
 * Send rota notification to channel
 * @param {string} workspaceId - Workspace ID
 * @param {string} channelId - Channel ID
 * @param {string} userId - User ID to assign
 * @param {string} rotaName - Name of the rota
 * @param {Object} customMessage - Optional custom message
 * @param {string} assignmentId - Assignment ID for skip button
 * @param {number} memberCount - Number of members in rota (for skip button visibility)
 */
async function sendRotaNotification(workspaceId, channelId, userId, rotaName, customMessage, assignmentId = null, memberCount = 1) {
  try {
    const client = await getSlackClient(workspaceId);

    // Build the notification blocks
    const blocks = [];

    // Always include standard header with rota name and assigned person
    const headerBlock = {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'text',
              text: `📅 ${rotaName}\n\nAssigned: `,
              style: { bold: true }
            },
            {
              type: 'user',
              user_id: userId
            }
          ]
        }
      ]
    };

    blocks.push(headerBlock);

    // Add custom message if provided
    if (customMessage && customMessage.elements && customMessage.elements.length > 0) {
      // Render custom message with user substitution
      const renderedCustomMessage = renderMessageTemplate(customMessage, userId, rotaName);
      blocks.push({ type: 'divider' });
      blocks.push(renderedCustomMessage);
    }

    // Add skip button if assignment ID provided and rota has more than 1 member
    if (assignmentId && memberCount > 1) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '⏭️ Skip Person',
              emoji: true
            },
            action_id: `skip_person_${assignmentId}`,
            value: assignmentId
          }
        ]
      });
    }

    // Send message
    const result = await client.chatPostMessage(
      channelId,
      `📅 ${rotaName} - Assigned: <@${userId}>`,
      blocks
    );

    schedulerLogger.info('Sent rota notification', {
      workspaceId,
      channelId,
      userId,
      rotaName,
      messageTs: result.ts,
      hasSkipButton: !!(assignmentId && memberCount > 1)
    });

    return result.ts;
  } catch (error) {
    schedulerLogger.error('Error sending rota notification', {
      error: error.message,
      workspaceId,
      channelId,
      userId
    });
    throw error;
  }
}

/**
 * Send notification with retry logic
 */
async function sendNotificationWithRetry(workspaceId, channelId, userId, rotaName, customMessage, assignmentId = null, memberCount = 1, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const messageTs = await sendRotaNotification(workspaceId, channelId, userId, rotaName, customMessage, assignmentId, memberCount);
      return messageTs;
    } catch (error) {
      lastError = error;
      schedulerLogger.warn(`Notification attempt ${attempt} failed`, {
        workspaceId,
        channelId,
        userId,
        error: error.message
      });

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to send notification after ${maxRetries} attempts: ${lastError.message}`);
}

module.exports = {
  createAssignment,
  markAsNotified,
  getCurrentAssignment,
  getRecentAssignments,
  getUnnotifiedAssignments,
  assignmentExistsForToday,
  renderMessageTemplate,
  sendRotaNotification,
  sendNotificationWithRetry
};
