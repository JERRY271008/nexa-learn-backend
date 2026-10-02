// { quiet: true } suppresses dotenv's own startup banner/tip line so the
// console only shows this project's own, more useful startup log.
require('dotenv').config({ quiet: true });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5001,

  // Nexa Learn's AI features (Doubt Solver, Quiz Hint, Materials Quality Checker,
  // AI Insights, AI Recommendation) are served by a local Ollama model — no API
  // key is required for this provider, which is why this is a fixed string
  // rather than something read from .env.
  aiProvider: 'ollama',
  model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',

  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Simple in-memory session token lifetime for the Controller admin API (see
  // src/controllerAuth.js). Not a full auth system, but closes the previous
  // "anyone can call /api/controller/users with no login at all" hole.
  controllerTokenTtlMs: 8 * 60 * 60 * 1000, // 8 hours
};
