const slackConfig = require('../config/slack');
const { exchangeOAuthCode } = require('../services/slackClient');
const Workspace = require('../models/Workspace');

const handleOAuthRedirect = async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.status(400).send(`
      <html>
        <head><title>Installation Failed</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>❌ Installation Failed</h1>
          <p>There was an error installing the app: ${error}</p>
          <p><a href="/">Go back</a></p>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    // Exchange code for access token
    const oauthResponse = await exchangeOAuthCode(code);

    // Store installation in database
    const workspaceData = {
      teamId: oauthResponse.team.id,
      teamName: oauthResponse.team.name,
      accessToken: oauthResponse.authed_user.access_token,
      botToken: oauthResponse.access_token,
      botUserId: oauthResponse.bot_user_id,
      scope: oauthResponse.scope,
      appId: oauthResponse.app_id,
      enterpriseId: oauthResponse.enterprise?.id || null,
      enterpriseName: oauthResponse.enterprise?.name || null,
      installerUserId: oauthResponse.authed_user.id,
      isActive: true
    };

    await Workspace.findOneAndUpdate(
      { teamId: oauthResponse.team.id },
      workspaceData,
      { upsert: true, new: true }
    );

    console.log(`✓ Installed for workspace: ${oauthResponse.team.name}`);

    // Show success page
    res.send(`
      <html>
        <head>
          <title>Installation Successful</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              background: white;
              color: #333;
              padding: 40px;
              border-radius: 10px;
              max-width: 500px;
              margin: 0 auto;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            h1 { margin: 0 0 20px 0; }
            .emoji { font-size: 48px; margin-bottom: 20px; }
            a {
              display: inline-block;
              margin-top: 20px;
              padding: 10px 20px;
              background: #4A154B;
              color: white;
              text-decoration: none;
              border-radius: 5px;
            }
            a:hover { background: #611f69; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">✅</div>
            <h1>Installation Successful!</h1>
            <p>Vibe Rotas has been successfully installed to your workspace.</p>
            <p>Go to your Slack workspace and open the <strong>Vibe Rotas</strong> app home to get started!</p>
            <a href="slack://app?team=${oauthResponse.team.id}&id=${oauthResponse.app_id}">Open in Slack</a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send(`
      <html>
        <head><title>Installation Failed</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>❌ Installation Failed</h1>
          <p>There was an error completing the installation.</p>
          <p>Error: ${error.message}</p>
          <p><a href="/">Go back</a></p>
        </body>
      </html>
    `);
  }
};

const handleOAuthStart = (req, res) => {
  // Generate the OAuth URL
  const scopes = slackConfig.scopes.join(',');
  const oauthUrl = `https://slack.com/oauth/v2/authorize?client_id=${slackConfig.clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(slackConfig.redirectUri)}`;

  res.redirect(oauthUrl);
};

module.exports = {
  handleOAuthRedirect,
  handleOAuthStart
};
