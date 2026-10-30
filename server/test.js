/**
 * CIVICTRACK AI — API integration tests
 *
 * Boots the real Express server against a throwaway SQLite database, then
 * exercises auth, RBAC, submission validation, the complaint workflow, notes,
 * votes, AI error handling, hotspots, statistics, analytics and departments.
 *
 * Run with: npm run test:api
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 4100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.join(os.tmpdir(), `civictrack-test-${Date.now()}-${Math.floor(Math.random() * 1000)}.db`);

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${name}${ok || !detail ? '' : `\n        → ${detail}`}`);
}

function check(name, condition, detail = '') {
  record(name, Boolean(condition), condition ? '' : detail);
}

function equal(name, actual, expected) {
  record(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

async function api(method, route, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { status: response.status, body: payload };
}

async function waitForServer(child) {
  const deadline = Date.now() + 25_000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
      lastError = `health returned ${response.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not become ready: ${lastError}`);
}

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      /* best effort */
    }
  }
}

const child = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_FILE,
    // Force the "not configured" path so AI assertions are deterministic even
    // when the developer has a real key in .env.
    GEMINI_API_KEY: '',
    NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
child.stdout.on('data', chunk => { serverLog += chunk.toString(); });
child.stderr.on('data', chunk => { serverLog += chunk.toString(); });

function shutdown(code) {
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  cleanup();
  process.exit(code);
}

process.on('uncaughtException', err => {
  console.error('\nUncaught error:', err);
  if (serverLog) console.error('\n--- server output ---\n' + serverLog);
  shutdown(1);
});

