const express = require('express');
const cors = require('cors');
const config = require('./src/config');
const aiRoutes = require('./src/routes/aiRoutes');
const authRoutes = require('./src/routes/authRoutes');
const controllerRoutes = require('./src/routes/controllerRoutes');
const { aiRateLimiter } = require('./src/middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./src/middleware/errorHandler');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

// Health check — also reports whether the local Ollama model is actually
// reachable (a quick /api/tags ping with a short timeout), which is the #1
// thing to check when the AI features aren't working. Previously this only
// checked for a hardcoded truthy string, so the frontend's "AI Online" badge
// could say everything was fine even when Ollama wasn't running at all.
app.get('/health', async (req, res) => {
  let ollamaReachable = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const r = await fetch(`${config.ollamaBaseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    ollamaReachable = r.ok;
  } catch (e) {
    ollamaReachable = false;
  }
  res.json({ ok: true, aiConfigured: ollamaReachable, provider: config.aiProvider, model: config.model });
});

app.use('/api/auth', authRoutes);
app.use('/api/controller', controllerRoutes);
app.use('/api/ai', aiRateLimiter, aiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Nexa Learn backend running on http://localhost:${config.port}`);
  console.log(`AI provider: ${config.aiProvider} (${config.model}) at ${config.ollamaBaseUrl}`);
  console.log('If AI features report "offline", make sure Ollama is running (ollama serve) and the model above has been pulled.');
});
