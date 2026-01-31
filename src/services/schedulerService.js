const cron = require('node-cron');
const Rota = require('../models/Rota');
const { getNextOccurrence } = require('../utils/rruleHelper');
const { getCurrentHourInTimezone, getCurrentMinuteInTimezone } = require('../utils/timezoneHelper');
const { getNextAssignment } = require('../controllers/rotaController');
const {
  createAssignment,
  markAsNotified,
  assignmentExistsForToday,
  sendNotificationWithRetry,
  getUnnotifiedAssignments
} = require('./assignmentService');
const { schedulerLogger } = require('../utils/logger');

let schedulerTask = null;
let schedulerRetryTask = null;
let isRunning = false;

/**
 * Check if rota should execute today (including catch-up for missed executions)
 * @param {Object} rota - The rota to check
 * @returns {boolean} True if rota should execute now
 */
function shouldExecuteToday(rota) {
  try {
    // Step 1: Check if date matches (RRULE evaluation)
    const nextOccurrence = getNextOccurrence(rota.schedule.rrule);

    if (!nextOccurrence) {
      schedulerLogger.warn('No next occurrence found', { rotaId: rota._id, rotaName: rota.name });
      return false;
    }

    // Check if next occurrence is today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const occurrenceDate = new Date(nextOccurrence);
    occurrenceDate.setHours(0, 0, 0, 0);

    const dateMatches = occurrenceDate >= today && occurrenceDate < tomorrow;

    if (!dateMatches) {
      return false;
    }

    // Step 2: Check if notification time has passed or is current
    // This allows catch-up for missed executions within the same day
    const now = new Date();
    const rotaTz = rota.schedule.timezone || 'UTC';
    const currentHour = getCurrentHourInTimezone(now, rotaTz);
    const currentMinute = getCurrentMinuteInTimezone(now, rotaTz);

    const notificationHour = rota.schedule.notificationHour !== undefined
      ? rota.schedule.notificationHour
      : 10; // Default to 10 AM

    const notificationMinute = rota.schedule.notificationMinute !== undefined
      ? rota.schedule.notificationMinute
      : 0; // Default to :00

    // Calculate if notification time has passed
    // Convert both current and notification time to minutes since midnight for comparison
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const notificationTimeInMinutes = notificationHour * 60 + notificationMinute;

    const timeHasPassed = currentTimeInMinutes >= notificationTimeInMinutes;
    const exactMatch = currentHour === notificationHour && currentMinute === notificationMinute;
    const isCatchUp = timeHasPassed && !exactMatch;

    schedulerLogger.debug('Time check for rota', {
      rotaId: rota._id,
      rotaName: rota.name,
      timezone: rotaTz,
      currentHour,
      currentMinute,
      notificationHour,
      notificationMinute,
      currentTimeInMinutes,
      notificationTimeInMinutes,
      dateMatches,
      timeHasPassed,
      exactMatch,
      isCatchUp,
      shouldExecute: timeHasPassed
    });

    // Grace period: Allow execution if time has passed today
    // This enables catch-up for missed executions
    return timeHasPassed;
  } catch (error) {
    schedulerLogger.error('Error checking if rota should execute', {
      error: error.message,
      rotaId: rota._id
    });
    return false;
  }
}

/**
 * Process a single rota
 */
async function processRota(rota) {
  try {
    const rotaId = rota._id;
    const workspaceId = rota.workspaceId;

    schedulerLogger.info('Processing rota', {
      rotaId,
      rotaName: rota.name,
      workspaceId
    });

    // Check if assignment already exists for today
    const alreadyAssigned = await assignmentExistsForToday(rotaId, new Date());
    if (alreadyAssigned) {
      schedulerLogger.info('Assignment already exists for today', { rotaId, rotaName: rota.name });
      return { success: true, skipped: true, reason: 'already_assigned' };
    }

    // Get next assignment
    const { userId, rotaName, channelId } = await getNextAssignment(rotaId, workspaceId);
    schedulerLogger.info('Next assignment determined', { rotaId, userId, channelId });

    // Create assignment record
    const assignment = await createAssignment(rotaId, workspaceId, userId, channelId, new Date());

    // Send notification with skip button
    const messageTs = await sendNotificationWithRetry(
      workspaceId,
      channelId,
      userId,
      rotaName,
      rota.customMessage,
      assignment._id,        // Pass assignment ID for skip button
      rota.members.length    // Pass member count to determine button visibility
    );

    // Mark as notified
    await markAsNotified(assignment._id, messageTs);

    schedulerLogger.info('Rota processed successfully', {
      rotaId,
      rotaName,
      userId,
      messageTs
    });

    return { success: true, rotaId, userId, messageTs };
  } catch (error) {
    schedulerLogger.error('Error processing rota', {
      error: error.message,
      stack: error.stack,
      rotaId,
      rotaName: rota.name
    });
    return { success: false, rotaId, error: error.message };
  }
}

