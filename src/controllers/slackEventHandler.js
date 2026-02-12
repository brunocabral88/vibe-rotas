const { handleAppHomeOpened } = require('../controllers/eventController');
const { getSlackClient } = require('../services/slackClient');
const { createRotaModal, editRotaModal, deleteRotaModal } = require('../views/blocks/homeBlocks');
const { publishHomeView } = require('../controllers/eventController');
const { createRota, getRotaById, updateRota, deleteRota, validateRotaData } = require('../controllers/rotaController');

function refreshHomeViewAsync(userId, teamId) {
  publishHomeView(userId, teamId).catch((error) => {
    console.error('Error refreshing home view:', error);
  });
}

/**
 * Main event handler for Slack events endpoint
 */
const handleSlackEvent = async (req, res) => {
  const { type, challenge, event, team_id } = req.body;

  // Handle URL verification challenge
  if (type === 'url_verification') {
    return res.json({ challenge });
  }

  // Acknowledge the event immediately
  res.status(200).send();

  // Process event asynchronously
  if (type === 'event_callback' && event) {
    try {
      switch (event.type) {
      case 'app_home_opened':
        await handleAppHomeOpened(event, team_id);
        break;

      case 'app_mention':
        console.log('App mentioned:', event);
        // TODO: Handle app mentions
        break;

      default:
        console.log('Unhandled event type:', event.type);
      }
    } catch (error) {
      console.error('Error processing event:', error);
    }
  }
};

/**
 * Handle interactive components (buttons, modals, etc.)
 */
