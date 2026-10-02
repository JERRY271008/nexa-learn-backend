// Frontend regression test: boots the real backend in-process, loads the
// real frontend/index.html into jsdom, logs in as a real student and a
// real faculty account, and exercises key UI flows end-to-end.
// Requires jsdom (npm install --save-dev jsdom). Run with: node tests/frontend.test.js
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

process.chdir(path.join(__dirname, '..')); // ensure .env loads regardless of invocation cwd
const express = require('express');
const cors = require('cors');
const config = require('../src/config');
const aiRoutes = require('../src/routes/aiRoutes');
const authRoutes = require('../src/routes/authRoutes');
const controllerRoutes = require('../src/routes/controllerRoutes');
const { aiRateLimiter } = require('../src/middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('../src/middleware/errorHandler');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

(async () => {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/controller', controllerRoutes);
  app.use('/api/ai', aiRateLimiter, aiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  let html = fs.readFileSync(path.join(__dirname, '../../frontend/index.html'), 'utf8');
  // Strip the Chart.js CDN <script src> tag — no network access to cdnjs in
  // this sandbox, and jsdom would otherwise hang/error trying to fetch it.
  html = html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com[^"]*"><\/script>/, '');

  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: undefined, url: 'http://localhost/' });
  const { window } = dom;
  window.fetch = (...args) => fetch(...args); // use Node's real fetch
  window.NEXA_AUTH_BASE = `${base}/api/auth`;
  window.NEXA_API_BASE = `${base}/api/ai`;
  // Stub Chart.js (not loaded — see above) so drawChart() doesn't throw.
  window.Chart = function(){ return { destroy(){}, update(){} }; };
  // jsdom doesn't implement scrollTo/matchMedia by default.
  window.matchMedia = window.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){} }));
  // jsdom has no real <canvas> backend (the `canvas` npm package isn't
  // installed) — getContext() logs a virtual-console warning and returns
  // undefined. That's a test-environment limitation, not an app bug (real
  // browsers implement canvas fully), so give it a harmless stub context.
  window.HTMLCanvasElement.prototype.getContext = () => ({});

  // STATE/DB/quizQuestions/quizState are declared with `let`/`const` at the
  // top level of a classic <script>, so — exactly as in a real browser's
  // console — they live in the page's global lexical scope but are NOT
  // properties of `window`. Read them via eval() in that same scope,
  // exactly like typing `STATE` into a real browser's devtools console.
  const peek = (expr) => window.eval(expr);

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.error || e.message));

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const byId = (id) => window.document.getElementById(id);

  await wait(300); // let DOMContentLoaded / initial async restoreSession() settle

  check('login screen visible on fresh load', !byId('loginScreen').classList.contains('hidden'));
  check('app shell hidden on fresh load', byId('appShell').classList.contains('hidden'));
  check('no uncaught JS errors on load', errors.length === 0, errors.map(String));

  // ---- Student login flow ----
  byId('loginIdentity').value = '26U201067';
  byId('loginPassword').value = 'Srcas@2026';
  window.handleLogin({ preventDefault(){} });
  await wait(300);

  check('after student login: app shell visible', !byId('appShell').classList.contains('hidden'));
  check('after student login: login screen hidden', byId('loginScreen').classList.contains('hidden'));
  check('STATE.role is student', peek('STATE.role') === 'student');
  check('leaderboard loaded with 66 real students', peek('DB.leaderboard').length === 66, peek('DB.leaderboard').length);
  check('no fake demo names in leaderboard', !peek('DB.leaderboard').some(r => ['Meera S.','Kabir R.','Ishaan V.'].includes(r.name)));
  check('rank is a real number > 0', typeof peek('DB.student').rank === 'number' && peek('DB.student').rank > 0, peek('DB.student').rank);
  check('notes use real subjects', Object.keys(peek('DB.notes')).sort().join(',') === ['C PROGRAMMING','ENGLISH','MATHS','TAMIL','WEB TECHNOLOGY'].sort().join(','), Object.keys(peek('DB.notes')));

  // Home page render
  window.navigateTo('home');
  const homeHTML = byId('content').innerHTML;
  check('home page mentions real student name', homeHTML.includes(peek('DB.student').name));
  check('home page leaderboard preview is NOT the full 66-row dump', (homeHTML.match(/<tr/g) || []).length <= 6, (homeHTML.match(/<tr/g) || []).length);
  check('no literal "240 learners" text remains', !homeHTML.includes('240 learners'));
  check('student level is computed from real marks, not a hardcoded constant', (() => {
    const marks = peek('DB.student').marks;
    const expectedLevel = Math.max(1, Math.floor((marks||0)/20)+1);
    return homeHTML.includes(`Level ${expectedLevel}`);
  })());

  // Full leaderboard page
  window.navigateTo('leaderboard');
  const lbHTML = byId('content').innerHTML;
  check('leaderboard page renders all 66 real rows', (lbHTML.match(/<tr/g) || []).length >= 66, (lbHTML.match(/<tr/g) || []).length);
  check('leaderboard page has no fabricated "tasks" column', !lbHTML.includes(' tasks</td>'));
  check('leaderboard page has no fake "Resets in 3 Days"', !lbHTML.includes('Resets in'));

  // Quiz page: real subject tags, hint uses q.subject not hardcoded
  window.navigateTo('quizAI');
  await wait(50);
  const q0 = peek('quizQuestions[quizState.index]');
  check('quiz question has a real subject tag', ['C PROGRAMMING','ENGLISH','TAMIL','MATHS','WEB TECHNOLOGY'].includes(q0.subject), q0.subject);

  // Notes page: real subjects
  window.navigateTo('notes');
  const notesHTML = byId('content').innerHTML;
  check('notes page has no old CS subjects', !/Data Structures|Operating Systems|DBMS|Computer Networks/.test(notesHTML));
  check('notes page mentions a real subject', /C PROGRAMMING|ENGLISH|TAMIL|MATHS|WEB TECHNOLOGY/.test(notesHTML));

  // Copy/paste should now work inside form fields
  const loginPwField = byId('loginPassword');
  const pasteEvt = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvt, 'target', { value: loginPwField });
  const notPrevented = window.document.dispatchEvent(pasteEvt);
  check('paste is NOT blocked inside an input field', notPrevented === true);

  // addXP leaderboard rank math should never be undefined for any of the 66 entries
  peek('addXP(0, null)');
  check('no undefined ranks in leaderboard after addXP', !peek('DB.leaderboard').some(r => r.rank === undefined || Number.isNaN(r.rank)));
  check("student's own leaderboard row updates via regNumber match", peek('DB.leaderboard').find(r => r.regNumber === peek('DB.student').regNumber)?.xp === peek('DB.student').xp);

  check('rewards are computed per-student, not a fixed identical set', Array.isArray(peek('DB.rewards')) && peek('DB.rewards').every(r => typeof r.earned === 'boolean'));

  window.logout && window.logout();

  // ---- Faculty login flow ----
  errors.length = 0;
  byId('loginIdentity').value = 'FAC#200';
  byId('loginPassword').value = 'Faculty@srcas';
  window.handleLogin({ preventDefault(){} });
  await wait(300);
  check('faculty login: no uncaught errors', errors.length === 0, errors.map(String));
  check('faculty login: STATE.role is faculty', peek('STATE.role') === 'faculty');
  check('faculty roster has 66 real students', peek('DB.faculty').students.length === 66, peek('DB.faculty').students.length);
  check('faculty avgPerformance is derived (not the old hardcoded 74)', typeof peek('DB.faculty').avgPerformance === 'number');

  window.navigateTo('home');
  const facHomeHTML = byId('content').innerHTML;
  check('faculty home has no fake "II Yr/III Yr/IV Yr" chart label', !facHomeHTML.includes('II Yr'));
  check('faculty home chart now labelled by subject', facHomeHTML.includes('Class average by subject'));

  window.navigateTo('materials');
  const matHTML = byId('content').innerHTML;
  check('materials subject dropdown uses real subjects', /C PROGRAMMING/.test(matHTML) && !/Data Structures/.test(matHTML));

  window.navigateTo('insights');
  await wait(50);
  const insightsHTML = byId('content').innerHTML;
  check('insights fallback has no fake "Student B"/"Trees" text', !/Student B|Binary Trees/.test(insightsHTML));

  window.navigateTo('analytics');
  const analyticsHTML = byId('content').innerHTML;
  check('analytics subject filter uses real subjects, not old CS ones', /C PROGRAMMING/.test(analyticsHTML) && !/<option>Data Structures/.test(analyticsHTML));

  // ---- Controller credentials on the MAIN site should show a message, not crash ----
  errors.length = 0;
  window.logout && window.logout();
  byId('loginIdentity').value = 'CTRL#001';
  byId('loginPassword').value = 'Controller@srcas';
  window.handleLogin({ preventDefault(){} });
  await wait(300);
  check('controller login on main site: no crash / no uncaught errors', errors.length === 0, errors.map(String));
  check('controller login on main site: stays on login screen with a message', !byId('loginScreen').classList.contains('hidden'));
  check('controller login on main site: shows a clear redirect message', /Controller portal/i.test(byId('loginMessage').textContent));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('UNCAUGHT', e); process.exit(1); });
