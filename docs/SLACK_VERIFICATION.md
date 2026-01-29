# Slack Request Verification

This document explains how we verify that requests are actually from Slack.

## How It Works

Slack signs every request with a signature using your app's signing secret. We verify this signature to ensure requests are legitimate and haven't been tampered with.

### Verification Process

1. **Extract Headers**: Get `x-slack-signature` and `x-slack-request-timestamp` from request
2. **Check Timestamp**: Reject requests older than 5 minutes (prevents replay attacks)
3. **Create Signature Base**: Combine version, timestamp, and raw request body
4. **Generate Signature**: Use HMAC SHA256 with signing secret
5. **Compare**: Use timing-safe comparison to check signatures match

### Implementation

The verification is implemented in `src/middleware/slackVerify.js`:

```javascript
const { verifySlackRequest } = require('./middleware/slackVerify');

// Apply to routes that need verification
app.post('/api/webhook', verifySlackRequest, handleWebhook);
```

### What's Protected

**Automatically Protected** (by Bolt SDK):
- `/slack/events` - Event subscriptions
- `/slack/actions` - Interactive components
- `/slack/commands` - Slash commands

**Note**: Bolt SDK handles verification automatically for all Slack event endpoints. The custom middleware is available for any additional endpoints you create outside of Bolt's receiver.

### Security Features

- **Replay Attack Prevention**: Rejects requests older than 5 minutes
- **Timing-Safe Comparison**: Prevents timing attacks on signature comparison
- **Raw Body Verification**: Signs the exact body Slack sent (not parsed JSON)

### Testing

To test verification locally:
1. Slack will send real signed requests to your endpoint
2. Invalid signatures return 401 Unauthorized
3. Check logs for verification errors

### Troubleshooting

**401 - Missing signature headers**
- Request didn't come from Slack
- Headers were stripped by proxy/load balancer

**401 - Request timestamp expired**
- Request took too long to reach server
- Server clock is incorrect
- Check system time synchronization

**401 - Invalid signature**
- Signing secret doesn't match
- Request body was modified in transit
- Middleware order issue (body parser before verification)

### Environment Variables

Required:
```env
SLACK_SIGNING_SECRET=your_signing_secret_here
```

Get this from: Slack App Settings → Basic Information → App Credentials → Signing Secret

## References

- [Slack API: Verifying requests from Slack](https://api.slack.com/authentication/verifying-requests-from-slack)
- [HMAC SHA256 Signature Verification](https://en.wikipedia.org/wiki/HMAC)