try {
  await waitForServer(child);
  console.log(`\nCIVICTRACK AI API tests on ${BASE} (db: ${path.basename(DB_FILE)})\n`);

  // ── Health and seed data ───────────────────────────────────────────────────
  console.log('Health and seeded data');
  {
    const health = await api('GET', '/api/health');
    equal('health responds 200', health.status, 200);
    equal('health reports AI not configured', health.body?.aiConfigured, false);
    check('health exposes an AI model name', typeof health.body?.aiModel === 'string' && health.body.aiModel.length > 0);

    const departments = await api('GET', '/api/departments');
    equal('departments respond 200', departments.status, 200);
    equal('five departments are seeded', departments.body?.departments?.length, 5);
    const names = (departments.body?.departments || []).map(d => d.name);
    check('Road Maintenance department exists', names.includes('Road Maintenance'));
    check('department metrics are numeric', typeof departments.body?.departments?.[0]?.activeComplaints === 'number');

    const complaints = await api('GET', '/api/complaints');
    equal('public complaint list responds 200', complaints.status, 200);
    equal('ten demo complaints are seeded', complaints.body?.complaints?.length, 10);
    check(
      'demo complaints are labelled and geotagged',
      (complaints.body?.complaints || []).every(
        c => c.isDemo === true && Number.isFinite(c.location?.lat) && Number.isFinite(c.location?.lng),
      ),
    );

    const stats = await api('GET', '/api/stats');
    equal('public stats respond 200', stats.status, 200);
    equal('public stats total matches seed', stats.body?.total, 10);
    equal('public stats flag demo data', stats.body?.demoData, true);

    const hotspots = await api('GET', '/api/hotspots');
    equal('hotspots respond 200', hotspots.status, 200);
    equal('hotspot request reports no date window by default', hotspots.body?.filters?.days, null);
    check('hotspots are computed from real coordinates', Array.isArray(hotspots.body?.hotspots) && hotspots.body.hotspots.length > 0);
    const firstHotspot = hotspots.body?.hotspots?.[0];
    check(
      'hotspot includes a centre, count and suggested action',
      Boolean(
        firstHotspot &&
        Array.isArray(firstHotspot.center) &&
        Number.isFinite(firstHotspot.center[0]) &&
        Number.isFinite(firstHotspot.center[1]) &&
        typeof firstHotspot.activeComplaintCount === 'number' &&
        typeof firstHotspot.suggestedInspectionAction === 'string',
      ),
    );
    check(
      'hotspot exposes the full summary required by the UI',
      Boolean(
        firstHotspot &&
        typeof firstHotspot.name === 'string' &&
        Number.isFinite(firstHotspot.radiusMeters) &&
        firstHotspot.radiusMeters > 0 &&
        Array.isArray(firstHotspot.categories) &&
        firstHotspot.categories.length > 0 &&
        Array.isArray(firstHotspot.dominantCategories) &&
        firstHotspot.dominantCategories.length > 0 &&
        ['low', 'medium', 'high', 'critical'].includes(firstHotspot.avgPriority) &&
        Number.isFinite(firstHotspot.avgPriorityScore) &&
        firstHotspot.avgPriorityScore >= 0 &&
        firstHotspot.avgPriorityScore <= 100 &&
        !Number.isNaN(Date.parse(firstHotspot.firstReportedAt)) &&
        !Number.isNaN(Date.parse(firstHotspot.lastReportedAt)) &&
        ['increasing', 'stable', 'decreasing'].includes(firstHotspot.trend) &&
        typeof firstHotspot.insight === 'string' &&
        firstHotspot.insight.length > 0,
      ),
    );
    check(
      'hotspot category counts reconcile with the complaint count',
      (hotspots.body?.hotspots || []).every(
        h =>
          h.categories.reduce((sum, category) => sum + category.count, 0) === h.activeComplaintCount &&
          Math.abs(h.categories.reduce((sum, category) => sum + (category.percentage || 0), 0) - 100) < 0.5,
      ),
    );
    const publicComplaints = await api('GET', '/api/complaints');
    const complaintById = new Map((publicComplaints.body?.complaints || []).map(c => [c.id, c]));
    check(
      'hotspots only cluster active complaints',
      (hotspots.body?.hotspots || []).every(h =>
        (h.complaintIds || []).every(id => {
          const complaint = complaintById.get(id);
          return complaint && ['submitted', 'under_review', 'assigned', 'in_progress'].includes(complaint.status);
        }),
      ),
    );
    const seededCluster = (hotspots.body?.hotspots || []).find(h =>
      ['CT-2026-903', 'CT-2026-904', 'CT-2026-905'].every(ticket => (h.complaintTickets || []).includes(ticket)),
    );
    check('seeded drainage cluster is detected from stored coordinates', Boolean(seededCluster));
    equal('resolved complaint does not inflate the seeded cluster', seededCluster?.activeComplaintCount, 3);
    check(
      'seeded cluster reports recurring categories and an infrastructure insight',
      Boolean(
        seededCluster &&
        seededCluster.categories.some(category => ['drainage_blockage', 'drainage'].includes(category.category)) &&
        seededCluster.categories.some(category => category.category === 'waterlogging') &&
        /infrastructure/i.test(seededCluster.insight || ''),
      ),
    );

    const windowed = await api('GET', '/api/hotspots?days=30');
    equal('date-windowed hotspot request responds 200', windowed.status, 200);
    equal('date window is echoed back to the client', windowed.body?.filters?.days, 30);
    const allTimeComplaintIds = new Set((hotspots.body?.hotspots || []).flatMap(h => h.complaintIds || []));
    check(
      'date window only returns clusters built from in-window complaints',
      (windowed.body?.hotspots || []).every(h =>
        (h.complaintIds || []).every(id => allTimeComplaintIds.has(id)),
      ),
    );

    const invalidWindow = await api('GET', '/api/hotspots?days=not-a-number');
    equal('invalid day window falls back to all time', invalidWindow.body?.filters?.days, null);
  }

  // ── Authentication ────────────────────────────────────────────────────────
  console.log('\nAuthentication and accounts');
  let citizenToken = '';
  let citizenId = '';
  let secondCitizenToken = '';
  let authorityToken = '';
  let adminToken = '';
  {
    const email = `tester-${Date.now()}@example.com`;
    const register = await api('POST', '/api/auth/register', {
      body: {
        name: 'Integration Tester',
        email,
        password: 'TestPass@123',
        phone: '+91 90000 00001',
        ward: 'Ward 3 - Shivaji Central',
        // A client must not be able to self-assign a privileged role.
        role: 'admin',
      },
    });
    equal('registration responds 201', register.status, 201);
    equal('registration always creates a citizen', register.body?.user?.role, 'citizen');
    check('registration returns a session token', typeof register.body?.token === 'string' && register.body.token.length > 0);
    citizenToken = register.body?.token || '';
    citizenId = register.body?.user?.id || '';

    const duplicate = await api('POST', '/api/auth/register', {
      body: { name: 'Duplicate', email, password: 'TestPass@123' },
    });
    equal('duplicate email is rejected', duplicate.status, 409);

    const shortPassword = await api('POST', '/api/auth/register', {
      body: { name: 'Short Pass', email: `short-${Date.now()}@example.com`, password: 'short' },
    });
    equal('weak password is rejected', shortPassword.status, 400);

    const badLogin = await api('POST', '/api/auth/login', {
      body: { email, password: 'WrongPass@123' },
    });
    equal('wrong password is rejected', badLogin.status, 401);

    const me = await api('GET', '/api/auth/me', { token: citizenToken });
    equal('session restores the current user', me.status, 200);
    equal('session resolves the registered email', me.body?.user?.email, email);

    const profile = await api('PATCH', '/api/auth/profile', {
      token: citizenToken,
      body: { name: 'Integration Tester Updated', phone: '+91 90000 00002', ward: 'Ward 5 - Kothrud' },
    });
    equal('profile update responds 200', profile.status, 200);
    equal('profile update is persisted', profile.body?.user?.name, 'Integration Tester Updated');
    equal('profile ward is persisted', profile.body?.user?.ward, 'Ward 5 - Kothrud');

    const second = await api('POST', '/api/auth/register', {
      body: { name: 'Second Tester', email: `second-${Date.now()}@example.com`, password: 'TestPass@123' },
    });
    equal('second citizen registers', second.status, 201);
    secondCitizenToken = second.body?.token || '';

    const authority = await api('POST', '/api/auth/login', {
      body: { email: 'authority@demo.civictrack', password: 'Authority@123' },
    });
    equal('demo authority login succeeds', authority.status, 200);
    equal('authority role is correct', authority.body?.user?.role, 'authority');
    authorityToken = authority.body?.token || '';

    const admin = await api('POST', '/api/auth/login', {
      body: { email: 'admin@demo.civictrack', password: 'Admin@123' },
    });
    equal('demo admin login succeeds', admin.status, 200);
    equal('admin role is correct', admin.body?.user?.role, 'admin');
    adminToken = admin.body?.token || '';

    const unauthorised = await api('GET', '/api/auth/me');
    equal('missing token is rejected', unauthorised.status, 401);
  }

  // ── Submission validation ─────────────────────────────────────────────────
  console.log('\nComplaint submission and validation');
  let ticketId = '';
  let ticketNumber = '';
  {
    const anon = await api('POST', '/api/complaints', {
      body: {
        title: 'No position',
        description: 'A complaint without any coordinates at all.',
        category: 'pothole',
        address: 'Somewhere',
      },
    });
    equal('anonymous submission is rejected', anon.status, 401);

    const invalid = await api('POST', '/api/complaints', {
      token: citizenToken,
      body: { title: 'Bad', description: 'short', category: 'not-a-category', address: '', lat: 0, lng: 0 },
    });
    equal('invalid submission responds 422', invalid.status, 422);
    check('validation lists the title error', Boolean(invalid.body?.fields?.title));
    check('validation lists the description error', Boolean(invalid.body?.fields?.description));
    check('validation lists the category error', Boolean(invalid.body?.fields?.category));
    check('validation lists the coordinate error', Boolean(invalid.body?.fields?.lat));

    const outOfRange = await api('POST', '/api/complaints', {
      token: citizenToken,
      body: {
        title: 'Out of range coordinates',
        description: 'Testing coordinate bounds on the submission endpoint.',
        category: 'pothole',
        address: 'Test location',
        lat: 123,
        lng: 500,
      },
    });
    equal('out-of-range coordinates are rejected', outOfRange.status, 422);

    const created = await api('POST', '/api/complaints', {
      token: citizenToken,
      body: {
        title: 'Overflowing drain beside the school gate',
        description: 'The storm drain outside the school gate is blocked and water is pooling across the footpath.',
        category: 'drainage',
        address: 'School Gate Road, near the pedestrian crossing',
        ward: 'Ward 5 - Kothrud',
        zone: 'West Zone',
        landmark: 'Opposite the school gate',
        lat: 18.5074,
        lng: 73.8077,
      },
    });
    equal('valid submission responds 201', created.status, 201);
    const complaint = created.body?.complaint;
    check('a unique ticket number is generated', typeof complaint?.ticketNumber === 'string' && /^CT-\d{4}-\d+$/.test(complaint.ticketNumber));
    equal('stored latitude matches the submission', complaint?.location?.lat, 18.5074);
    equal('stored longitude matches the submission', complaint?.location?.lng, 73.8077);
    equal('complaint starts in submitted status', complaint?.status, 'submitted');
    equal('complaint is owned by the submitting citizen', complaint?.citizenId, citizenId);
    check('submission creates a timeline event', Array.isArray(complaint?.timeline) && complaint.timeline.length >= 1);
    ticketId = complaint?.id || '';
    ticketNumber = complaint?.ticketNumber || '';

    const mine = await api('GET', '/api/complaints?scope=mine', { token: citizenToken });
    equal('scope=mine responds 200', mine.status, 200);
    equal('scope=mine returns only the new complaint', mine.body?.complaints?.length, 1);
    equal('scope=mine returns the created ticket', mine.body?.complaints?.[0]?.id, ticketId);

    const otherMine = await api('GET', '/api/complaints?scope=mine', { token: secondCitizenToken });
    equal('another citizen sees no complaints', otherMine.body?.complaints?.length, 0);

    const foreignNote = await api('POST', `/api/complaints/${ticketId}/notes`, {
      token: secondCitizenToken,
      body: { note: 'I should not be able to write this note.' },
    });
    equal("another citizen cannot note someone else's complaint", foreignNote.status, 403);

    const ownNote = await api('POST', `/api/complaints/${ticketId}/notes`, {
      token: citizenToken,
      body: { note: 'The water is still rising after the last rain.' },
    });
    equal('owner can add a follow-up note', ownNote.status, 201);
    check(
      'the note is stored on the timeline',
      (ownNote.body?.complaint?.timeline || []).some(e => e.description.includes('water is still rising')),
    );

    const vote = await api('POST', `/api/complaints/${ticketId}/vote`, { token: citizenToken });
    equal('vote responds 200', vote.status, 200);
    equal('first vote registers support', vote.body?.voted, true);
    const unvote = await api('POST', `/api/complaints/${ticketId}/vote`, { token: citizenToken });
    equal('second vote toggles support off', unvote.body?.voted, false);
  }

  // ── RBAC ──────────────────────────────────────────────────────────────────
  console.log('\nRole-based access control');
  {
    const citizenPatch = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: citizenToken,
      body: { status: 'resolved', note: 'Citizens must not be able to resolve complaints.' },
    });
    equal('citizen cannot patch a complaint', citizenPatch.status, 403);

    const citizenDepartment = await api('PATCH', '/api/departments/dept-roads', {
      token: citizenToken,
      body: { headName: 'Unauthorised' },
    });
    equal('citizen cannot edit departments', citizenDepartment.status, 403);

    const authorityDepartment = await api('PATCH', '/api/departments/dept-roads', {
      token: authorityToken,
      body: { headName: 'Unauthorised' },
    });
    equal('authority cannot edit departments (admin only)', authorityDepartment.status, 403);
  }

  // ── Workflow ──────────────────────────────────────────────────────────────
  console.log('\nComplaint workflow');
  {
    const skip = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: authorityToken,
      body: { status: 'resolved', note: 'Skipping the workflow should fail.' },
    });
    equal('submitted → resolved is rejected', skip.status, 422);

    const priority = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: authorityToken,
      body: { priority: 'high', note: 'Raised after field triage.' },
    });
    equal('authority can change priority', priority.status, 200);
    equal('priority change is persisted', priority.body?.complaint?.priority, 'high');

    const assign = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: authorityToken,
      body: { departmentId: 'dept-drainage', assignedOfficer: 'Drainage Crew 1' },
    });
    equal('department assignment responds 200', assign.status, 200);
    equal('assignment persists the department', assign.body?.complaint?.departmentId, 'dept-drainage');
    equal('assignment persists the officer', assign.body?.complaint?.assignedOfficer, 'Drainage Crew 1');

    const start = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: authorityToken,
      body: { status: 'in_progress', note: 'Drainage crew mobilised.' },
    });
    equal('in_progress transition responds 200', start.status, 200);
    equal('status is in_progress', start.body?.complaint?.status, 'in_progress');

    const resolveWithoutEvidence = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: authorityToken,
      body: { status: 'resolved' },
    });
    equal('resolving without a note or photo is rejected', resolveWithoutEvidence.status, 422);

    const resolve = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: authorityToken,
      body: {
        status: 'resolved',
        note: 'Drain cleared and the footpath washed down. Standing water removed.',
        resolutionNotes: 'Drain cleared, silt removed and the footpath cleaned.',
      },
    });
    equal('resolving with a note responds 200', resolve.status, 200);
    equal('status is resolved', resolve.body?.complaint?.status, 'resolved');
    check('closed timestamp is recorded', Boolean(resolve.body?.complaint?.closedAt));
    equal(
      'resolution notes are stored',
      resolve.body?.complaint?.resolutionNotes,
      'Drain cleared, silt removed and the footpath cleaned.',
    );

    const close = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: authorityToken,
      body: { status: 'closed', note: 'Verified and closed.' },
    });
    equal('resolved → closed responds 200', close.status, 200);
    equal('status is closed', close.body?.complaint?.status, 'closed');

    const reopen = await api('PATCH', `/api/complaints/${ticketId}`, {
      token: authorityToken,
      body: { status: 'in_progress' },
    });
    equal('closed complaints cannot be reopened', reopen.status, 422);

    const citizenView = await api('GET', `/api/complaints/${ticketNumber}`, { token: citizenToken });
    equal('citizen sees the authority update', citizenView.body?.complaint?.status, 'closed');
    check(
      'citizen timeline includes the resolution event',
      (citizenView.body?.complaint?.timeline || []).some(e => e.status === 'resolved'),
    );
  }

  // ── AI error handling ─────────────────────────────────────────────────────
  console.log('\nAI endpoints without a configured key');
  {
    const analyze = await api('POST', `/api/complaints/${ticketId}/analyze`, { token: authorityToken });
    equal('stored analysis reports the missing key', analyze.status, 503);
    equal('stored analysis returns an explicit code', analyze.body?.code, 'AI_NOT_CONFIGURED');

    const preview = await api('POST', '/api/ai/analyze-preview', {
      token: citizenToken,
      body: {
        complaint: {
          title: 'Streetlight is out',
          description: 'The streetlight at the corner has been dark for several nights.',
          category: 'streetlight',
          location: { lat: 18.51, lng: 73.85, address: 'Corner road' },
        },
      },
    });
    equal('AI preview reports the missing key', preview.status, 503);
    equal('AI preview does not fabricate a result', preview.body?.analysis, undefined);

    const reviewWithoutAnalysis = await api('PATCH', '/api/complaints/CT-2026-881/ai-review', {
      token: authorityToken,
      body: { categoryOverride: 'pothole' },
    });
    equal('AI review requires an existing analysis', reviewWithoutAnalysis.status, 422);
  }

  // ── Analytics and department edits ────────────────────────────────────────
  console.log('\nAnalytics and department management');
  {
    const analytics = await api('GET', '/api/analytics');
    equal('analytics respond 200', analytics.status, 200);
    check('analytics expose KPI totals', (analytics.body?.kpis?.totalComplaints ?? 0) >= 11);
    equal('analytics return six months', analytics.body?.months?.length, 6);
    const categoryTotal = (analytics.body?.categories || []).reduce((sum, c) => sum + c.count, 0);
    equal('category counts add up to the total', categoryTotal, analytics.body?.kpis?.totalComplaints);
    equal('analytics include all five departments', analytics.body?.departments?.length, 5);
    check('recent complaints are limited to eight', (analytics.body?.recent || []).length <= 8);
    equal('analytics report the AI as unconfigured', analytics.body?.kpis?.aiConfigured, false);

    const updatedDepartment = await api('PATCH', '/api/departments/dept-roads', {
      token: adminToken,
      body: {
        headName: 'Integration Roads Head',
        headEmail: 'roads.head@example.com',
        phone: '+91 90000 00003',
        totalOfficers: 14,
        activeFieldTeams: 4,
        operatingZones: ['Central Zone', 'East Zone'],
      },
    });
    equal('admin can update a department', updatedDepartment.status, 200);
    equal('department head is persisted', updatedDepartment.body?.department?.headName, 'Integration Roads Head');
    equal('department officer count is persisted', updatedDepartment.body?.department?.totalOfficers, 14);
    check(
      'department operating zones are persisted',
      JSON.stringify(updatedDepartment.body?.department?.operatingZones) === JSON.stringify(['Central Zone', 'East Zone']),
    );

    const invalidDepartment = await api('PATCH', '/api/departments/dept-roads', {
      token: adminToken,
      body: { headEmail: 'not-an-email' },
    });
    equal('invalid department email is rejected', invalidDepartment.status, 400);

    const unknownRoute = await api('GET', '/api/this-route-does-not-exist');
    equal('unknown API routes return JSON 404', unknownRoute.status, 404);
    check('unknown API routes include an error message', typeof unknownRoute.body?.error === 'string');
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  console.log('\nSession lifecycle');
  {
    const logout = await api('POST', '/api/auth/logout', { token: citizenToken });
    equal('logout responds 200', logout.status, 200);
    const afterLogout = await api('GET', '/api/auth/me', { token: citizenToken });
    equal('the revoked token is rejected', afterLogout.status, 401);
  }
} catch (err) {
  console.error('\nTest run aborted:', err);
  if (serverLog) console.error('\n--- server output ---\n' + serverLog);
  shutdown(1);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log('\nFailed checks:');
  failed.forEach(r => console.log(`  - ${r.name}${r.detail ? ` (${r.detail})` : ''}`));
  if (serverLog) console.log('\n--- server output ---\n' + serverLog);
  shutdown(1);
} else {
  shutdown(0);
}
