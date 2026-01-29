/**
 * Timezone Helper Utilities
 * Provides functions for timezone conversions and time comparisons
 */

/**
 * Get the current hour in a specific timezone
 * @param {Date} date - The date to convert
 * @param {string} timezone - IANA timezone (e.g., 'America/New_York', 'Europe/London')
 * @returns {number} Hour in 24-hour format (0-23)
 */
function getCurrentHourInTimezone(date, timezone) {
  try {
    // Use Intl.DateTimeFormat for accurate timezone conversion
    // This handles DST automatically
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find(part => part.type === 'hour');

    if (!hourPart) {
      throw new Error('Hour part not found in formatted date');
    }

    return parseInt(hourPart.value, 10);
  } catch (error) {
    // If timezone is invalid or any error occurs, default to UTC
    console.error(`Error getting hour in timezone ${timezone}:`, error.message);
    return date.getUTCHours();
  }
}

/**
 * Get the current minute in a specific timezone
 * @param {Date} date - The date to convert
 * @param {string} timezone - IANA timezone (e.g., 'America/New_York', 'Europe/London')
 * @returns {number} Minute (0-59)
 */
function getCurrentMinuteInTimezone(date, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      minute: 'numeric'
    });

    const parts = formatter.formatToParts(date);
    const minutePart = parts.find(part => part.type === 'minute');

    if (!minutePart) {
      throw new Error('Minute part not found in formatted date');
    }

    return parseInt(minutePart.value, 10);
  } catch (error) {
    console.error(`Error getting minute in timezone ${timezone}:`, error.message);
    return date.getUTCMinutes();
  }
}

/**
 * Format hour and minute for display
 * @param {number} hour - Hour in 24-hour format (0-23)
 * @param {number} minute - Minute (0-59)
 * @returns {string} Formatted string (e.g., "10:30 (10:30 AM)")
 */
function formatTimeDisplay(hour, minute = 0) {
  const minuteStr = minute.toString().padStart(2, '0');
  let label = '';

  // Format for 12-hour display
  let displayHour = hour;
  let period = 'AM';

  if (hour === 0) {
    displayHour = 12;
    period = 'AM';
  } else if (hour === 12) {
    displayHour = 12;
    period = 'PM';
  } else if (hour > 12) {
    displayHour = hour - 12;
    period = 'PM';
  }

  label += `${displayHour}:${minuteStr} ${period}`;

  return label;
}

/**
 * Convert a time from one timezone to another for display
 * @param {number} hour - Hour in source timezone (0-23)
 * @param {number} minute - Minute (0-59)
 * @param {string} sourceTimezone - Source timezone (e.g., 'UTC', 'America/New_York')
 * @param {string} targetTimezone - Target timezone (e.g., 'America/New_York', 'UTC')
 * @param {Date} referenceDate - Reference date for the conversion (defaults to today)
 * @returns {object} { hour, minute, formattedTime }
 */
function convertTimezoneForDisplay(hour, minute, sourceTimezone, targetTimezone, referenceDate = new Date()) {
  // Step 1: Create a date string that represents the time in the source timezone
  // We need to find what UTC timestamp corresponds to "hour:minute in sourceTimezone"

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  // Parse this as a date in the source timezone
  // To do this, we create dates and use toLocaleString to find the UTC equivalent

  // Get all possible UTC hours that might match (we'll test UTC midnight of reference date + offset range)
  let foundUTCDate = null;

  // Try different UTC offsets (from -12 to +14 hours)
  for (let utcHourOffset = -12; utcHourOffset <= 14; utcHourOffset++) {
    const testHour = (hour - utcHourOffset + 24) % 24;
    const testDay = day + Math.floor((hour - utcHourOffset) / 24);

    const testDate = new Date(Date.UTC(year, month, testDay, testHour, minute, 0));

    // Format this UTC date in the source timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: sourceTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(testDate);
    const tzHour = parseInt(parts.find(p => p.type === 'hour').value);
    const tzMinute = parseInt(parts.find(p => p.type === 'minute').value);
    const tzDay = parseInt(parts.find(p => p.type === 'day').value);

    // Check if this matches our input
    if (tzHour === hour && tzMinute === minute && tzDay === day) {
      foundUTCDate = testDate;
      break;
    }
  }

  if (!foundUTCDate) {
    // Fallback: just use a basic date
    foundUTCDate = new Date(year, month, day, hour, minute, 0);
  }

  // Step 2: Format this UTC date in the target timezone
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });

  const targetParts = targetFormatter.formatToParts(foundUTCDate);
  const targetHour = parseInt(targetParts.find(p => p.type === 'hour').value);
  const targetMinute = parseInt(targetParts.find(p => p.type === 'minute').value);

  // Format for display with AM/PM
  const displayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const formattedTime = displayFormatter.format(foundUTCDate);

  return {
    hour: targetHour,
    minute: targetMinute,
    formattedTime
  };
}

module.exports = {
  getCurrentHourInTimezone,
  getCurrentMinuteInTimezone,
  formatTimeDisplay,
  convertTimezoneForDisplay
};
