const axios = require('axios');
const Workspace = require('../models/Workspace');

class SlackClient {
  constructor(token) {
    this.token = token;
    this.baseURL = 'https://slack.com/api';
  }

  async makeRequest(method, data = {}, useGet = false) {
    try {
      let response;

      if (useGet) {
        // For GET requests, send data as query parameters
        const params = new URLSearchParams(data);
        response = await axios.get(`${this.baseURL}/${method}?${params.toString()}`, {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });
      } else {
        // For POST requests, send data as JSON body
        response = await axios.post(`${this.baseURL}/${method}`, data, {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json; charset=utf-8'
          }
        });
      }

      if (!response.data.ok) {
        throw new Error(`Slack API Error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      console.error(`Error calling ${method}:`, error.message);
      throw error;
    }
  }

  // Views API
  async viewsPublish(userId, view) {
    return this.makeRequest('views.publish', {
      user_id: userId,
      view: view
    });
  }

  async viewsOpen(triggerId, view) {
    return this.makeRequest('views.open', {
      trigger_id: triggerId,
      view: view
    });
  }

  async viewsUpdate(viewId, view, hash) {
    return this.makeRequest('views.update', {
      view_id: viewId,
      view: view,
      hash: hash
    });
  }

  // Chat API
  async chatPostMessage(channel, text, blocks = null, threadTs = null) {
    return this.makeRequest('chat.postMessage', {
      channel: channel,
      text: text,
      blocks: blocks,
      thread_ts: threadTs
    });
  }

  async chatUpdate(channel, ts, text, blocks = null) {
    return this.makeRequest('chat.update', {
      channel: channel,
      ts: ts,
      text: text,
      blocks: blocks
    });
  }

  async chatDelete(channel, ts) {
    return this.makeRequest('chat.delete', {
      channel: channel,
      ts: ts
    });
  }

  // Users API
  async usersInfo(userId) {
    return this.makeRequest('users.info', {
      user: userId
    }, true); // Use GET method
  }

  async usersList(cursor = null, limit = 100) {
    return this.makeRequest('users.list', {
      cursor: cursor,
      limit: limit
    }, true); // Use GET method
  }

  // Conversations API
  async conversationsInfo(channelId) {
    return this.makeRequest('conversations.info', {
      channel: channelId
    }, true); // Use GET method
  }

  async conversationsList(cursor = null, limit = 100) {
    return this.makeRequest('conversations.list', {
      cursor: cursor,
      limit: limit,
      exclude_archived: true
    }, true); // Use GET method
  }

  // Team API
  async teamInfo() {
    return this.makeRequest('team.info', {}, true); // Use GET method
  }

  // Auth API
  async authTest() {
    return this.makeRequest('auth.test', {}, true); // Use GET method
  }
}

// Get Slack client for a specific workspace
async function getSlackClient(teamId) {
  const workspace = await Workspace.findOne({ teamId, isActive: true });

  if (!workspace) {
    throw new Error(`No active workspace found for team: ${teamId}`);
  }

  return new SlackClient(workspace.botToken);
}

// OAuth exchange
async function exchangeOAuthCode(code) {
  try {
    const response = await axios.post('https://slack.com/api/oauth.v2.access', {
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code: code,
      redirect_uri: process.env.SLACK_REDIRECT_URI
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.data.ok) {
      throw new Error(`OAuth Error: ${response.data.error}`);
    }

    return response.data;
  } catch (error) {
    console.error('OAuth exchange error:', error);
    throw error;
  }
}

module.exports = {
  SlackClient,
  getSlackClient,
  exchangeOAuthCode
};