const handleInteractiveAction = async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);

    const { type } = payload;

    switch (type) {
    case 'block_actions':
      // Acknowledge immediately for block actions
      res.status(200).send();
      await handleBlockAction(payload);
      break;

    case 'view_submission': {
      // For view submissions, we need to handle the response properly
      const response = await handleViewSubmission(payload);
      if (response) {
        res.status(200).json(response);
      } else {
        res.status(200).send();
      }
      break;
    }

    case 'view_closed':
      console.log('View closed by user');
      res.status(200).send();
      break;

    default:
      console.log('Unhandled interactive type:', type);
      res.status(200).send();
    }
  } catch (error) {
    console.error('Error handling interactive action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Handle block action (button clicks, selects, etc.)
 */
const handleBlockAction = async (payload) => {
  const { actions, trigger_id, team, user } = payload;

  for (const action of actions) {
    console.log('Block action:', action.action_id);

    try {
      const client = await getSlackClient(team.id);

      // Helper function to safely fetch user timezone
      const getUserTimezone = async () => {
        try {
          const userInfo = await client.usersInfo(user.id);
          return userInfo.user?.tz || 'UTC';
        } catch (error) {
          console.warn('Failed to fetch user timezone, falling back to UTC:', error.message);
          return 'UTC';
        }
      };

      if (action.action_id === 'create_rota_button') {
        const userTimezone = await getUserTimezone();
        await client.viewsOpen(trigger_id, createRotaModal(userTimezone));
      } else if (action.action_id.startsWith('rota_actions_')) {
        // Handle overflow menu actions
        const selectedOption = action.selected_option.value;
        const [actionType, rotaId] = selectedOption.split('_');

        if (actionType === 'edit') {
          const userTimezone = await getUserTimezone();
          const rota = await getRotaById(rotaId, team.id);
          await client.viewsOpen(trigger_id, editRotaModal(rota, userTimezone));
        } else if (actionType === 'delete') {
          const rota = await getRotaById(rotaId, team.id);
          await client.viewsOpen(trigger_id, deleteRotaModal(rota));
        }
      } else if (action.action_id.startsWith('skip_person_')) {
        // Handle skip person action
        const { handleSkipPerson } = require('./skipController');
        const result = await handleSkipPerson(payload);

        if (!result.success) {
          // Send ephemeral message with error
          await client.chatPostMessage(
            payload.channel?.id || payload.container?.channel_id,
            `❌ ${result.error}`,
            null,
            null
          ).catch(err => {
            console.error('Failed to send error message:', err);
          });
        }
      }
    } catch (error) {
      console.error('Error handling block action:', error);
      // TODO: Show error message to user
    }
  }
};

/**
 * Handle view submission (modal submitted)
 */
const handleViewSubmission = async (payload) => {
  const { view, team, user } = payload;

  console.log('View submission:', view.callback_id);

  try {
    if (view.callback_id === 'create_rota_modal') {
      await handleCreateRotaSubmission(view, team, user);
    } else if (view.callback_id === 'edit_rota_modal') {
      await handleEditRotaSubmission(view, team, user);
    } else if (view.callback_id === 'delete_rota_modal') {
      await handleDeleteRotaSubmission(view, team, user);
    }

    // Explicitly return empty response to close the modal
    return null;
  } catch (error) {
    console.error('Error in view submission:', error);

    // Return errors to the modal
    return {
      response_action: 'errors',
      errors: {
        rota_name: error.message
      }
    };
  }
};

/**
 * Handle create rota modal submission
 */
const handleCreateRotaSubmission = async (view, team, user) => {
  const values = view.state.values;

  // Get user's timezone from private_metadata
  const metadata = JSON.parse(view.private_metadata || '{}');
  const userTimezone = metadata.userTimezone || 'UTC';

  // Get selected hour and minute (in user's timezone)
  const selectedHour = parseInt(values.notification_hour.hour_select.selected_option.value, 10);
  const selectedMinute = parseInt(values.notification_minute.minute_select.selected_option.value, 10);

  // Debug logging
  console.log('Create Rota - Selected values:');
  console.log('  User timezone:', userTimezone);
  console.log('  Selected hour:', selectedHour);
  console.log('  Selected minute:', selectedMinute);

  // Convert from user's timezone to UTC
  const { convertTimezoneForDisplay } = require('../utils/timezoneHelper');
  const utcTime = convertTimezoneForDisplay(selectedHour, selectedMinute, userTimezone, 'UTC');

  console.log('  Converted to UTC:', utcTime.hour + ':' + utcTime.minute);

  // Get custom message from rich text input (optional)
  const customMessage = values.custom_message?.message_input?.rich_text_value || null;
  const weekdaysOnly = (values.weekdays_only?.weekdays_only_input?.selected_options || [])
    .some(option => option.value === 'true');

  const rotaData = {
    name: values.rota_name.name_input.value,
    workspaceId: team.id,
    channelId: values.channel_select.selected.selected_conversation,
    members: values.members_select.members_input.selected_users,
    frequency: values.frequency_select.frequency_input.selected_option.value,
    startDate: values.start_date.start_date_input.selected_date,
    notificationHour: utcTime.hour,
    notificationMinute: utcTime.minute,
    weekdaysOnly,
    timezone: 'UTC',
    customMessage: customMessage,
    createdBy: user.id
  };

  // Validate
  const errors = validateRotaData(rotaData);
  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }

  // Create rota
  await createRota(rotaData);

  refreshHomeViewAsync(user.id, team.id);
};

/**
 * Handle edit rota modal submission
 */
const handleEditRotaSubmission = async (view, team, user) => {
  // Parse private_metadata to get rotaId and userTimezone
  const metadata = JSON.parse(view.private_metadata);
  const rotaId = metadata.rotaId;
  const userTimezone = metadata.userTimezone || 'UTC';

  const values = view.state.values;

  // Get selected hour and minute (in user's timezone)
  const selectedHour = parseInt(values.notification_hour.hour_select.selected_option.value, 10);
  const selectedMinute = parseInt(values.notification_minute.minute_select.selected_option.value, 10);

  // Convert from user's timezone to UTC
  const { convertTimezoneForDisplay } = require('../utils/timezoneHelper');
  const utcTime = convertTimezoneForDisplay(selectedHour, selectedMinute, userTimezone, 'UTC');

  // Get custom message from rich text input if provided
  const customMessage = values.custom_message?.message_input?.rich_text_value;
  const weekdaysOnly = (values.weekdays_only?.weekdays_only_input?.selected_options || [])
    .some(option => option.value === 'true');

  const updates = {
    name: values.rota_name.name_input.value,
    channelId: values.channel_select.channel_input.selected_channel,
    members: values.members_select.members_input.selected_users,
    frequency: values.frequency_select.frequency_input.selected_option.value,
    startDate: values.start_date.start_date_input.selected_date,
    notificationHour: utcTime.hour,
    notificationMinute: utcTime.minute,
    weekdaysOnly
  };

  // Only update custom message if user provided one
  if (customMessage !== undefined) {
    updates.customMessage = customMessage;
  }

  // Validate
  const errors = validateRotaData({
    ...updates,
    workspaceId: team.id
  });

  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }

  // Update rota
  await updateRota(rotaId, team.id, updates);

  refreshHomeViewAsync(user.id, team.id);
};

/**
 * Handle delete rota modal submission
 */
const handleDeleteRotaSubmission = async (view, team, user) => {
  const rotaId = view.private_metadata;

  // Delete rota (soft delete)
  await deleteRota(rotaId, team.id);

  refreshHomeViewAsync(user.id, team.id);
};

module.exports = {
  handleSlackEvent,
  handleInteractiveAction
};
