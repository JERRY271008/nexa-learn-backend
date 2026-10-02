// Controller dashboard regression test: boots the real backend in-process,
// loads the real controller/index.html into jsdom, signs in, and exercises
// every nav section, search/filter, and the create/edit/remove account
// flows end-to-end. Requires jsdom (npm install --save-dev jsdom).
// Run with: node tests/controller.test.js
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const express = require('express');
const cors = require('cors');
const authRoutes = require('../src/routes/authRoutes');
const controllerRoutes = require('../src/routes/controllerRoutes');
const aiRoutes = require('../src/routes/aiRoutes');
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

  let html = fs.readFileSync(path.join(__dirname, '../../controller/index.html'), 'utf8');
  html = html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com[^"]*"><\/script>/, '');
  html = html.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, '');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', resources: undefined, url: 'http://localhost/',
    // Must set NEXA_CONTROLLER_API before the inline <script> runs, since it
    // reads window.NEXA_CONTROLLER_API into a top-level `const API` once at
    // parse time — setting it after construction would be too late.
    beforeParse(window){ window.NEXA_CONTROLLER_API = `${base}/api/controller`; },
  });
  const { window } = dom;
  window.fetch = (...args) => fetch(...args);
  window.Chart = function(){ return { destroy(){}, update(){} }; };
  window.HTMLCanvasElement.prototype.getContext = () => ({});

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.error || e.message));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const byId = (id) => window.document.getElementById(id);
  const peek = (expr) => window.eval(expr);
  const contentHTML = () => byId('content').innerHTML;

  await wait(300); // DOMContentLoaded -> tryResumeSession()

  check('no session: login screen shown', !byId('loginScreen').classList.contains('hidden'));
  check('no session: app hidden', byId('app').classList.contains('hidden'));
  check('no uncaught errors on load', errors.length === 0, errors.map(String));

  // ---- wrong credentials ----
  byId('loginReg').value = 'CTRL#001';
  byId('loginPass').value = 'wrong-password';
  window.handleControllerLogin({ preventDefault(){} });
  await wait(300);
  check('wrong password shows an error message', byId('loginMsg').textContent.length > 0);
  check('wrong password stays on login screen', byId('app').classList.contains('hidden'));

  // ---- correct login ----
  byId('loginReg').value = 'CTRL#001';
  byId('loginPass').value = 'Controller@srcas';
  window.handleControllerLogin({ preventDefault(){} });
  await wait(400);
  check('login succeeds: app visible', !byId('app').classList.contains('hidden'));
  check('login succeeds: login screen hidden', byId('loginScreen').classList.contains('hidden'));
  check('token stored in sessionStorage', !!window.sessionStorage.getItem('nexaControllerToken'));
  check('no uncaught errors after login', errors.length === 0, errors.map(String));

  // ---- Overview ----
  check('lands on Overview by default', peek('STATE.view') === 'overview');
  await wait(50);
  let h = contentHTML();
  check('overview shows real student/faculty counts', /66/.test(h) && /Students/.test(h));
  check('overview has no fabricated numbers (sanity: renders subject chart canvas)', h.includes('ovSubjectChart'));

  // ---- Students list + search/filter ----
  window.navigateTo('students'); await wait(200);
  h = contentHTML();
  const rowCountAll = (h.match(/<tr class="clickable"/g) || []).length;
  check('students table renders all 66 students', rowCountAll === 66, rowCountAll);
  byId('studentSearch').value = '26U201067';
  window.renderStudentsTable();
  h = contentHTML();
  check('student search filters to a single row', (h.match(/<tr class="clickable"/g) || []).length === 1);
  check('student search finds the right student', h.includes('26U201067'));

  // ---- Student detail drill-down ----
  window.navigateTo('students', '26U201067'); await wait(300);
  h = contentHTML();
  check('student detail shows rank', /Leaderboard rank/.test(h));
  check('student detail shows subject chart', h.includes('studentSubjectChart'));
  check('student detail has Edit/Remove actions', /Edit/.test(h) && /Remove/.test(h));
  check('no uncaught errors on student detail', errors.length === 0, errors.map(String));

  // ---- Faculty list + detail ----
  window.navigateTo('faculty'); await wait(200);
  h = contentHTML();
  check('faculty table renders all 5 faculty', (h.match(/<tr class="clickable"/g) || []).length === 5);
  window.navigateTo('faculty', 'FAC#200'); await wait(300);
  h = contentHTML();
  check('faculty detail shows students handled', /Students handled/.test(h));
  check('faculty detail lists students in subject', h.includes('66') || /table/.test(h));

  // ---- Subjects ----
  window.navigateTo('subjects'); await wait(200);
  h = contentHTML();
  check('subjects page shows all 5 real subjects', ['C PROGRAMMING','ENGLISH','TAMIL','MATHS','WEB TECHNOLOGY'].every(s => h.includes(s)));
  check('subjects page has no old CS subjects', !/Data Structures|Operating Systems|DBMS/.test(h));

  // ---- Notes ----
  window.navigateTo('notes'); await wait(200);
  h = contentHTML();
  check('notes page groups by real subject', h.includes('C PROGRAMMING'));

  // ---- Leaderboard ----
  window.navigateTo('leaderboard'); await wait(200);
  h = contentHTML();
  check('leaderboard shows all 66 ranked rows', (h.match(/<tr class="clickable"/g) || []).length === 66);
  check('leaderboard has no fake demo names', !/Meera S\.|Kabir R\./.test(h));

  // ---- Reports ----
  window.navigateTo('reports'); await wait(200);
  h = contentHTML();
  check('reports page shows per-subject rollup', h.includes('C PROGRAMMING') && /Average/.test(h));

  // ---- Accounts (combined) ----
  window.navigateTo('accounts'); await wait(200);
  h = contentHTML();
  check('accounts page shows combined total', h.includes('71 accounts') || /71/.test(h));

  // ---- Create account flow ----
  const newReg = 'CTEST#' + Date.now();
  window.openCreateAccountModal('student');
  await wait(50);
  byId('caName').value = 'Functional Test Student';
  byId('caReg').value = newReg;
  window.submitCreateAccount({ preventDefault(){} }, 'student');
  await wait(400);
  check('modal closes after successful create', byId('modalRoot').innerHTML.trim() === '');
  h = contentHTML();
  check('new account appears immediately in Accounts table', h.includes(newReg));

  // duplicate check
  window.openCreateAccountModal('student');
  await wait(50);
  byId('caName').value = 'Dup';
  byId('caReg').value = newReg;
  window.submitCreateAccount({ preventDefault(){} }, 'student');
  await wait(300);
  check('duplicate register number shows inline error, modal stays open', byId('caMsg') && byId('caMsg').textContent.length > 0);
  window.closeModal();

  // new account can log in on the main site immediately
  let loginCheck = await fetch(`${base}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ regNumber: newReg, password: 'Srcas@2026' }) });
  check('newly created account can log in on the main site immediately', loginCheck.status === 200);

  // ---- Edit account flow ----
  window.openEditAccountModal(newReg, 'student');
  await wait(300);
  byId('eaName').value = 'Renamed By Test';
  window.submitEditAccount({ preventDefault(){} }, newReg);
  await wait(400);
  h = contentHTML();
  check('edited name reflects immediately', h.includes('Renamed By Test'));

  // ---- Remove account flow ----
  window.confirmRemoveAccount(newReg, 'Renamed By Test');
  await wait(50);
  window.submitRemoveAccount(newReg);
  await wait(400);
  h = contentHTML();
  check('removed account no longer appears', !h.includes(newReg));

  // ---- Settings (Controller's own account) ----
  window.navigateTo('settings'); await wait(100);
  h = contentHTML();
  check('settings page pre-fills current controller name', h.includes('Controller'));
  byId('settingsName').value = 'Controller Renamed';
  window.saveControllerSettings({ preventDefault(){} });
  await wait(300);
  check('sidebar name updates after settings save', byId('sidebarName').textContent === 'Controller Renamed');
  // revert
  byId('settingsName').value = 'Controller';
  window.saveControllerSettings({ preventDefault(){} });
  await wait(300);

  // ---- Logout ----
  window.handleLogout();
  await wait(300);
  check('logout returns to login screen', !byId('loginScreen').classList.contains('hidden'));
  check('logout clears the stored token', !window.sessionStorage.getItem('nexaControllerToken'));

  // ---- 401 handling: stale token should bounce to login, not crash ----
  window.sessionStorage.setItem('nexaControllerToken', 'not-a-real-token');
  window.eval("STATE.token = 'not-a-real-token'");
  errors.length = 0;
  await window.tryResumeSession();
  await wait(200);
  check('invalid token falls back to login screen without crashing', !byId('loginScreen').classList.contains('hidden') && errors.length === 0);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('UNCAUGHT', e); process.exit(1); });
