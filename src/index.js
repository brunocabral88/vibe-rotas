require('dotenv').config();
const express = require('express');
const connectDB = require('./config/database');
const { handleOAuthRedirect, handleOAuthStart } = require('./controllers/authController');
const { handleSlackEvent, handleInteractiveAction } = require('./controllers/slackEventHandler');
const { verifySlackRequest } = require('./middleware/slackVerify');
const { errorHandler, notFoundHandler, handleSlackError } = require('./middleware/errorHandler');
const { startScheduler } = require('./services/schedulerService');
const { logger } = require('./utils/logger');
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB().then(() => {
  // Start scheduler after DB connection is established
  logger.info('Starting scheduler service...');
  startScheduler();
}).catch(err => {
  logger.error('Failed to connect to MongoDB', { error: err.message });
  process.exit(1);
});

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Vibe Rotas API is running',
    timestamp: new Date().toISOString()
  });
});

// Root route - Install page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Vibe Rotas - Slack Rota Management</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            padding: 60px;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
          }
          h1 { 
            color: #333;
            margin: 0 0 10px 0;
            font-size: 36px;
          }
          .emoji { font-size: 64px; margin-bottom: 20px; }
          p { 
            color: #666;
            line-height: 1.6;
            margin: 20px 0;
          }
          .features {
            text-align: left;
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .features li {
            margin: 10px 0;
          }
          a.button {
            display: inline-block;
            margin-top: 20px;
            padding: 15px 40px;
            background: #4A154B;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            transition: background 0.3s;
          }
          a.button:hover {
            background: #611f69;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="emoji">🔄</div>
          <h1>Vibe Rotas</h1>
          <p>Slack Rota Management with Automatic Rotation</p>
          
          <div class="features">
            <ul>
              <li>🔄 Automatic rotation scheduling (Daily, Weekly, Biweekly, Monthly)</li>
              <li>📱 Manage rotas via Bot Home tab</li>
              <li>🎨 Customizable message templates</li>
              <li>👥 Multi-workspace support</li>
              <li>🔔 Scheduled channel notifications</li>
            </ul>
          </div>
          
          <p><strong>Ready to get started?</strong></p>
          <a href="/slack/install" class="button">Add to Slack</a>
        </div>
      </body>
    </html>
  `);
});

// OAuth routes
app.get('/slack/install', handleOAuthStart);
app.get('/slack/oauth_redirect', handleOAuthRedirect);

// Slack event subscriptions endpoint (with verification)
app.post('/slack/events', bodyParser.raw({ type: 'application/json', verify: verifySlackRequest }), handleSlackEvent);

// Slack interactive components endpoint (with verification)
app.post('/slack/actions', bodyParser.raw({ type: 'application/json', verify: verifySlackRequest }), handleInteractiveAction);

// Admin endpoints for scheduler management
app.get('/admin/scheduler/status', (req, res) => {
  const { getSchedulerStatus } = require('./services/schedulerService');
  res.json(getSchedulerStatus());
});

app.post('/admin/scheduler/run', async (req, res) => {
  try {
    const { processAllRotas } = require('./services/schedulerService');
    logger.info('Manual scheduler run triggered');
    const results = await processAllRotas();
    res.json({ success: true, results });
  } catch (error) {
    logger.error('Error in manual scheduler run', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/scheduler/retry', async (req, res) => {
  try {
    const { retryFailedNotifications } = require('./services/schedulerService');
    logger.info('Manual retry triggered');
    await retryFailedNotifications();
    res.json({ success: true });
  } catch (error) {
    logger.error('Error in manual retry', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Slack error handler
app.use(handleSlackError);

// 404 handler
app.use(notFoundHandler);

// General error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`⚡️ Vibe Rotas is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`MongoDB: ${process.env.MONGODB_URI}`);
  logger.info(`\n🔗 Install URL: http://localhost:${PORT}/slack/install`);
  logger.info('📅 Scheduler: Running every hour on the hour');

  console.log(`⚡️ Vibe Rotas is running on port ${PORT}`);
  console.log(`🔗 Install URL: http://localhost:${PORT}/slack/install`);
});

module.exports = app;
