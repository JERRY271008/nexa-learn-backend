const fs = require('fs'), path = require('path');
const DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');

const DEFAULT_SUBJECTS = ['C PROGRAMMING', 'ENGLISH', 'TAMIL', 'MATHS', 'WEB TECHNOLOGY'];
const DEFAULT_STUDENT_PASSWORD = 'Srcas@2026';
const DEFAULT_FACULTY_PASSWORD = 'Faculty@srcas';

const readDB = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeDB = db => { const t = DATA_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(db, null, 2)); fs.renameSync(t, DATA_FILE); };
const safeUser = u => { const { password, ...rest } = u; return rest; };

function findUser(reg) {
  const db = readDB(), k = String(reg || '').trim().toLowerCase();
  const s = db.students.find(x => x.regNumber.toLowerCase() === k);
  if (s) return { role: 'student', user: s, db };
  const f = db.faculty.find(x => x.regNumber.toLowerCase() === k);
  if (f) return { role: 'faculty', user: f, db };
  if (db.controller?.regNumber.toLowerCase() === k) return { role: 'controller', user: db.controller, db };
  return null;
}

function login(reg, password) {
  const x = findUser(reg);
  return x && x.user.password === password ? { role: x.role, user: safeUser(x.user) } : null;
}

function listUsers() {
  const d = readDB();
  return { students: d.students.map(safeUser), faculty: d.faculty.map(safeUser) };
}

/** Union of every subject key actually present on any student, falling back
 *  to the known default curriculum so the list is never empty. This makes
 *  Subjects/Reports/dropdowns follow whatever the Controller's real student
 *  data contains instead of a second, hand-maintained subject list. */
function allSubjects(db) {
  const found = new Set();
  (db.students || []).forEach(s => Object.keys(s.subjects || {}).forEach(k => found.add(k)));
  return found.size ? [...found] : DEFAULT_SUBJECTS.slice();
}

function validateCreatePayload(role, data) {
  if (role !== 'student' && role !== 'faculty') throw Error('Role must be "student" or "faculty".');
  const reg = String(data.regNumber || '').trim();
  const name = String(data.name || '').trim();
  if (!reg) throw Error('Register number is required.');
  if (!name) throw Error('Full name is required.');
  const password = String(data.password ?? (role === 'student' ? DEFAULT_STUDENT_PASSWORD : DEFAULT_FACULTY_PASSWORD));
  if (password.length < 6) throw Error('Password must be at least 6 characters.');
  if (role === 'faculty' && !String(data.subject || '').trim()) throw Error('Subject is required for a faculty account.');
  return { reg, name, password };
}

function createUser(role, data) {
  const d = readDB();
  const target = role === 'student' ? d.students : role === 'faculty' ? d.faculty : null;
  const { reg, name, password } = validateCreatePayload(role, data);
  if (!target) throw Error('Role must be student or faculty.');
  if ([...d.students, ...d.faculty].some(x => x.regNumber.toLowerCase() === reg.toLowerCase())) {
    throw Error('An account with this register number already exists.');
  }
  if (d.controller?.regNumber?.toLowerCase() === reg.toLowerCase()) {
    throw Error('That register number is reserved for the Controller account.');
  }
  let u;
  const now = new Date().toISOString();
  if (role === 'student') {
    u = {
      regNumber: reg,
      name,
      className: data.className || 'I BCA Shift 2',
      department: data.department || 'Computer Applications',
      year: data.year || '1st Year',
      course: data.course || 'BCA',
      password,
      attendance: Number(data.attendance ?? 85),
      progress: Number(data.progress ?? 75),
      xp: Number(data.xp ?? 750),
      marks: Number(data.marks ?? 70),
      streak: Number(data.streak ?? 1),
      subjects: data.subjects || Object.fromEntries(allSubjects(d).map(s => [s, 70])),
      createdAt: now,
    };
  } else {
    u = {
      regNumber: reg,
      name,
      subject: String(data.subject || 'General').trim(),
      className: data.className || 'I BCA Shift 2',
      department: data.department || 'Computer Applications',
      password,
      createdAt: now,
    };
  }
  target.push(u);
  writeDB(d);
  return safeUser(u);
}

function updateUser(reg, patch) {
  const d = readDB(), k = String(reg).trim().toLowerCase();
  const u = [...d.students, ...d.faculty].find(x => x.regNumber.toLowerCase() === k);
  if (!u) throw Error('User not found.');
  if (patch && patch.password !== undefined && String(patch.password).length < 6) {
    throw Error('Password must be at least 6 characters.');
  }
  if (patch && patch.name !== undefined && !String(patch.name).trim()) {
    throw Error('Name cannot be empty.');
  }
  for (const [key, val] of Object.entries(patch || {})) {
    if (key !== 'regNumber' && key !== 'role' && val !== undefined) u[key] = val;
  }
  writeDB(d);
  return safeUser(u);
}

