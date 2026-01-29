const { verifySlackRequest } = require('../middleware/slackVerify');

/**
 * Custom error handler for Slack-related errors
 */
const handleSlackError = (err, req, res, next) => {
  console.error('Slack Error:', err);

  // Handle specific Slack API errors
  if (err.code === 'slack_webapi_platform_error') {
    return res.status(400).json({
      error: 'Slack API Error',
      message: err.data?.error || err.message
    });
  }

  // Handle OAuth errors
  if (err.code === 'oauth_error') {
    return res.status(401).json({
      error: 'OAuth Error',
      message: err.message
    });
  }

  // Handle rate limiting
  if (err.code === 'rate_limited') {
    return res.status(429).json({
      error: 'Rate Limited',
      message: 'Too many requests. Please try again later.',
      retryAfter: err.retryAfter
    });
  }

  // Pass to general error handler
  next(err);
};

/**
 * General error handler
 */
const errorHandler = (err, req, res, _next) => {
  console.error('Error:', err.stack);

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'development'
    ? err.message
    : 'Something went wrong!';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  verifySlackRequest,
  handleSlackError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
