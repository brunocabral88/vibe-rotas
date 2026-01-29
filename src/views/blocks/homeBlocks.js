const { formatNextOccurrence } = require('../../utils/rruleHelper');
const { formatTimeDisplay, convertTimezoneForDisplay } = require('../../utils/timezoneHelper');

/**
 * Generate hour options for notification time selector (0-23)
 * @param {string} timezone - User's timezone for display (optional)
 * @param {number} utcHour - UTC hour to convert from (optional, for display labels)
 * @returns {Array} Array of option objects for static_select
 */
function generateHourOptions(timezone = null, utcHour = null) {
  const options = [];

  for (let hour = 0; hour < 24; hour++) {
    const ampm = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);

    // If timezone provided, show what this hour is in user's timezone
    let label = `${displayHour} ${ampm}`;
    if (timezone && utcHour !== null) {
      // This is for edit mode - show label in user's timezone
      label = `${displayHour} ${ampm}`;
    }

    options.push({
      text: {
        type: 'plain_text',
        text: label
      },
      value: hour.toString()
    });
  }

  return options;
}

/**
 * Generate minute options for notification time selector (0, 15, 30, 45)
 * @returns {Array} Array of option objects for static_select
 */
function generateMinuteOptions() {
  const minutes = [0, 15, 30, 45];
  return minutes.map(minute => ({
    text: {
      type: 'plain_text',
      text: `:${minute.toString().padStart(2, '0')}`
    },
    value: minute.toString()
  }));
}