function deleteUser(reg) {
  const d = readDB(), k = String(reg).trim().toLowerCase();
  let removed = false;
  for (const key of ['students', 'faculty']) {
    const before = d[key].length;
    d[key] = d[key].filter(x => x.regNumber.toLowerCase() !== k);
    removed ||= before !== d[key].length;
  }
  if (!removed) throw Error('User not found.');
  writeDB(d);
}

function updateControllerAccount(patch) {
  const d = readDB();
  if (!d.controller) throw Error('Controller account not found.');
  if (patch && patch.password !== undefined && String(patch.password).length < 6) {
    throw Error('Password must be at least 6 characters.');
  }
  if (patch && patch.name !== undefined) d.controller.name = String(patch.name).trim() || d.controller.name;
  if (patch && patch.password !== undefined) d.controller.password = String(patch.password);
  writeDB(d);
  return safeUser(d.controller);
}

/** Seed subject-note catalog, in the same shape used across student Notes,
 *  faculty Materials and the Controller's Notes/materials view. Each note
 *  gets a stable id and hasFile:false since these are catalog placeholders,
 *  not real uploaded binaries — real faculty uploads (via the Materials +
 *  Quality Checker page) get hasFile:true and their own id when published. */
function buildNotes(db) {
  const subjects = allSubjects(db);
  const catalog = {
    'C PROGRAMMING': ['C Programming Basics.pdf', 'Functions & Arrays Notes.pdf'],
    'ENGLISH': ['Communication Skills.pdf', 'Grammar Essentials.pdf'],
    'TAMIL': ['Tamil Literature Notes.pdf', 'Ilakkiyam Revision.pdf'],
    'MATHS': ['Differential Calculus.pdf', 'Probability Basics.pdf'],
    'WEB TECHNOLOGY': ['HTML CSS JavaScript.pdf', 'Web Technology Lab.pdf'],
  };
  const out = {};
  subjects.forEach(subject => {
    const files = catalog[subject] || [`${subject} — Notes.pdf`, `${subject} — Reference.pdf`];
    out[subject] = files.map((name, i) => ({
      id: `seed_${subject.replace(/\s+/g, '_').toLowerCase()}_${i}`,
      name,
      subject,
      faculty: true,
      hasFile: false,
      status: 'Reference',
      date: `${2 + i} Sep`,
      topic: subject,
    }));
  });
  return out;
}

function leaderboardFor(db) {
  return db.students
    .map(a => ({ name: a.name, xp: Number(a.xp || 0), regNumber: a.regNumber }))
    .sort((a, b) => b.xp - a.xp)
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

function dashboardData(reg) {
  const d = readDB(), x = findUser(reg);
  if (!x) return null;
  if (x.role === 'student') {
    const s = x.user, lb = leaderboardFor(d);
    return {
      user: safeUser(s),
      role: 'student',
      leaderboard: lb,
      rank: lb.find(a => a.regNumber === s.regNumber)?.rank || 0,
      notes: buildNotes(d),
      subjects: Object.keys(s.subjects || {}),
    };
  }
  if (x.role === 'faculty') {
    const f = x.user;
    const students = d.students.map(s => ({
      name: s.name,
      regNumber: s.regNumber,
      performance: Number(s.progress || 0),
      attendance: Number(s.attendance || 0),
      weak: Object.entries(s.subjects || {}).sort((a, b) => a[1] - b[1])[0]?.[0] || '—',
      status: Number(s.attendance || 0) < 75 ? 'attn' : 'good',
    }));
    // Real, single-source-of-truth class average per subject (replaces the
    // old hardcoded "II Yr / III Yr / IV Yr" demo chart on the faculty home
    // page, which never reflected the actual roster).
    const subjectAverages = {};
    allSubjects(d).forEach(subj => {
      const scores = d.students.map(s => s.subjects?.[subj]).filter(v => typeof v === 'number');
      subjectAverages[subj] = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    });
    return {
      user: safeUser(f),
      role: 'faculty',
      students,
      materials: buildNotes(d),
      subjectAverages,
    };
  }
  return { user: safeUser(x.user), role: 'controller' };
}

/** Aggregate stats for the Controller Overview/analytics page. */
function overview() {
  const d = readDB();
  const students = d.students, faculty = d.faculty;
  const avg = arr => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);
  const subjects = allSubjects(d);
  const subjectAverages = subjects.map(subj => {
    const scores = students.map(s => s.subjects?.[subj]).filter(v => typeof v === 'number');
    return { subject: subj, average: avg(scores), studentsCounted: scores.length };
  });
  const atRisk = students.filter(s => Number(s.attendance || 0) < 75 || Number(s.progress || 0) < 60)
    .map(s => ({ regNumber: s.regNumber, name: s.name, attendance: s.attendance, progress: s.progress }));
  const topPerformers = [...students].sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0)).slice(0, 5)
    .map(s => ({ regNumber: s.regNumber, name: s.name, xp: s.xp, progress: s.progress }));
  const recentAccounts = [...students, ...faculty]
    .filter(u => u.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6)
    .map(u => ({ regNumber: u.regNumber, name: u.name, role: students.includes(u) ? 'student' : 'faculty', createdAt: u.createdAt }));
  return {
    counts: { students: students.length, faculty: faculty.length, total: students.length + faculty.length },
    averages: {
      attendance: avg(students.map(s => Number(s.attendance || 0))),
      progress: avg(students.map(s => Number(s.progress || 0))),
      marks: avg(students.map(s => Number(s.marks || 0))),
      xp: avg(students.map(s => Number(s.xp || 0))),
    },
    subjectAverages,
    atRisk,
    topPerformers,
    recentAccounts,
    departments: [...new Set(students.map(s => s.department).filter(Boolean))],
  };
}

