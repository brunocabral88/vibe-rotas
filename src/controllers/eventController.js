const Rota = require('../models/Rota');
const { homeBlocks } = require('../views/blocks/homeBlocks');
const { getSlackClient } = require('../services/slackClient');
const { getCurrentAssignment } = require('../services/assignmentService');

const publishHomeView = async (userId, teamId) => {
  try {
    // Get Slack client
    const client = await getSlackClient(teamId);

    // Get user's timezone from Slack
    let userTimezone = 'UTC';
    try {
      const userInfo = await client.usersInfo(userId);
      userTimezone = userInfo.user?.tz || 'UTC';
    } catch (error) {
      console.warn('Could not fetch user timezone, using UTC:', error.message);
    }

    // Fetch rotas for this workspace
    const rotas = await Rota.find({
      workspaceId: teamId,
      isActive: true
    }).sort({ createdAt: -1 });

    // Fetch current assignments for all rotas
    const assignments = {};
    for (const rota of rotas) {
      const assignment = await getCurrentAssignment(rota._id);
      if (assignment) {
        assignments[rota._id.toString()] = assignment;
      }
    }

    const blocks = homeBlocks(rotas, assignments, userTimezone);

    await client.viewsPublish(userId, {
      type: 'home',
      blocks: blocks
    });

    console.log(`Published home view for user ${userId} in team ${teamId} (timezone: ${userTimezone})`);
  } catch (error) {
    console.error('Error publishing home view:', error);
    throw error;
  }
};

const handleAppHomeOpened = async (event, teamId) => {
  try {
    if (event.tab === 'home') {
      await publishHomeView(event.user, teamId);
    }

    // TODO: Handle other tabs if needed
  } catch (error) {
    console.error('Error handling app_home_opened event:', error);
  }
};

module.exports = {
  publishHomeView,
  handleAppHomeOpened
};
