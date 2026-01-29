const crypto = require('crypto');
const slackConfig = require('../config/slack');

/**
 * Verify that requests are actually from Slack using request signatures
 * Based on Slack's signing secret verification: https://api.slack.com/authentication/verifying-requests-from-slack
 */
const verifySlackRequest = (req, res, buf) => {
  try {
    const ts = req.headers['x-slack-request-timestamp'];
    const sig = req.headers['x-slack-signature'];

    const base = `v0:${ts}:${buf}`;
    const hash =
      'v0=' +
      crypto
        .createHmac('sha256', slackConfig.signingSecret)
        .update(base)
        .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(sig))) {
      return res.status(401).json({ error: 'Invalid Slack signature' });
    }
  } catch (error) {
    console.error('Error verifying Slack request:', error);
    return res.status(500).json({ error: 'Error verifying request' });
  }
};

/**
 * Middleware to capture raw body for signature verification
 * Must be added before JSON body parser
 */
const captureRawBody = (req, res, next) => {
  let rawBody = '';

  req.on('data', (chunk) => {
    rawBody += chunk.toString();
  });

  req.on('end', () => {
    req.rawBody = rawBody;
    next();
  });
};

module.exports = {
  verifySlackRequest,
  captureRawBody
};
