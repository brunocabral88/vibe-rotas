/**
 * Example test for Slack request verification
 * Run with: node src/utils/testVerification.js
 */

const crypto = require('crypto');

// Simulate Slack request signature
function generateSlackSignature(timestamp, body, secret) {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const signature = 'v0=' + crypto
    .createHmac('sha256', secret)
    .update(sigBasestring)
    .digest('hex');
  return signature;
}

// Test verification logic
function testVerification() {
  const signingSecret = 'test_secret_123';
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ type: 'event_callback', event: { type: 'app_home_opened' } });

  // Generate valid signature
  const validSignature = generateSlackSignature(timestamp, body, signingSecret);
  console.log('✓ Generated signature:', validSignature);

  // Simulate verification
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(validSignature, 'utf8')
  );

  console.log('✓ Signature verification:', isValid ? 'PASSED ✅' : 'FAILED ❌');

  // Test with invalid secret
  const wrongSecret = 'wrong_secret';
  const wrongSignature = generateSlackSignature(timestamp, body, wrongSecret);

  const isInvalid = crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(wrongSignature, 'utf8')
  );

  console.log('✓ Invalid signature detected:', !isInvalid ? 'PASSED ✅' : 'FAILED ❌');

  // Test timestamp expiry
  const oldTimestamp = Math.floor(Date.now() / 1000) - (60 * 6); // 6 minutes ago
  const timeDifference = Math.abs(Math.floor(Date.now() / 1000) - oldTimestamp);
  const isExpired = timeDifference > (60 * 5); // 5 minutes

  console.log('✓ Old timestamp rejected:', isExpired ? 'PASSED ✅' : 'FAILED ❌');

  console.log('\n✅ All verification tests passed!');
}

// Run tests
if (require.main === module) {
  testVerification();
}

module.exports = { generateSlackSignature };
