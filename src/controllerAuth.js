// Lightweight in-memory session tokens for the Controller admin API.
//
// Previously every /api/controller/* route except /login had no auth guard at
// all — anyone who discovered the URL could list, create, edit or delete
// student/faculty accounts without ever signing in. This module issues an
// opaque bearer token on a successful controller login and a small piece of
// middleware that requires it on every other controller route.
//
// This intentionally stays simple (no DB, no JWT library) to match the size
// and style of the rest of this prototype backend. Tokens live only in this
// process's memory, so they're invalidated on server restart — acceptable
// for a single-controller admin tool like this one.
const crypto = require('crypto');
const config = require('./config');

const tokens = new Map(); // token -> { regNumber, expiresAt }

function issueToken(regNumber) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { regNumber, expiresAt: Date.now() + config.controllerTokenTtlMs });
  return token;
}

function revokeToken(token) {
  tokens.delete(token);
}

function verifyToken(token) {
  if (!token) return null;
  const entry = tokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokens.delete(token);
    return null;
  }
  return entry;
}

// Periodically sweep expired tokens so the Map doesn't grow unbounded across
// a long-running server process.
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tokens.entries()) {
    if (now > entry.expiresAt) tokens.delete(token);
  }
}, 30 * 60 * 1000).unref();

function requireControllerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const session = verifyToken(token);
  if (!session) {
    return res.status(401).json({ ok: false, message: 'Your Controller session has expired. Please sign in again.' });
  }
  req.controllerSession = session;
  next();
}

module.exports = { issueToken, revokeToken, verifyToken, requireControllerAuth };
