# Slack App Setup Guide

This guide will help you set up your Slack app for Vibe Rotas.

## Prerequisites

- A Slack workspace where you have permission to install apps
- Ngrok or a public domain for development/testing

## Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"**
3. Select **"From an app manifest"**
4. Choose your workspace
5. Select **YAML** tab and paste the contents from `slack-manifest.yml`
6. Review the configuration and click **"Create"**

## Step 2: Update the Manifest (if needed)

After creating the app, you may need to update the URLs:

1. Go to **OAuth & Permissions**
   - Add redirect URL: `https://your-domain.com/slack/oauth_redirect`
   - For local dev with ngrok: `https://your-ngrok-id.ngrok.io/slack/oauth_redirect`

2. Go to **Event Subscriptions**
   - Request URL: `https://your-domain.com/slack/events`
   - For local dev with ngrok: `https://your-ngrok-id.ngrok.io/slack/events`

3. Go to **Interactivity & Shortcuts**
   - Request URL: Same as Event Subscriptions URL

## Step 3: Get Your Credentials

From the Slack App settings, collect:

1. **Basic Information** tab:
   - Client ID
   - Client Secret
   - Signing Secret

2. **Install App** (after first install):
   - Bot User OAuth Token

## Step 4: Configure Environment Variables

Update your `.env` file with the credentials:

```env
SLACK_CLIENT_ID=your_client_id_here
SLACK_CLIENT_SECRET=your_client_secret_here
SLACK_SIGNING_SECRET=your_signing_secret_here
SLACK_REDIRECT_URI=https://your-domain.com/slack/oauth_redirect
```

## Step 5: Start MongoDB

If using Docker:
```bash
docker-compose up mongodb -d
```

Or install MongoDB locally and ensure it's running on port 27017.

## Step 6: Start the Application

Development mode:
```bash
npm run dev
```

The app will start on http://localhost:3000

## Step 7: Expose Local Server (Development Only)

If developing locally, use ngrok to expose your server:

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and:
1. Update the URLs in your Slack app settings (OAuth, Events, Interactivity)
2. Update `SLACK_REDIRECT_URI` in your `.env` file
3. Restart your app

## Step 8: Install the App

1. Go to http://localhost:3000 (or your ngrok URL)
2. Click **"Add to Slack"** button
3. Authorize the app for your workspace
4. You should see the success page

## Step 9: Test the App

1. Open Slack
2. Go to **Apps** in the sidebar
3. Find **Vibe Rotas**
4. Click on it to open the App Home
5. You should see the home tab with "Create New Rota" button

## Troubleshooting

### "url_verification failed"
- Make sure your app is running and accessible
- Check that the Request URL matches your server's public URL
- Verify your signing secret is correct

### OAuth redirect issues
- Ensure redirect URI in Slack app matches your `.env` configuration
- Check that MongoDB is running and connected

### Events not received
- Verify Event Subscriptions Request URL is correct
- Check Slack app logs for verification challenges
- Ensure your signing secret is correct

## Production Deployment

For production:
1. Use a proper domain (not ngrok)
2. Set up SSL/TLS certificates
3. Use environment variables (not .env file)
4. Enable socket mode or use a proper webhook URL
5. Set `NODE_ENV=production`

## Next Steps

Once the app is installed and working:
- Users can access the app from the Apps section
- The home tab will display rotas
- Users can create, edit, and manage rotas
- The scheduler will send automated notifications
