const express = require('express');
const store = require('../userStore');
const { issueToken, revokeToken, requireControllerAuth } = require('../controllerAuth');
const router = express.Router();

// --- Public: Controller sign-in only. Every other route below requires the
// bearer token issued here (see controllerAuth.js) — previously these were
// wide open to anyone who knew the URL. ---
router.post('/login', (req, res) => {
  const r = store.login(req.body?.regNumber, req.body?.password);
  if (!r || r.role !== 'controller') {
    return res.status(401).json({ ok: false, message: 'Invalid controller credentials.' });
  }
  const token = issueToken(r.user.regNumber);
  res.json({ ok: true, user: r.user, token });
});

router.use(requireControllerAuth);

router.post('/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  revokeToken(token);
  res.json({ ok: true });
});

// --- Users: management (Student + Faculty) ---
router.get('/users', (req, res) => res.json({ ok: true, ...store.listUsers() }));

router.post('/users', (req, res) => {
  try {
    res.status(201).json({ ok: true, user: store.createUser(req.body?.role, req.body) });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
});

router.patch('/users/:regNumber', (req, res) => {
  try {
    res.json({ ok: true, user: store.updateUser(req.params.regNumber, req.body) });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
});

router.delete('/users/:regNumber', (req, res) => {
  try {
    store.deleteUser(req.params.regNumber);
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ ok: false, message: e.message });
  }
});

// --- Overview / analytics ---
router.get('/overview', (req, res) => res.json({ ok: true, ...store.overview() }));

// --- Student progress drill-down ---
router.get('/students/:regNumber', (req, res) => {
  const detail = store.studentDetail(req.params.regNumber);
  if (!detail) return res.status(404).json({ ok: false, message: 'Student not found.' });
  res.json({ ok: true, ...detail });
});

// --- Faculty detail drill-down ---
router.get('/faculty/:regNumber', (req, res) => {
  const detail = store.facultyDetail(req.params.regNumber);
  if (!detail) return res.status(404).json({ ok: false, message: 'Faculty member not found.' });
  res.json({ ok: true, ...detail });
});

// --- Leaderboard (full, real XP-ranked list) ---
router.get('/leaderboard', (req, res) => {
  const db = store.readDB();
  res.json({ ok: true, leaderboard: store.leaderboardFor(db) });
});

// --- Subjects (aggregated from the real student/faculty data) ---
router.get('/subjects', (req, res) => {
  const db = store.readDB();
  const subjects = store.allSubjects(db);
  const data = subjects.map(subject => {
    const scores = db.students.map(s => s.subjects?.[subject]).filter(v => typeof v === 'number');
    const faculty = db.faculty.filter(f => f.subject === subject).map(f => ({ regNumber: f.regNumber, name: f.name }));
    return {
      subject,
      average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
      studentsCounted: scores.length,
      faculty,
    };
  });
  res.json({ ok: true, subjects: data });
});

// --- Notes / materials catalog ---
router.get('/notes', (req, res) => {
  const db = store.readDB();
  res.json({ ok: true, notes: store.buildNotes(db) });
});

// --- Reports ---
router.get('/reports', (req, res) => res.json({ ok: true, ...store.reports() }));

// --- Controller's own account (Settings / Account management) ---
router.patch('/account', (req, res) => {
  try {
    res.json({ ok: true, user: store.updateControllerAccount(req.body) });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
});

module.exports = router;
