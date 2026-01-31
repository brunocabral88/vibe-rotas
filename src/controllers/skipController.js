const RotaAssignment = require('../models/RotaAssignment');
const Rota = require('../models/Rota');
const { canSkipAssignment, getNextAvailablePerson } = require('../utils/skipHelper');
const { createAssignment, markAsNotified, sendNotificationWithRetry } = require('../services/assignmentService');
const { getSlackClient } = require('../services/slackClient');
const { logger } = require('../utils/logger');

/**
 * Validate that a skip request is allowed
 */
async function validateSkipRequest(assignmentId) {
  try {
    // Check assignment exists
    const assignment = await RotaAssignment.findById(assignmentId);
    if (!assignment) {
      return {
        valid: false,
        reason: 'Assignment not found',
        assignment: null
      };
    }

    // Check assignment hasn't already been skipped
    if (assignment.skipped) {
      return {
        valid: false,
        reason: 'This assignment has already been skipped',
        assignment
      };
    }

    // Check if skip is allowed (limits, etc.)
    const skipCheck = await canSkipAssignment(assignment.rotaId, assignment.assignedDate);
    if (!skipCheck.canSkip) {
      return {
        valid: false,
        reason: skipCheck.reason,
        assignment
      };
    }

    return {
      valid: true,
      reason: null,
      assignment
    };
  } catch (error) {
    logger.error('Error validating skip request', {
      error: error.message,
      assignmentId
    });
    return {
      valid: false,
      reason: 'Error validating skip request',
      assignment: null
    };
  }
}

/**
 * Perform the skip operation
 */
async function performSkip(assignment, skippedByUserId) {
  try {
    logger.info('Starting skip operation', {
      assignmentId: assignment._id,
      rotaId: assignment.rotaId,
      skippedUserId: assignment.userId,
      skippedBy: skippedByUserId
    });

    // Load the rota
    const rota = await Rota.findById(assignment.rotaId);
    if (!rota) {
      throw new Error('Rota not found');
    }

    // Get next available person
    const nextPerson = await getNextAvailablePerson(rota, assignment.assignedDate);

    // Create new assignment
    const newAssignment = await createAssignment(
      assignment.rotaId,
      assignment.workspaceId,
      nextPerson.userId,
      assignment.channelId,
      assignment.assignedDate
    );

    // Mark original assignment as skipped
    assignment.skipped = true;
    assignment.skippedBy = skippedByUserId;
    assignment.skippedAt = new Date();
    assignment.replacedByAssignmentId = newAssignment._id;
    await assignment.save();

    // Update rota's current index
    rota.currentIndex = nextPerson.newIndex;
    await rota.save();

    // Update original message
    const client = await getSlackClient(assignment.workspaceId);
    await updateSkippedMessage(
      client,
      assignment.channelId,
      assignment.messageTs,
      assignment.userId,
      skippedByUserId,
      rota.name
    );

    // Send new notification
    const messageTs = await sendNotificationWithRetry(
      assignment.workspaceId,
      assignment.channelId,
      nextPerson.userId,
      rota.name,
      rota.customMessage
    );

    // Mark new assignment as notified
    await markAsNotified(newAssignment._id, messageTs);

    logger.info('Skip operation completed', {
      originalAssignmentId: assignment._id,
      newAssignmentId: newAssignment._id,
      newUserId: nextPerson.userId,
      newIndex: nextPerson.newIndex
    });

    return {
      success: true,
      newAssignment,
      newUserId: nextPerson.userId
    };
  } catch (error) {
    logger.error('Error performing skip', {
      error: error.message,
      stack: error.stack,
      assignmentId: assignment._id
    });
    throw error;
  }
}

/**
 * Update the original message to show it was skipped
 */
async function updateSkippedMessage(client, channelId, messageTs, skippedUserId, skippedByUserId, rotaName) {
  try {
    if (!messageTs) {
      logger.warn('No message timestamp, cannot update message', { channelId });
      return;
    }

    // Get the original message
    const result = await client.conversationsHistory(channelId, {
      latest: messageTs,
      inclusive: true,
      limit: 1
    });

    if (!result.messages || result.messages.length === 0) {
      logger.warn('Original message not found', { channelId, messageTs });
      return;
    }

    // Create strikethrough blocks
    const updatedBlocks = [];

    // Strikethrough the main content
    updatedBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `~📅 ${rotaName}~\n\n~Assigned: <@${skippedUserId}>~`
      }
    });

    // Add skip note
    const skipTime = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    updatedBlocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `⏭️ Skipped by <@${skippedByUserId}> on ${skipTime}`
        }
      ]
    });

    // Update the message
    await client.chatUpdate(
      channelId,
      messageTs,
      `~📅 ${rotaName} - Assigned: <@${skippedUserId}>~`,
      updatedBlocks
    );

    logger.info('Updated skipped message', {
      channelId,
      messageTs,
      skippedUserId,
      skippedByUserId
    });
  } catch (error) {
    logger.error('Error updating skipped message', {
      error: error.message,
      channelId,
      messageTs
    });
    // Don't throw - this is not critical enough to fail the whole skip operation
  }
}

/**
 * Main handler for skip person action
 */
async function handleSkipPerson(payload) {
  try {
    const { actions, user } = payload;
    const action = actions[0];

    // Extract assignment ID from action_id (format: skip_person_{assignmentId})
    const assignmentId = action.action_id.replace('skip_person_', '');

    logger.info('Handling skip person action', {
      assignmentId,
      userId: user.id
    });

    // Validate the skip request
    const validation = await validateSkipRequest(assignmentId);
    if (!validation.valid) {
      logger.warn('Skip request validation failed', {
        assignmentId,
        reason: validation.reason
      });
      return {
        success: false,
        error: validation.reason
      };
    }

    // Perform the skip
    const result = await performSkip(validation.assignment, user.id);

    return {
      success: true,
      newUserId: result.newUserId
    };
  } catch (error) {
    logger.error('Error handling skip person', {
      error: error.message,
      stack: error.stack
    });
    return {
      success: false,
      error: 'Failed to skip person. Please try again.'
    };
  }
}

module.exports = {
  handleSkipPerson,
  validateSkipRequest,
  performSkip
};