const homeBlocks = (rotas = [], assignments = {}, userTimezone = 'UTC') => {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔄 Vibe Rotas',
        emoji: true
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Manage your team rotas with automatic rotation scheduling.'
      }
    },
    {
      type: 'divider'
    }
  ];

  if (rotas.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':information_source: *No rotas yet*\n\nGet started by creating your first rota. Click the button below to begin!'
      }
    });
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Your Rotas* (${rotas.length})`
      }
    });

    rotas.forEach((rota) => {
      const notificationHour = rota.schedule.notificationHour !== undefined ? rota.schedule.notificationHour : 10;
      const notificationMinute = rota.schedule.notificationMinute !== undefined ? rota.schedule.notificationMinute : 0;
      const rotaTimezone = rota.schedule.timezone || 'UTC';

      // Convert notification time from UTC to user's timezone for display
      const convertedTime = convertTimezoneForDisplay(
        notificationHour,
        notificationMinute,
        'UTC', // Stored in UTC
        userTimezone // Display in user's timezone
      );

      // Format next rotation in USER'S timezone for display
      const nextRotation = formatNextOccurrence(
        rota.schedule.rrule,
        notificationHour,
        notificationMinute,
        rotaTimezone,
        userTimezone // Display timezone
      );

      // Format notification time in USER'S timezone for display
      const timeDisplay = formatTimeDisplay(convertedTime.hour, convertedTime.minute);

      // Get current assignment for this rota
      const currentAssignment = assignments[rota._id.toString()];
      const assigneeText = currentAssignment
        ? `\n:bust_in_silhouette: Current: <@${currentAssignment.userId}>`
        : '';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${rota.name}*\n:busts_in_silhouette: ${rota.members.length} members • <#${rota.channelId}>\n:calendar: ${rota.schedule.frequency} • :alarm_clock: ${timeDisplay}${assigneeText}`
        },
        accessory: {
          type: 'overflow',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Edit',
                emoji: true
              },
              value: `edit_${rota._id}`
            },
            {
              text: {
                type: 'plain_text',
                text: 'Delete',
                emoji: true
              },
              value: `delete_${rota._id}`
            }
          ],
          action_id: `rota_actions_${rota._id}`
        }
      });

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Next rotation: ${nextRotation}`
          }
        ]
      });

      blocks.push({
        type: 'divider'
      });
    });
  }

  // Add "Create New Rota" button
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '➕ Create New Rota',
          emoji: true
        },
        style: 'primary',
        action_id: 'create_rota_button'
      }
    ]
  });

  return blocks;
};

const createRotaModal = (userTimezone = 'UTC') => {
  // Get timezone display name
  const tzDisplay = userTimezone === 'UTC' ? 'UTC' : userTimezone;
  
  return {
    type: 'modal',
    callback_id: 'create_rota_modal',
    title: {
      type: 'plain_text',
      text: 'Create New Rota'
    },
    submit: {
      type: 'plain_text',
      text: 'Create'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    private_metadata: JSON.stringify({ userTimezone }),
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `:information_source: *Timezone:* All times are shown in *${tzDisplay}*. The notification will be sent at the time you select in your timezone.`
          }
        ]
      },
      {
        type: 'input',
        block_id: 'rota_name',
        label: {
          type: 'plain_text',
          text: 'Rota Name'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'name_input',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Weekly Support Rotation'
          },
          max_length: 100
        }
      },
      {
        type: 'input',
        block_id: 'channel_select',
        label: {
          type: 'plain_text',
          text: 'Channel'
        },
        "element": {
          "type": "conversations_select",
          "action_id": "selected",
          "default_to_current_conversation": false,
          "placeholder": {
            "type": "plain_text",
            "text": "Select a channel"
          },
          "filter": {
            "include": ["public", "private"],
            "exclude_bot_users": true
          }
        }
      },
      {
        type: 'input',
        block_id: 'members_select',
        label: {
          type: 'plain_text',
          text: 'Team Members'
        },
        element: {
          type: 'multi_users_select',
          action_id: 'members_input',
          placeholder: {
            type: 'plain_text',
            text: 'Select team members'
          },
          max_selected_items: 50
        }
      },
      {
        type: 'input',
        block_id: 'frequency_select',
        label: {
          type: 'plain_text',
          text: 'Rotation Frequency'
        },
        element: {
          type: 'static_select',
          action_id: 'frequency_input',
          placeholder: {
            type: 'plain_text',
            text: 'Select frequency'
          },
          initial_option: {
            text: {
              type: 'plain_text',
              text: 'Weekly'
            },
            value: 'WEEKLY'
          },
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Daily'
              },
              value: 'DAILY'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Weekly'
              },
              value: 'WEEKLY'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Biweekly (Every 2 weeks)'
              },
              value: 'BIWEEKLY'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Monthly'
              },
              value: 'MONTHLY'
            }
          ]
        }
      },
      {
        type: 'input',
        block_id: 'start_date',
        label: {
          type: 'plain_text',
          text: 'Start Date'
        },
        element: {
          type: 'datepicker',
          action_id: 'start_date_input',
          placeholder: {
            type: 'plain_text',
            text: 'Select start date'
          }
        }
      },
      {
        type: 'input',
        block_id: 'notification_hour',
        label: {
          type: 'plain_text',
          text: 'Notification Hour'
        },
        element: {
          type: 'static_select',
          action_id: 'hour_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select hour'
          },
          initial_option: {
            text: {
              type: 'plain_text',
              text: '10 AM'
            },
            value: '10'
          },
          options: generateHourOptions()
        }
      },
      {
        type: 'input',
        block_id: 'notification_minute',
        label: {
          type: 'plain_text',
          text: 'Notification Minute'
        },
        hint: {
          type: 'plain_text',
          text: 'Choose minute (notifications run every 15 minutes)'
        },
        element: {
          type: 'static_select',
          action_id: 'minute_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select minute'
          },
          initial_option: {
            text: {
              type: 'plain_text',
              text: ':00'
            },
            value: '0'
          },
          options: generateMinuteOptions()
        }
      },
      {
        type: 'input',
        block_id: 'custom_message',
        label: {
          type: 'plain_text',
          text: 'Custom Message (Optional)'
        },
        hint: {
          type: 'plain_text',
          text: 'Additional message to display with the notification. The notification always includes the rota name and assigned person.'
        },
        element: {
          type: 'rich_text_input',
          action_id: 'message_input',
          placeholder: {
            type: 'plain_text',
            text: 'Add any additional context or instructions...'
          }
        },
        optional: true
      }
    ]
  };
};

const editRotaModal = (rota, userTimezone = 'UTC') => {
  const { convertTimezoneForDisplay } = require('../../utils/timezoneHelper');
  
  // Convert UTC time to user's timezone for display
  const utcHour = rota.schedule.notificationHour;
  const utcMinute = rota.schedule.notificationMinute;
  
  const converted = convertTimezoneForDisplay(utcHour, utcMinute, 'UTC', userTimezone);
  const displayHour = converted.hour;
  const displayMinute = converted.minute;
  
  // Get timezone display name
  const tzDisplay = userTimezone === 'UTC' ? 'UTC' : userTimezone;
  
  return {
    type: 'modal',
    callback_id: 'edit_rota_modal',
    private_metadata: JSON.stringify({ rotaId: rota._id.toString(), userTimezone }),
    title: {
      type: 'plain_text',
      text: 'Edit Rota'
    },
    submit: {
      type: 'plain_text',
      text: 'Save'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `:information_source: *Timezone:* All times are shown in *${tzDisplay}*. The notification will be sent at the time you select in your timezone.`
          }
        ]
      },
      {
        type: 'input',
        block_id: 'rota_name',
        label: {
          type: 'plain_text',
          text: 'Rota Name'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'name_input',
          initial_value: rota.name,
          max_length: 100
        }
      },
      {
        type: 'input',
        block_id: 'channel_select',
        label: {
          type: 'plain_text',
          text: 'Channel'
        },
        element: {
          type: 'channels_select',
          action_id: 'channel_input',
          initial_channel: rota.channelId
        }
      },
      {
        type: 'input',
        block_id: 'members_select',
        label: {
          type: 'plain_text',
          text: 'Team Members'
        },
        element: {
          type: 'multi_users_select',
          action_id: 'members_input',
          initial_users: rota.members,
          max_selected_items: 50
        }
      },
      {
        type: 'input',
        block_id: 'frequency_select',
        label: {
          type: 'plain_text',
          text: 'Rotation Frequency'
        },
        element: {
          type: 'static_select',
          action_id: 'frequency_input',
          initial_option: {
            text: {
              type: 'plain_text',
              text: rota.schedule.frequency === 'BIWEEKLY' ? 'Biweekly (Every 2 weeks)' : rota.schedule.frequency.charAt(0) + rota.schedule.frequency.slice(1).toLowerCase()
            },
            value: rota.schedule.frequency
          },
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Daily'
              },
              value: 'DAILY'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Weekly'
              },
              value: 'WEEKLY'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Biweekly (Every 2 weeks)'
              },
              value: 'BIWEEKLY'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Monthly'
              },
              value: 'MONTHLY'
            }
          ]
        }
      },
      {
        type: 'input',
        block_id: 'start_date',
        label: {
          type: 'plain_text',
          text: 'Start Date'
        },
        element: {
          type: 'datepicker',
          action_id: 'start_date_input',
          initial_date: rota.schedule.startDate.toISOString().split('T')[0]
        }
      },
      {
        type: 'input',
        block_id: 'notification_hour',
        label: {
          type: 'plain_text',
          text: 'Notification Hour'
        },
        element: {
          type: 'static_select',
          action_id: 'hour_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select hour'
          },
          initial_option: {
            text: {
              type: 'plain_text',
              text: (() => {
                const h = displayHour;
                const ampm = h < 12 ? 'AM' : 'PM';
                const displayHr = h === 0 ? 12 : (h > 12 ? h - 12 : h);
                return `${displayHr} ${ampm}`;
              })()
            },
            value: displayHour.toString()
          },
          options: generateHourOptions()
        }
      },
      {
        type: 'input',
        block_id: 'notification_minute',
        label: {
          type: 'plain_text',
          text: 'Notification Minute'
        },
        hint: {
          type: 'plain_text',
          text: 'Choose minute (notifications run every 15 minutes)'
        },
        element: {
          type: 'static_select',
          action_id: 'minute_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select minute'
          },
          initial_option: {
            text: {
              type: 'plain_text',
              text: `:${displayMinute.toString().padStart(2, '0')}`
            },
            value: displayMinute.toString()
          },
          options: generateMinuteOptions()
        }
      },
      {
        type: 'input',
        block_id: 'custom_message',
        label: {
          type: 'plain_text',
          text: 'Custom Message (Optional)'
        },
        hint: {
          type: 'plain_text',
          text: 'Additional message to display with the notification. The notification always includes the rota name and assigned person.'
        },
        element: {
          type: 'rich_text_input',
          action_id: 'message_input',
          initial_value: rota.customMessage || undefined
        },
        optional: true
      }
    ]
  };
};

const deleteRotaModal = (rota) => {
  return {
    type: 'modal',
    callback_id: 'delete_rota_modal',
    private_metadata: rota._id.toString(),
    title: {
      type: 'plain_text',
      text: 'Delete Rota'
    },
    submit: {
      type: 'plain_text',
      text: 'Delete'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:warning: *Are you sure you want to delete this rota?*\n\n*${rota.name}*\n\nThis action cannot be undone.`
        }
      }
    ]
  };
};

module.exports = {
  homeBlocks,
  createRotaModal,
  editRotaModal,
  deleteRotaModal
};