/**
 * Process all active rotas
 */
async function processAllRotas() {
  if (isRunning) {
    schedulerLogger.info('Scheduler already running, skipping this cycle');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    schedulerLogger.info('Starting scheduler cycle');

    // Get all active rotas
    const rotas = await Rota.find({ isActive: true });
    schedulerLogger.info(`Found ${rotas.length} active rotas`);

    if (rotas.length === 0) {
      schedulerLogger.info('No active rotas to process');
      return;
    }

    const results = {
      total: rotas.length,
      processed: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    // Process each rota
    for (const rota of rotas) {
      // Check if this rota should execute today
      if (!shouldExecuteToday(rota)) {
        schedulerLogger.info('Rota not scheduled for today', {
          rotaId: rota._id,
          rotaName: rota.name
        });
        results.skipped++;
        continue;
      }

      const result = await processRota(rota);

      if (result.success) {
        if (result.skipped) {
          results.skipped++;
        } else {
          results.processed++;
        }
      } else {
        results.failed++;
        results.errors.push({
          rotaId: result.rotaId,
          error: result.error
        });
      }
    }

    const duration = Date.now() - startTime;
    schedulerLogger.info('Scheduler cycle completed', {
      duration: `${duration}ms`,
      ...results
    });

    return results;
  } catch (error) {
    schedulerLogger.error('Error in scheduler cycle', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * Retry failed notifications
 */
async function retryFailedNotifications() {
  try {
    schedulerLogger.info('Starting retry of failed notifications');

    // Get all workspaces with unnotified assignments
    const unnotified = await getUnnotifiedAssignments();

    if (unnotified.length === 0) {
      schedulerLogger.info('No failed notifications to retry');
      return;
    }

    schedulerLogger.info(`Found ${unnotified.length} unnotified assignments to retry`);

    let retried = 0;
    let failed = 0;

    for (const assignment of unnotified) {
      try {
        // Get rota details
        const rota = await Rota.findById(assignment.rotaId);
        if (!rota) {
          schedulerLogger.warn('Rota not found for assignment', { assignmentId: assignment._id });
          continue;
        }

        // Retry notification
        const messageTs = await sendNotificationWithRetry(
          assignment.workspaceId,
          assignment.channelId,
          assignment.userId,
          rota.name,
          rota.customMessage,
          2 // Fewer retries for retry job
        );

        await markAsNotified(assignment._id, messageTs);
        retried++;
      } catch (error) {
        schedulerLogger.error('Failed to retry notification', {
          assignmentId: assignment._id,
          error: error.message
        });
        failed++;
      }
    }

    schedulerLogger.info('Retry job completed', { retried, failed });
  } catch (error) {
    schedulerLogger.error('Error in retry job', { error: error.message });
  }
}

/**
 * Start the scheduler
 */
function startScheduler() {
  if (schedulerTask) {
    schedulerLogger.warn('Scheduler already running');
    return;
  }

  // Run every 15 minutes
  // Cron format: minute hour day month weekday
  // */15 means every 15 minutes (0, 15, 30, 45)
  schedulerTask = cron.schedule('*/15 * * * *', async () => {
    schedulerLogger.info('Scheduler triggered by cron');
    await processAllRotas();
  });

  // Also run retry job every 6 hours
  schedulerRetryTask = cron.schedule('0 */6 * * *', async () => {
    schedulerLogger.info('Retry job triggered by cron');
    await retryFailedNotifications();
  });

  schedulerLogger.info('Scheduler started - runs every 15 minutes (0, 15, 30, 45)');
  schedulerLogger.info('Retry job started - runs every 6 hours');

  // Run immediately on startup (optional)
  if (process.env.RUN_SCHEDULER_ON_START === 'true') {
    schedulerLogger.info('Running scheduler immediately on startup');
    setTimeout(() => processAllRotas(), 5000); // Wait 5 seconds after startup
  }
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  schedulerTask?.stop();
  schedulerTask = null;
  schedulerRetryTask?.stop();
  schedulerRetryTask = null;
  schedulerLogger.info('Scheduler stopped');
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    running: !!schedulerTask,
    isProcessing: isRunning
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  processAllRotas,
  retryFailedNotifications
};
