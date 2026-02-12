const { RRule } = require('rrule');

/**
 * Generate RRULE string from frequency and start date
 */
function generateRRule(frequency, startDate, timezone = 'UTC', weekdaysOnly = false) {
  const freq = {
    'DAILY': RRule.DAILY,
    'WEEKLY': RRule.WEEKLY,
    'BIWEEKLY': RRule.WEEKLY, // Weekly with interval 2
    'MONTHLY': RRule.MONTHLY
  }[frequency];

  if (!freq) {
    throw new Error(`Invalid frequency: ${frequency}`);
  }

  const options = {
    freq: freq,
    dtstart: new Date(startDate),
    tzid: timezone
  };

  if (weekdaysOnly) {
    options.byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
  }

  // For biweekly, set interval to 2
  if (frequency === 'BIWEEKLY') {
    options.interval = 2;
  }

  const rule = new RRule(options);
  return rule.toString();
}

/**
 * Get next occurrence from RRULE
 */
function getNextOccurrence(rruleString, after = new Date()) {
  try {
    const rule = RRule.fromString(rruleString);
    return rule.after(after, true);
  } catch (error) {
    console.error('Error parsing RRULE:', error);
    return null;
  }
}

/**
 * Get all occurrences between two dates
 */
function getOccurrencesBetween(rruleString, startDate, endDate) {
  try {
    const rule = RRule.fromString(rruleString);
    return rule.between(startDate, endDate, true);
  } catch (error) {
    console.error('Error getting occurrences:', error);
    return [];
  }
}

/**
 * Validate RRULE string
 */
function validateRRule(rruleString) {
  try {
    RRule.fromString(rruleString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format next occurrence for display with notification time
 * @param {string} rruleString - RRULE string
 * @param {number} notificationHour - Hour in rota's timezone (0-23)
 * @param {number} notificationMinute - Minute (0, 15, 30, 45)
 * @param {string} rotaTimezone - Timezone where rota executes (should be UTC)
 * @param {string} displayTimezone - Timezone to display to user (optional, defaults to rotaTimezone)
 */
function formatNextOccurrence(rruleString, notificationHour = 10, notificationMinute = 0, rotaTimezone = 'UTC', displayTimezone = null) {
  const next = getNextOccurrence(rruleString);
  if (!next) {
    return 'Not scheduled';
  }

  // Use displayTimezone if provided, otherwise use rotaTimezone
  const tzToDisplay = displayTimezone || rotaTimezone;

  // Get the date from RRULE (this is just a date, midnight UTC)
  const year = next.getUTCFullYear();
  const month = next.getUTCMonth();
  const day = next.getUTCDate();

  // Create a UTC date with the notification time
  // Since rotas are stored in UTC, notificationHour/Minute are already in UTC
  const utcDate = new Date(Date.UTC(year, month, day, notificationHour, notificationMinute, 0));

  // Format in the display timezone
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tzToDisplay,
    hour12: true
  };

  const formatter = new Intl.DateTimeFormat('en-US', options);
  return formatter.format(utcDate);
}

module.exports = {
  generateRRule,
  getNextOccurrence,
  getOccurrencesBetween,
  validateRRule,
  formatNextOccurrence
};
