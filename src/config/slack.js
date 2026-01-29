require('dotenv').config();

const slackConfig = {
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  redirectUri: process.env.SLACK_REDIRECT_URI,
  scopes: [
    'app_mentions:read',
    'channels:read',
    'chat:write',
    'commands',
    'users:read',
    'team:read',
    'groups:read',
    'groups:history',
    'im:history',
    'im:read',
    'im:write'
  ]
};

module.exports = slackConfig;
