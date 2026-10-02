const { callOpenAI } = require('../services/openaiService');
const { extractJSON } = require('../utils/jsonExtractor');
const { httpError } = require('../utils/httpError');
const prompts = require('../prompts');

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 16;
const MAX_EXTRACTED_TEXT = 6000;

/* ---------------------------------------------------------------------- */
/* POST /api/ai/chat — AI Doubt Solver                                     */
/* ---------------------------------------------------------------------- */
async function chat(req, res, next) {
  try {
    const { message, history } = req.body || {};

    if (typeof message !== 'string' || !message.trim()) {
      throw httpError(400, 'message is required.', 'INVALID_INPUT');
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw httpError(400, `message must be under ${MAX_MESSAGE_LENGTH} characters.`, 'INVALID_INPUT');
    }

    let cleanHistory = [];
    if (Array.isArray(history)) {
      cleanHistory = history
        .filter(
          (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()
        )
        .slice(-MAX_HISTORY_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
    }

    const messages = [...cleanHistory, { role: 'user', content: message.trim() }];

    const reply = await callOpenAI({
      system: prompts.doubtSolverSystemPrompt(),
      messages,
      maxTokens: 700,
      temperature: 0.6,
    });

    res.json({ reply: reply.trim() });
  } catch (err) {
    next(err);
  }
}

/* ---------------------------------------------------------------------- */
/* POST /api/ai/quiz-hint                                                  */
/* ---------------------------------------------------------------------- */
async function quizHint(req, res, next) {
  try {
    const { question, options, correctIndex, chosenIndex, topic } = req.body || {};

    if (typeof question !== 'string' || !question.trim() || !Array.isArray(options) || options.length < 2) {
      throw httpError(400, 'question and at least 2 options are required.', 'INVALID_INPUT');
    }

    const raw = await callOpenAI({
      system: prompts.quizHintSystemPrompt(),
      messages: [
        { role: 'user', content: prompts.quizHintUserPrompt({ question, options, correctIndex, chosenIndex, topic }) },
      ],
      maxTokens: 120,
      temperature: 0.5,
    });

    // Strip stray wrapping quotes the model sometimes adds.
    const hint = raw.trim().replace(/^["']|["']$/g, '');
    res.json({ hint });
  } catch (err) {
    next(err);
  }
}

/* ---------------------------------------------------------------------- */
/* POST /api/ai/analyze-material                                           */
/* ---------------------------------------------------------------------- */
function validateAnalysis(data) {
  if (!data || typeof data !== 'object') return null;
  const metricKeys = ['relevance', 'readability', 'coverage', 'structure', 'accuracy', 'difficulty'];
  const m = data.metrics || {};
  const metricsOk = metricKeys.every((k) => typeof m[k] === 'number' && m[k] >= 0 && m[k] <= 100);
  const scoreOk = typeof data.score === 'number' && data.score >= 0 && data.score <= 100;
  const suggestionsOk = Array.isArray(data.suggestions) && data.suggestions.length > 0 && data.suggestions.every((s) => typeof s === 'string');
  if (!metricsOk || !scoreOk || !suggestionsOk) return null;
  return {
    score: Math.round(data.score),
    metrics: Object.fromEntries(metricKeys.map((k) => [k, Math.round(m[k])])),
    suggestions: data.suggestions.slice(0, 6),
  };
}

async function analyzeMaterial(req, res, next) {
  try {
    const { subject, topic } = req.body || {};
    const fileName = req.body?.fileName || req.file?.originalname || '';

    if (!subject || !topic) {
      throw httpError(400, 'subject and topic are required.', 'INVALID_INPUT');
    }

    let extractedText = '';
    if (req.file) {
      const isPlainText = req.file.mimetype.startsWith('text/') || /\.(txt|md|csv)$/i.test(req.file.originalname);
      if (isPlainText) {
        extractedText = req.file.buffer.toString('utf8').slice(0, MAX_EXTRACTED_TEXT);
      }
      // Other formats (pdf/doc/ppt) aren't parsed here — the AI reasons from
      // the metadata instead. See README for how to plug in real extraction.
    }

    const buildMessages = (extra = []) => [
      { role: 'user', content: prompts.materialAnalysisUserPrompt({ fileName, subject, topic, extractedText }) },
      ...extra,
    ];

    let raw = await callOpenAI({
      system: prompts.materialAnalysisSystemPrompt(),
      messages: buildMessages(),
      maxTokens: 700,
      temperature: 0.4,
    });

    let parsed = validateAnalysis(safeExtract(raw));

    if (!parsed) {
      // One corrective retry before giving up — ask the model to fix its own output.
      raw = await callOpenAI({
        system: prompts.materialAnalysisSystemPrompt(),
        messages: buildMessages([
          { role: 'assistant', content: raw },
          { role: 'user', content: 'That was not valid JSON matching the exact schema. Reply again with ONLY the valid JSON object, nothing else.' },
        ]),
        maxTokens: 700,
        temperature: 0.2,
      });
      parsed = validateAnalysis(safeExtract(raw));
    }

    if (!parsed) {
      throw httpError(502, 'The AI could not produce a valid quality analysis. Please try again.', 'AI_INVALID_OUTPUT');
    }

    res.json(parsed);
  } catch (err) {
    next(err);
  }
}

/* ---------------------------------------------------------------------- */
/* POST /api/ai/insights                                                   */
/* ---------------------------------------------------------------------- */
async function insights(req, res, next) {
  try {
    const { students } = req.body || {};
    if (!Array.isArray(students) || students.length === 0) {
      throw httpError(400, 'students array is required.', 'INVALID_INPUT');
    }

    const trimmed = students.slice(0, 60).map((s) => ({
      name: String(s?.name || '').slice(0, 60),
      performance: Number(s?.performance) || 0,
      attendance: Number(s?.attendance) || 0,
      weak: String(s?.weak || '').slice(0, 60),
      status: String(s?.status || '').slice(0, 20),
    }));

    const raw = await callOpenAI({
      system: prompts.insightsSystemPrompt(),
      messages: [{ role: 'user', content: prompts.insightsUserPrompt(trimmed) }],
      maxTokens: 800,
      temperature: 0.4,
    });

    const data = safeExtract(raw);
    if (!data || !Array.isArray(data.insights) || !Array.isArray(data.careList)) {
      throw httpError(502, 'The AI returned an unexpected format for insights.', 'AI_INVALID_OUTPUT');
    }

    res.json({
      insights: data.insights.filter((s) => typeof s === 'string').slice(0, 6),
      careList: data.careList.filter((c) => c && c.name && c.rec).slice(0, 8),
    });
  } catch (err) {
    next(err);
  }
}

/* ---------------------------------------------------------------------- */
/* POST /api/ai/recommendation                                             */
/* ---------------------------------------------------------------------- */
async function recommendation(req, res, next) {
  try {
    const { topicWeak, topicStrong, marks, attendance, improvement } = req.body || {};

    const raw = await callOpenAI({
      system: prompts.recommendationSystemPrompt(),
      messages: [{ role: 'user', content: prompts.recommendationUserPrompt({ topicWeak, topicStrong, marks, attendance, improvement }) }],
      maxTokens: 200,
      temperature: 0.6,
    });

    const data = safeExtract(raw);
    if (!data || typeof data.text !== 'string' || !data.text.trim()) {
      throw httpError(502, 'The AI returned an unexpected format for the recommendation.', 'AI_INVALID_OUTPUT');
    }

    res.json({
      topic: (typeof data.topic === 'string' && data.topic.trim()) || (topicWeak && topicWeak[0] && topicWeak[0].name) || 'this topic',
      text: data.text.trim(),
    });
  } catch (err) {
    next(err);
  }
}

function safeExtract(raw) {
  try {
    return extractJSON(raw);
  } catch {
    return null;
  }
}

module.exports = { chat, quizHint, analyzeMaterial, insights, recommendation };
