const rateLimit = require('express-rate-limit');

// Every AI route ultimately spends real API credits, so cap request rate
// per client IP. 20 requests/minute is generous for a single demo user
// clicking around the UI, but stops runaway loops or abuse.
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    code: 'RATE_LIMITED',
    message: 'Too many AI requests — please wait a moment and try again.',
  },
});

module.exports = { aiRateLimiter };
