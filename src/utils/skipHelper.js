const RotaAssignment = require('../models/RotaAssignment');
const Rota = require('../models/Rota');
const { logger } = require('../utils/logger');

/**
 * Get assignments for a specific date
 */
async function getAssignmentsForDate(rotaId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return await RotaAssignment.find({
    rotaId,
    assignedDate: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  }).sort({ createdAt: 1 }); // Oldest first for counting
}

/**
 * Count consecutive skips from the most recent assignment backwards
 */
async function getConsecutiveSkipCount(rotaId, date) {
  try {
    const assignments = await getAssignmentsForDate(rotaId, date);

    if (assignments.length === 0) {
      return 0;
    }

    // Count backwards from most recent
    let skipCount = 0;
    for (let i = assignments.length - 1; i >= 0; i--) {
      if (assignments[i].skipped) {
        skipCount++;
      } else {
        break; // Stop at first non-skipped assignment
      }
    }

    return skipCount;
  } catch (error) {
    logger.error('Error counting consecutive skips', {
      error: error.message,
      rotaId,
      date
    });
    return 0;
  }
}

/**
 * Check if an assignment can be skipped
 * Returns { canSkip: boolean, reason: string }
 */
async function canSkipAssignment(rotaId, date) {
  try {
    // Get the rota
    const rota = await Rota.findById(rotaId);
    if (!rota) {
      return {
        canSkip: false,
        reason: 'Rota not found'
      };
    }

    // Check if rota has more than 1 member
    if (rota.members.length <= 1) {
      return {
        canSkip: false,
        reason: 'Cannot skip when rota has only one member'
      };
    }

    // Check consecutive skip count
    const consecutiveSkips = await getConsecutiveSkipCount(rotaId, date);
    const maxSkips = rota.members.length - 1;

    if (consecutiveSkips >= maxSkips) {
      return {
        canSkip: false,
        reason: `Cannot skip: all other members have been skipped (${consecutiveSkips}/${maxSkips})`
      };
    }

    return {
      canSkip: true,
      reason: null
    };
  } catch (error) {
    logger.error('Error checking if assignment can be skipped', {
      error: error.message,
      rotaId,
      date
    });
    return {
      canSkip: false,
      reason: 'Error validating skip request'
    };
  }
}

/**
 * Get the next available person in the rotation
 * Excludes users who have already been assigned today
 */
async function getNextAvailablePerson(rota, date) {
  try {
    // Get today's assignments to find who's already been assigned
    const todaysAssignments = await getAssignmentsForDate(rota._id, date);
    const assignedUserIds = todaysAssignments.map(a => a.userId);

    // Find next person who hasn't been assigned today
    const members = rota.members;
    let currentIndex = rota.currentIndex;
    let attempts = 0;

    while (attempts < members.length) {
      // Move to next person
      currentIndex = (currentIndex + 1) % members.length;
      const nextUserId = members[currentIndex];

      // Check if this person hasn't been assigned today
      if (!assignedUserIds.includes(nextUserId)) {
        return {
          userId: nextUserId,
          newIndex: currentIndex
        };
      }

      attempts++;
    }

    // If we've tried everyone and all have been assigned (shouldn't happen with skip limits)
    // Return the next person in rotation anyway
    const fallbackIndex = (rota.currentIndex + 1) % members.length;
    return {
      userId: members[fallbackIndex],
      newIndex: fallbackIndex
    };
  } catch (error) {
    logger.error('Error getting next available person', {
      error: error.message,
      rotaId: rota._id
    });
    throw error;
  }
}

module.exports = {
  getAssignmentsForDate,
  getConsecutiveSkipCount,
  canSkipAssignment,
  getNextAvailablePerson
};
