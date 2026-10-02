// Backend API regression test: boots the real Express app on an ephemeral
// port, exercises every route (auth, Controller CRUD, analytics), and
// prints PASS/FAIL lines. Run with: node tests/api.test.js
process.env.CORS_ORIGIN = '*';

const express = require('express');
const cors = require('cors');
const config = require('../src/config');
const aiRoutes = require('../src/routes/aiRoutes');
const authRoutes = require('../src/routes/authRoutes');
const controllerRoutes = require('../src/routes/controllerRoutes');
const { aiRateLimiter } = require('../src/middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('../src/middleware/errorHandler');

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/controller', controllerRoutes);
app.use('/api/ai', aiRateLimiter, aiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} ${extra !== undefined ? JSON.stringify(extra) : ''}`); }
}

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const j = async (path, opts) => {
    const r = await fetch(base + path, opts);
    let body = null;
    try { body = await r.json(); } catch (e) {}
    return { status: r.status, body };
  };

  try {
    // Student login
    let r = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regNumber: '26U201067', password: 'Srcas@2026' }) });
    check('student login 200', r.status === 200, r.status);
    check('student login role', r.body?.role === 'student', r.body?.role);
    check('student login has leaderboard of 66', r.body?.leaderboard?.length === 66, r.body?.leaderboard?.length);
    check('student login rank present', typeof r.body?.rank === 'number' && r.body.rank > 0, r.body?.rank);

    // Wrong password
    r = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regNumber: '26U201067', password: 'wrong' }) });
    check('wrong password rejected', r.status === 401, r.status);

    // Faculty login
    r = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regNumber: 'FAC#200', password: 'Faculty@srcas' }) });
    check('faculty login 200', r.status === 200, r.status);
    check('faculty login role', r.body?.role === 'faculty', r.body?.role);
    check('faculty login has students', Array.isArray(r.body?.students) && r.body.students.length === 66, r.body?.students?.length);
    check('faculty login has subjectAverages', !!r.body?.subjectAverages && Object.keys(r.body.subjectAverages).length === 5, r.body?.subjectAverages);

    // Controller CANNOT log in via /api/auth/login as controller (should be rejected so main site doesn't crash)
    r = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regNumber: 'CTRL#001', password: 'Controller@srcas' }) });
    console.log('  (main-site controller login raw result, for reference):', r.status, JSON.stringify(r.body));

    // Controller routes: unauth
    r = await j('/api/controller/users');
    check('controller users unauth -> 401', r.status === 401, r.status);

    // Controller login
    r = await j('/api/controller/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regNumber: 'CTRL#001', password: 'Controller@srcas' }) });
    check('controller login 200', r.status === 200, r.status);
    check('controller login has token', typeof r.body?.token === 'string' && r.body.token.length > 10, r.body?.token);
    const token = r.body.token;
    const auth = { Authorization: `Bearer ${token}` };

    // Controller login wrong password
    r = await j('/api/controller/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regNumber: 'CTRL#001', password: 'nope' }) });
    check('controller login wrong pw -> 401', r.status === 401, r.status);

    // Bad token
    r = await j('/api/controller/users', { headers: { Authorization: 'Bearer garbage' } });
    check('controller users bad token -> 401', r.status === 401, r.status);

    // Authed: users list
    r = await j('/api/controller/users', { headers: auth });
    check('controller users list 200', r.status === 200, r.status);
    check('controller users list counts', r.body?.students?.length === 66 && r.body?.faculty?.length === 5, { s: r.body?.students?.length, f: r.body?.faculty?.length });
    check('controller users list has no passwords', !r.body.students.some(s => 'password' in s), 'password field leaked');

    // Overview
    r = await j('/api/controller/overview', { headers: auth });
    check('overview 200', r.status === 200, r.status);
    check('overview counts', r.body?.counts?.students === 66 && r.body?.counts?.faculty === 5, r.body?.counts);
    check('overview subjectAverages length 5', r.body?.subjectAverages?.length === 5, r.body?.subjectAverages);
    check('overview has atRisk array', Array.isArray(r.body?.atRisk), r.body?.atRisk);
    check('overview has topPerformers', Array.isArray(r.body?.topPerformers) && r.body.topPerformers.length === 5, r.body?.topPerformers);

    // Student detail
    r = await j('/api/controller/students/26U201067', { headers: auth });
    check('student detail 200', r.status === 200, r.status);
    check('student detail rank matches login rank', r.body?.rank === 48, r.body?.rank);
    check('student detail has 5 subjects', r.body?.subjects?.length === 5, r.body?.subjects);

    r = await j('/api/controller/students/NOPE999', { headers: auth });
    check('student detail 404 for unknown', r.status === 404, r.status);

    // Faculty detail
    r = await j('/api/controller/faculty/FAC%23200', { headers: auth });
    check('faculty detail 200', r.status === 200, r.status);
    check('faculty detail studentsHandled = 66', r.body?.studentsHandled === 66, r.body?.studentsHandled);

    // Leaderboard
    r = await j('/api/controller/leaderboard', { headers: auth });
    check('leaderboard 200 and sorted desc', r.status === 200 && r.body.leaderboard[0].xp >= r.body.leaderboard[1].xp, r.status);

    // Subjects
    r = await j('/api/controller/subjects', { headers: auth });
    check('subjects 200, 5 subjects', r.status === 200 && r.body.subjects.length === 5, r.body?.subjects?.length);

    // Notes
    r = await j('/api/controller/notes', { headers: auth });
    check('notes 200', r.status === 200 && Object.keys(r.body.notes).length === 5, r.status);

    // Reports
    r = await j('/api/controller/reports', { headers: auth });
    check('reports 200', r.status === 200 && Array.isArray(r.body.perSubject), r.status);

    // ---- Create account flow ----
    const newReg = 'TEST#' + Date.now();
    r = await j('/api/controller/users', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student', regNumber: newReg, name: 'Test Student' }) });
    check('create student 201', r.status === 201, r.status);
    check('create student default password applied', typeof r.body?.user?.regNumber === 'string', r.body);

    // Duplicate check
    r = await j('/api/controller/users', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student', regNumber: newReg, name: 'Dup' }) });
    check('duplicate regNumber rejected', r.status === 400, r.status);

    // Missing name validation
    r = await j('/api/controller/users', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student', regNumber: 'TEST#NONAME' }) });
    check('missing name rejected', r.status === 400, r.status);

    // Weak password validation
    r = await j('/api/controller/users', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student', regNumber: 'TEST#WEAKPW', name: 'X', password: '123' }) });
    check('short password rejected', r.status === 400, r.status);

    // Faculty missing subject
    r = await j('/api/controller/users', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'faculty', regNumber: 'TEST#FAC1', name: 'X' }) });
    check('faculty missing subject rejected', r.status === 400, r.status);

    // New account can log in immediately
    r = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regNumber: newReg, password: 'Srcas@2026' }) });
    check('newly created student can log in with default password', r.status === 200, r.status);

    // Update
    r = await j(`/api/controller/users/${encodeURIComponent(newReg)}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Renamed Student' }) });
    check('update student 200', r.status === 200 && r.body.user.name === 'Renamed Student', r.body);

    // Delete
    r = await j(`/api/controller/users/${encodeURIComponent(newReg)}`, { method: 'DELETE', headers: auth });
    check('delete student 200', r.status === 200, r.status);
    r = await j(`/api/controller/users/${encodeURIComponent(newReg)}`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) });
    check('deleted student no longer found', r.status === 400, r.status);

    // Controller account update (settings)
    r = await j('/api/controller/account', { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Controller Renamed' }) });
    check('controller self-update 200', r.status === 200 && r.body.user.name === 'Controller Renamed', r.body);
    // revert
    await j('/api/controller/account', { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Controller' }) });

    // Logout invalidates token
    r = await j('/api/controller/logout', { method: 'POST', headers: auth });
    check('logout 200', r.status === 200, r.status);
    r = await j('/api/controller/users', { headers: auth });
    check('token invalid after logout', r.status === 401, r.status);

  } catch (e) {
    console.log('UNCAUGHT TEST ERROR:', e);
    fail++;
  } finally {
    server.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