/** Full profile for the Controller's student-detail drill-down. */
function studentDetail(regNumber) {
  const d = readDB();
  const s = d.students.find(x => x.regNumber.toLowerCase() === String(regNumber).trim().toLowerCase());
  if (!s) return null;
  const lb = leaderboardFor(d);
  const rankEntry = lb.find(a => a.regNumber === s.regNumber);
  const subjects = Object.entries(s.subjects || {}).map(([subject, score]) => ({ subject, score }));
  const strongest = [...subjects].sort((a, b) => b.score - a.score)[0] || null;
  const weakest = [...subjects].sort((a, b) => a.score - b.score)[0] || null;
  return {
    profile: safeUser(s),
    rank: rankEntry?.rank || null,
    totalStudents: lb.length,
    subjects,
    strongest,
    weakest,
    leaderboardNeighbors: rankEntry
      ? lb.slice(Math.max(0, rankEntry.rank - 3), rankEntry.rank + 2)
      : [],
  };
}

/** Full profile for the Controller's faculty-detail drill-down. */
function facultyDetail(regNumber) {
  const d = readDB();
  const f = d.faculty.find(x => x.regNumber.toLowerCase() === String(regNumber).trim().toLowerCase());
  if (!f) return null;
  const studentsInSubject = d.students
    .map(s => ({
      regNumber: s.regNumber,
      name: s.name,
      score: s.subjects?.[f.subject] ?? null,
      attendance: s.attendance,
    }))
    .filter(s => s.score !== null)
    .sort((a, b) => b.score - a.score);
  const avgScore = studentsInSubject.length
    ? Math.round((studentsInSubject.reduce((a, b) => a + b.score, 0) / studentsInSubject.length) * 10) / 10
    : null;
  return {
    profile: safeUser(f),
    subject: f.subject,
    studentsHandled: studentsInSubject.length,
    averageScoreInSubject: avgScore,
    students: studentsInSubject,
    materials: (buildNotes(d)[f.subject] || []),
  };
}

/** Simple aggregate report data (per-class + per-subject rollups). */
function reports() {
  const d = readDB();
  const subjects = allSubjects(d);
  const perSubject = subjects.map(subj => {
    const scores = d.students.map(s => s.subjects?.[subj]).filter(v => typeof v === 'number');
    const facultyForSubject = d.faculty.filter(f => f.subject === subj).map(f => f.name);
    return {
      subject: subj,
      average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
      highest: scores.length ? Math.max(...scores) : 0,
      lowest: scores.length ? Math.min(...scores) : 0,
      faculty: facultyForSubject,
    };
  });
  const byClass = {};
  d.students.forEach(s => {
    const key = s.className || 'Unassigned';
    if (!byClass[key]) byClass[key] = { className: key, students: 0, attendanceTotal: 0, progressTotal: 0 };
    byClass[key].students += 1;
    byClass[key].attendanceTotal += Number(s.attendance || 0);
    byClass[key].progressTotal += Number(s.progress || 0);
  });
  const classSummary = Object.values(byClass).map(c => ({
    className: c.className,
    students: c.students,
    avgAttendance: Math.round((c.attendanceTotal / c.students) * 10) / 10,
    avgProgress: Math.round((c.progressTotal / c.students) * 10) / 10,
  }));
  return { perSubject, classSummary, generatedAt: new Date().toISOString() };
}

module.exports = {
  readDB, writeDB, safeUser, findUser, login, listUsers,
  createUser, updateUser, deleteUser, updateControllerAccount,
  dashboardData, overview, studentDetail, facultyDetail, reports,
  buildNotes, leaderboardFor, allSubjects,
};
