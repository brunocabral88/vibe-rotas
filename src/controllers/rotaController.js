const Rota = require('../models/Rota');
const { generateRRule } = require('../utils/rruleHelper');
// Unused imports removed - available for future use if needed

/**
 * Create a new rota
 */
async function createRota(data) {
  const { name, workspaceId, channelId, members, frequency, startDate, notificationHour, notificationMinute, timezone, customMessage, createdBy } = data;

  // Validation
  if (!name || name.trim().length === 0) {
    throw new Error('Rota name is required');
  }

  if (!channelId) {
    throw new Error('Channel is required');
  }

  if (!members || members.length === 0) {
    throw new Error('At least one team member is required');
  }

  if (!frequency || !['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(frequency)) {
    throw new Error('Invalid frequency');
  }

  if (!startDate) {
    throw new Error('Start date is required');
  }

  // Check for duplicate name in workspace
  const existing = await Rota.findOne({
    workspaceId,
    name: name.trim(),
    isActive: true
  });

  if (existing) {
    throw new Error('A rota with this name already exists');
  }

  // Generate RRULE
  const rrule = generateRRule(frequency, startDate, timezone || 'UTC');

  // Create rota
  const rota = new Rota({
    name: name.trim(),
    workspaceId,
    channelId,
    members: members,
    schedule: {
      rrule,
      frequency,
      startDate: new Date(startDate),
      timezone: timezone || 'UTC',
      notificationHour: notificationHour !== undefined ? notificationHour : 10,
      notificationMinute: notificationMinute !== undefined ? notificationMinute : 0
    },
    customMessage: customMessage || null,
    currentIndex: 0,
    isActive: true,
    createdBy
  });

  await rota.save();
  console.log(`✓ Created rota: ${name} in workspace ${workspaceId}`);

  return rota;
}

/**
 * Get all rotas for a workspace
 */
async function getRotas(workspaceId, includeInactive = false) {
  const query = { workspaceId };

  if (!includeInactive) {
    query.isActive = true;
  }

  return await Rota.find(query).sort({ createdAt: -1 });
}

/**
 * Get a single rota by ID
 */
async function getRotaById(rotaId, workspaceId) {
  const rota = await Rota.findOne({ _id: rotaId, workspaceId });

  if (!rota) {
    throw new Error('Rota not found');
  }

  return rota;
}

/**
 * Update a rota
 */
async function updateRota(rotaId, workspaceId, updates) {
  const rota = await getRotaById(rotaId, workspaceId);

  // Update name if provided
  if (updates.name && updates.name !== rota.name) {
    // Check for duplicate
    const existing = await Rota.findOne({
      workspaceId,
      name: updates.name.trim(),
      _id: { $ne: rotaId },
      isActive: true
    });

    if (existing) {
      throw new Error('A rota with this name already exists');
    }

    rota.name = updates.name.trim();
  }

  // Update channel
  if (updates.channelId) {
    rota.channelId = updates.channelId;
  }

  // Update members
  if (updates.members && updates.members.length > 0) {
    rota.members = updates.members;
    // Reset index if members changed
    if (rota.currentIndex >= updates.members.length) {
      rota.currentIndex = 0;
    }
  }

  // Update schedule
  if (updates.frequency || updates.startDate || updates.notificationHour !== undefined || updates.notificationMinute !== undefined) {
    const frequency = updates.frequency || rota.schedule.frequency;
    const startDate = updates.startDate || rota.schedule.startDate;
    const timezone = updates.timezone || rota.schedule.timezone;
    const notificationHour = updates.notificationHour !== undefined ? updates.notificationHour : rota.schedule.notificationHour;
    const notificationMinute = updates.notificationMinute !== undefined ? updates.notificationMinute : rota.schedule.notificationMinute;

    const rrule = generateRRule(frequency, startDate, timezone);

    rota.schedule = {
      rrule,
      frequency,
      startDate: new Date(startDate),
      timezone,
      notificationHour,
      notificationMinute
    };
  }

  // Update custom message
  if (updates.customMessage !== undefined) {
    rota.customMessage = updates.customMessage;
  }

  // Update active status
  if (typeof updates.isActive === 'boolean') {
    rota.isActive = updates.isActive;
  }

  await rota.save();
  console.log(`✓ Updated rota: ${rota.name}`);

  return rota;
}

/**
 * Delete (deactivate) a rota
 */
async function deleteRota(rotaId, workspaceId) {
  const rota = await getRotaById(rotaId, workspaceId);

  rota.isActive = false;
  await rota.save();

  console.log(`✓ Deleted rota: ${rota.name}`);

  return rota;
}

/**
 * Permanently delete a rota (use with caution)
 */
async function permanentlyDeleteRota(rotaId, workspaceId) {
  const rota = await getRotaById(rotaId, workspaceId);
  await Rota.deleteOne({ _id: rotaId });

  console.log(`✓ Permanently deleted rota: ${rota.name}`);

  return rota;
}

/**
 * Get next person in rotation
 */
async function getNextAssignment(rotaId, workspaceId) {
  const rota = await getRotaById(rotaId, workspaceId);

  if (rota.members.length === 0) {
    throw new Error('No members in rota');
  }

  const nextUserId = rota.members[rota.currentIndex];

  // Increment index for next time (circular)
  rota.currentIndex = (rota.currentIndex + 1) % rota.members.length;
  await rota.save();

  return {
    userId: nextUserId,
    rotaName: rota.name,
    channelId: rota.channelId
  };
}

/**
 * Validate rota data
 */
function validateRotaData(data) {
  const errors = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (data.name && data.name.length > 100) {
    errors.push('Name must be less than 100 characters');
  }

  if (!data.channelId) {
    errors.push('Channel is required');
  }

  if (!data.members || !Array.isArray(data.members) || data.members.length === 0) {
    errors.push('At least one team member is required');
  }

  if (data.members && data.members.length > 50) {
    errors.push('Maximum 50 members allowed');
  }

  if (!data.frequency || !['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(data.frequency)) {
    errors.push('Valid frequency is required (DAILY, WEEKLY, BIWEEKLY, MONTHLY)');
  }

  if (!data.startDate) {
    errors.push('Start date is required');
  }

  if (data.startDate && isNaN(Date.parse(data.startDate))) {
    errors.push('Invalid start date');
  }

  if (data.notificationHour !== undefined) {
    const hour = parseInt(data.notificationHour, 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      errors.push('Notification hour must be between 0 and 23');
    }
  }

  if (data.notificationMinute !== undefined) {
    const minute = parseInt(data.notificationMinute, 10);
    if (isNaN(minute) || ![0, 15, 30, 45].includes(minute)) {
      errors.push('Notification minute must be 0, 15, 30, or 45');
    }
  }

  return errors;
}

module.exports = {
  createRota,
  getRotas,
  getRotaById,
  updateRota,
  deleteRota,
  permanentlyDeleteRota,
  getNextAssignment,
  validateRotaData
};
