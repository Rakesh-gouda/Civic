import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, nowIso, newId, hashPassword, verifyPassword, json } from './db.js';
import { buildHotspots, haversineMeters, CATEGORY_LABELS } from './geo.js';
import {
  analyzeComplaint, classifyComplaint, summarizeComplaint, generateActionBrief,
  isAiConfigured, AIConfigError, AIRequestError,
} from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:4173', 'http://127.0.0.1:4173',
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '8mb' }));
// Resolve the bearer session once for every request so authRequired/roleRequired
// can rely on req.user being populated.
app.use(authOptional);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

const CATEGORIES = ['pothole', 'road_damage', 'drainage', 'drainage_blockage', 'waterlogging', 'garbage', 'garbage_overflow', 'streetlight', 'broken_streetlight', 'electrical_hazard', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected'];
const AI_CATEGORIES = ['pothole', 'road_damage', 'drainage_blockage', 'waterlogging', 'garbage_overflow', 'broken_streetlight', 'electrical_hazard', 'other'];

const CATEGORY_TO_DEPARTMENT = {
  pothole: 'dept-roads',
  road_damage: 'dept-roads',
  drainage: 'dept-drainage',
  drainage_blockage: 'dept-drainage',
  waterlogging: 'dept-drainage',
  garbage: 'dept-waste',
  garbage_overflow: 'dept-waste',
  streetlight: 'dept-electrical',
  broken_streetlight: 'dept-electrical',
  electrical_hazard: 'dept-electrical',
  other: 'dept-public-works',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone || undefined,
    ward: row.ward || undefined,
    badge: row.badge || undefined,
    departmentId: row.department_id || undefined,
    karmaPoints: row.karma_points,
    avatarUrl: row.avatar_url || undefined,
  };
}

function getSessionUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.*, s.expires_at FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { ...userFromRow(row), token };
}

function authOptional(req, _res, next) {
  req.user = getSessionUser(req);
  next();
}

function authRequired(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Sign in is required for this action.', 'UNAUTHENTICATED'));
  next();
}

function roleRequired(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Sign in is required for this action.', 'UNAUTHENTICATED'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Your account does not have permission for this action.', 'FORBIDDEN'));
    next();
  };
}

function isStaff(user) {
  return user && (user.role === 'authority' || user.role === 'admin');
}

function canAccessComplaint(user, row) {
  return Boolean(user && (isStaff(user) || row.citizen_id === user.id));
}

function timelineFor(complaintId) {
  return db.prepare('SELECT * FROM timeline WHERE complaint_id = ? ORDER BY timestamp ASC').all(complaintId).map(e => ({
    id: e.id,
    status: e.status,
    title: e.title,
    description: e.description,
    timestamp: e.timestamp,
    actor: e.actor,
    actorRole: e.actor_role,
    note: e.note || undefined,
    evidencePhotoUrl: e.evidence_photo_url || undefined,
  }));
}

function serializeComplaint(row, viewer) {
  if (!row) return null;
  const staff = isStaff(viewer);
  const owner = viewer && row.citizen_id === viewer.id;
  const hideIdentity = Boolean(row.is_anonymous) && !staff && !owner;
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    location: {
      lat: Number(row.lat),
      lng: Number(row.lng),
      address: row.address,
      ward: row.ward,
      zone: row.zone,
      landmark: row.landmark || undefined,
    },
    imageUrl: row.image_url || undefined,
    resolutionImageUrl: row.resolution_image_url || undefined,
    resolutionNotes: row.resolution_notes || undefined,
    citizenId: staff || owner ? row.citizen_id || undefined : undefined,
    citizenName: hideIdentity ? 'Anonymous Citizen' : row.citizen_name,
    citizenPhone: staff || owner ? row.citizen_phone || undefined : undefined,
    citizenEmail: staff || owner ? row.citizen_email || undefined : undefined,
    isAnonymous: Boolean(row.is_anonymous),
    isDemo: Boolean(row.is_demo),
    departmentId: row.department_id || '',
    assignedOfficer: row.assigned_officer || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetResolutionDate: row.target_resolution_date,
    closedAt: row.closed_at || undefined,
    upvotes: row.upvotes,
    aiAnalysis: json(row.ai_json, null),
    aiStatus: row.ai_status || 'not_analyzed',
    aiOverrides: json(row.ai_overrides_json, {}),
    duplicateOf: row.duplicate_of || undefined,
    timeline: timelineFor(row.id),
  };
}

function findComplaint(idOrTicket) {
  return db.prepare('SELECT * FROM complaints WHERE id = ? OR ticket_number = ?').get(idOrTicket, idOrTicket);
}

function requireComplaint(idOrTicket) {
  const row = findComplaint(idOrTicket);
  if (!row) throw new HttpError(404, 'Complaint not found.', 'NOT_FOUND');
  return row;
}

function addTimeline(complaintId, { status, title, description, actor, actorRole, note, evidencePhotoUrl }) {
  const id = newId('tl');
  db.prepare(`INSERT INTO timeline
    (id, complaint_id, status, title, description, timestamp, actor, actor_role, note, evidence_photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, complaintId, status, title, description, nowIso(), actor, actorRole, note || null, evidencePhotoUrl || null);
  return id;
}

function generateTicketNumber() {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ticket = `CT-${year}-${crypto.randomInt(10000, 99999)}`;
    if (!db.prepare('SELECT 1 FROM complaints WHERE ticket_number = ?').get(ticket)) return ticket;
  }
  throw new HttpError(500, 'Could not allocate a unique complaint ID. Please retry.');
}

function validateComplaintInput(body) {
  const errors = {};
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || '');
  const address = String(body.address || body.location || '').trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (title.length < 5) errors.title = 'Title must be at least 5 characters.';
  if (title.length > 160) errors.title = 'Title must be 160 characters or fewer.';
  if (description.length < 10) errors.description = 'Description must be at least 10 characters.';
  if (description.length > 3000) errors.description = 'Description must be 3,000 characters or fewer.';
  if (!CATEGORIES.includes(category)) errors.category = 'Select a valid category.';
  if (address.length < 3) errors.address = 'A location description is required.';
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.lat = 'Latitude must be between -90 and 90.';
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.lng = 'Longitude must be between -180 and 180.';
  if (lat === 0 && lng === 0) errors.lat = 'A valid GPS location is required (0,0 is not accepted).';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      title, description, category, address, lat, lng,
      ward: String(body.ward || '').trim() || 'Unassigned ward',
      zone: String(body.zone || '').trim() || 'Unassigned zone',
      landmark: String(body.landmark || '').trim() || null,
      imageUrl: body.imageUrl || null,
      isAnonymous: Boolean(body.isAnonymous),
    },
  };
}

function validateImageDataUrl(dataUrl) {
  const match = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new HttpError(400, 'Upload a PNG, JPG or WEBP image.');
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > 6 * 1024 * 1024) throw new HttpError(413, 'Image must be 6 MB or smaller.');
  if (buffer.length < 100) throw new HttpError(400, 'The uploaded image is empty.');
  const ext = match[2] === 'jpeg' || match[2] === 'jpg' ? 'jpg' : match[2];
  return { buffer, ext };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    database: 'sqlite',
    aiConfigured: isAiConfigured(),
    aiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    timestamp: nowIso(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const phone = String(req.body.phone || '').trim() || null;
    const ward = String(req.body.ward || '').trim() || null;

    if (name.length < 2) throw new HttpError(400, 'Enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists.');

    const id = newId('usr');
    db.prepare(`INSERT INTO users (id, name, email, password_hash, role, phone, ward, badge, karma_points, created_at)
      VALUES (?, ?, ?, ?, 'citizen', ?, ?, 'Civic Contributor', 100, ?)`)
      .run(id, name, email, hashPassword(password), phone, ward, nowIso());

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, id, nowIso(), expires);

    res.status(201).json({ token, user: userFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  } catch (err) { next(err); }
});

app.post('/api/auth/login', (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, 'Invalid email or password.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(token, row.id, nowIso(), new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString());
    res.json({ token, user: userFromRow(row) });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', authRequired, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/logout', authRequired, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.user.token);
  res.json({ ok: true });
});

app.patch('/api/auth/profile', authRequired, (req, res, next) => {
  try {
    const name = String(req.body.name || req.user.name).trim();
    const phone = String(req.body.phone || '').trim() || null;
    const ward = String(req.body.ward || '').trim() || null;
    if (name.length < 2) throw new HttpError(400, 'Enter your full name.');
    db.prepare('UPDATE users SET name = ?, phone = ?, ward = ? WHERE id = ?').run(name, phone, ward, req.user.id);
    res.json({ user: userFromRow(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Departments
// ─────────────────────────────────────────────────────────────────────────────

function serializeDepartment(row, stats) {
  return {
    id: row.id,
    name: row.name,
    categoryCode: row.category_code,
    headName: row.head_name,
    headEmail: row.head_email,
    phone: row.phone,
    totalOfficers: row.total_officers,
    activeFieldTeams: row.active_field_teams,
    operatingZones: json(row.operating_zones, []),
    color: row.color,
    ...stats,
  };
}

function departmentStats() {
  const rows = db.prepare('SELECT * FROM complaints WHERE status NOT IN (\'rejected\')').all();
  const map = new Map();
  for (const c of rows) {
    const id = c.department_id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, { active: 0, resolved: 0, slaMet: 0, totalResolved: 0, hours: [] });
    const s = map.get(id);
    if (!['resolved', 'closed'].includes(c.status)) s.active += 1;
    if (['resolved', 'closed'].includes(c.status)) {
      s.resolved += 1;
      s.totalResolved += 1;
      if (c.closed_at) {
        const hours = (new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 3600000;
        if (Number.isFinite(hours) && hours >= 0) s.hours.push(hours);
        if (new Date(c.closed_at) <= new Date(c.target_resolution_date)) s.slaMet += 1;
      }
    }
  }
  return map;
}

app.get('/api/departments', (_req, res) => {
  const stats = departmentStats();
  const rows = db.prepare('SELECT * FROM departments ORDER BY name').all();
  res.json({
    departments: rows.map(row => {
      const s = stats.get(row.id) || { active: 0, resolved: 0, slaMet: 0, totalResolved: 0, hours: [] };
      return serializeDepartment(row, {
        activeComplaints: s.active,
        resolvedThisMonth: s.resolved,
        avgResolutionHours: s.hours.length ? Number((s.hours.reduce((a, b) => a + b, 0) / s.hours.length).toFixed(1)) : null,
        slaComplianceRate: s.totalResolved ? Number(((s.slaMet / s.totalResolved) * 100).toFixed(1)) : null,
      });
    }),
  });
});

app.patch('/api/departments/:id', roleRequired('admin'), (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
    if (!row) throw new HttpError(404, 'Department not found.');
    const name = String(req.body.name || row.name).trim();
    const headName = String(req.body.headName || row.head_name).trim();
    const headEmail = String(req.body.headEmail || row.head_email).trim();
    const phone = String(req.body.phone || row.phone).trim();
    const totalOfficers = Number(req.body.totalOfficers ?? row.total_officers);
    const activeFieldTeams = Number(req.body.activeFieldTeams ?? row.active_field_teams);
    if (!name || !headName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(headEmail)) throw new HttpError(400, 'Provide a department name, head name and valid head email.');
    if (!Number.isInteger(totalOfficers) || totalOfficers < 0 || !Number.isInteger(activeFieldTeams) || activeFieldTeams < 0) {
      throw new HttpError(400, 'Officer and team counts must be non-negative whole numbers.');
    }
    let operatingZones = json(row.operating_zones, []);
    if (req.body.operatingZones !== undefined) {
      if (!Array.isArray(req.body.operatingZones)) throw new HttpError(400, 'Operating zones must be a list of zone names.');
      operatingZones = req.body.operatingZones
        .map(zone => String(zone).trim())
        .filter(Boolean)
        .slice(0, 20);
    }
    db.prepare(`UPDATE departments SET name=?, head_name=?, head_email=?, phone=?, total_officers=?, active_field_teams=?, operating_zones=? WHERE id=?`)
      .run(name, headName, headEmail, phone, totalOfficers, activeFieldTeams, JSON.stringify(operatingZones), row.id);
    res.json({ department: serializeDepartment(db.prepare('SELECT * FROM departments WHERE id = ?').get(row.id), {}) });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Uploads
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/uploads', authRequired, (req, res, next) => {
  try {
    const { buffer, ext } = validateImageDataUrl(req.body.dataUrl);
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
    res.status(201).json({ url: `/uploads/${filename}` });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Complaints
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/complaints', authOptional, (req, res) => {
  const scope = String(req.query.scope || 'all');
  let rows;
  if (scope === 'mine') {
    if (!req.user) throw new HttpError(401, 'Sign in to view your complaints.');
    rows = db.prepare('SELECT * FROM complaints WHERE citizen_id = ? ORDER BY created_at DESC').all(req.user.id);
  } else {
    rows = db.prepare('SELECT * FROM complaints ORDER BY created_at DESC').all();
  }
  res.json({ complaints: rows.map(row => serializeComplaint(row, req.user)) });
});

app.get('/api/complaints/:id', authOptional, (req, res) => {
  const row = requireComplaint(req.params.id);
  res.json({ complaint: serializeComplaint(row, req.user) });
});

app.post('/api/complaints', authRequired, (req, res, next) => {
  try {
    const validated = validateComplaintInput(req.body);
    if (!validated.ok) {
      return res.status(422).json({ error: 'Please correct the highlighted fields.', fields: validated.errors });
    }
    const v = validated.value;
    const ticket = generateTicketNumber();
    const id = ticket;
    const createdAt = nowIso();
    const targetHours = v.category === 'electrical_hazard' ? 8 : v.category === 'waterlogging' ? 24 : 48;
    const target = new Date(Date.now() + targetHours * 3600 * 1000).toISOString();
    const citizenName = v.isAnonymous ? 'Anonymous Citizen' : (req.user.name || 'Citizen');
    const citizenEmail = v.isAnonymous ? null : req.user.email;
    const citizenPhone = v.isAnonymous ? null : req.user.phone || null;
    const departmentId = CATEGORY_TO_DEPARTMENT[v.category] || 'dept-public-works';

    db.prepare(`INSERT INTO complaints
      (id, ticket_number, title, description, category, priority, status, lat, lng, address, ward, zone, landmark,
       image_url, citizen_id, citizen_name, citizen_phone, citizen_email, is_anonymous, is_demo, department_id,
       created_at, updated_at, target_resolution_date, upvotes, ai_status)
      VALUES (?, ?, ?, ?, ?, 'medium', 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, 'not_analyzed')`)
      .run(id, ticket, v.title, v.description, v.category, v.lat, v.lng, v.address, v.ward, v.zone, v.landmark,
        v.imageUrl, req.user.id, citizenName, citizenPhone, citizenEmail, v.isAnonymous ? 1 : 0, departmentId,
        createdAt, createdAt, target);

    addTimeline(id, {
      status: 'submitted',
      title: 'Complaint registered',
      description: 'Citizen submitted a geotagged civic report.',
      actor: citizenName,
      actorRole: 'Citizen',
    });

    const row = requireComplaint(id);
    res.status(201).json({ complaint: serializeComplaint(row, req.user) });
  } catch (err) { next(err); }
});

const STATUS_TRANSITIONS = {
  submitted: ['under_review', 'assigned', 'rejected'],
  under_review: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['resolved'],
  resolved: ['closed'],
  closed: [],
  rejected: ['under_review'],
};

app.patch('/api/complaints/:id', roleRequired('authority', 'admin'), (req, res, next) => {
  try {
    const row = requireComplaint(req.params.id);
    const body = req.body || {};
    const updates = [];
    const params = [];
    const changed = [];

    let nextStatus = row.status;
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Invalid status.');
      if (body.status !== row.status && !STATUS_TRANSITIONS[row.status]?.includes(body.status)) {
        throw new HttpError(422, `A complaint cannot move directly from "${row.status}" to "${body.status}".`);
      }
      nextStatus = body.status;
    }

    if (body.status !== undefined && body.status !== row.status) {
      if (body.status === 'resolved' && !String(body.note || '').trim() && !row.resolution_image_url && !body.resolutionImageUrl) {
        throw new HttpError(422, 'A resolution note or resolution photograph is required before resolving a complaint.');
      }
      updates.push('status = ?'); params.push(body.status);
      updates.push('closed_at = ?'); params.push(['resolved', 'closed'].includes(body.status) ? nowIso() : null);
      changed.push('status');
    }

    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) throw new HttpError(400, 'Invalid priority.');
      if (body.priority !== row.priority) {
        updates.push('priority = ?'); params.push(body.priority);
        changed.push('priority');
      }
    }

    if (body.departmentId !== undefined) {
      const dept = db.prepare('SELECT 1 FROM departments WHERE id = ?').get(body.departmentId);
      if (!dept) throw new HttpError(400, 'Unknown department.');
      if (body.departmentId !== row.department_id) {
        updates.push('department_id = ?'); params.push(body.departmentId);
        changed.push('department');
      }
      if (row.status === 'submitted' || row.status === 'under_review') {
        if (body.status === undefined) {
          nextStatus = 'assigned';
          updates.push('status = ?'); params.push('assigned');
          changed.push('status');
        }
      }
    }

    if (body.assignedOfficer !== undefined) {
      const officer = String(body.assignedOfficer || '').trim().slice(0, 120) || null;
      updates.push('assigned_officer = ?'); params.push(officer);
      changed.push('officer');
    }

    if (body.resolutionNotes !== undefined) {
      updates.push('resolution_notes = ?'); params.push(String(body.resolutionNotes).slice(0, 3000));
      changed.push('resolutionNotes');
    }

    if (body.resolutionImageUrl !== undefined) {
      if (body.resolutionImageUrl && !String(body.resolutionImageUrl).startsWith('/uploads/') && !/^https?:\/\//.test(body.resolutionImageUrl)) {
        throw new HttpError(400, 'Invalid resolution photograph URL.');
      }
      updates.push('resolution_image_url = ?'); params.push(body.resolutionImageUrl || null);
      changed.push('resolutionImage');
    }

    if (body.duplicateOf !== undefined) {
      if (body.duplicateOf && !findComplaint(body.duplicateOf)) throw new HttpError(400, 'Duplicate parent complaint not found.');
      updates.push('duplicate_of = ?'); params.push(body.duplicateOf || null);
      changed.push('duplicate');
    }

    if (updates.length === 0) throw new HttpError(400, 'No supported changes were supplied.');

    updates.push('updated_at = ?'); params.push(nowIso());
    params.push(row.id);
    db.prepare(`UPDATE complaints SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    if (changed.includes('status')) {
      const statusLabel = nextStatus.replace(/_/g, ' ');
      const description = String(body.note || '').trim() || `Status updated to ${statusLabel}.`;
      addTimeline(row.id, {
        status: nextStatus,
        title: nextStatus === 'resolved' ? 'Issue resolved with evidence' : `Status: ${statusLabel}`,
        description,
        actor: req.user.name,
        actorRole: req.user.role === 'admin' ? 'Executive Authority' : 'Department Head',
        note: body.note,
        evidencePhotoUrl: body.resolutionImageUrl || null,
      });
    }
    if (changed.includes('priority')) {
      addTimeline(row.id, {
        status: nextStatus,
        title: 'Priority updated',
        description: `Priority changed from ${row.priority} to ${body.priority}.`,
        actor: req.user.name,
        actorRole: 'Department Head',
        note: body.note,
      });
    }
    if (changed.includes('department')) {
      addTimeline(row.id, {
        status: nextStatus,
        title: 'Department assigned',
        description: `Complaint assigned to ${body.departmentId}.`,
        actor: req.user.name,
        actorRole: 'Department Head',
      });
    }
    if (changed.includes('officer')) {
      addTimeline(row.id, {
        status: nextStatus,
        title: 'Responsible officer assigned',
        description: `Responsible officer set to ${body.assignedOfficer || 'unassigned'}.`,
        actor: req.user.name,
        actorRole: 'Department Head',
      });
    }

    res.json({ complaint: serializeComplaint(requireComplaint(row.id), req.user) });
  } catch (err) { next(err); }
});

app.post('/api/complaints/:id/notes', authRequired, (req, res, next) => {
  try {
    const row = requireComplaint(req.params.id);
    if (!canAccessComplaint(req.user, row)) throw new HttpError(403, 'You can only add notes to your own complaints.');
    const note = String(req.body.note || '').trim();
    if (note.length < 2) throw new HttpError(400, 'Enter a note of at least 2 characters.');
    if (note.length > 1500) throw new HttpError(400, 'Note must be 1,500 characters or fewer.');
    addTimeline(row.id, {
      status: row.status,
      title: isStaff(req.user) ? 'Official note added' : 'Citizen follow-up added',
      description: note,
      actor: req.user.name,
      actorRole: isStaff(req.user) ? 'Department Head' : 'Citizen',
      note,
    });
    res.status(201).json({ complaint: serializeComplaint(requireComplaint(row.id), req.user) });
  } catch (err) { next(err); }
});

app.post('/api/complaints/:id/vote', authRequired, (req, res, next) => {
  try {
    const row = requireComplaint(req.params.id);
    const existing = db.prepare('SELECT 1 FROM votes WHERE user_id = ? AND complaint_id = ?').get(req.user.id, row.id);
    if (existing) {
      db.prepare('DELETE FROM votes WHERE user_id = ? AND complaint_id = ?').run(req.user.id, row.id);
      db.prepare('UPDATE complaints SET upvotes = MAX(1, upvotes - 1) WHERE id = ?').run(row.id);
    } else {
      db.prepare('INSERT INTO votes (user_id, complaint_id, created_at) VALUES (?, ?, ?)').run(req.user.id, row.id, nowIso());
      db.prepare('UPDATE complaints SET upvotes = upvotes + 1 WHERE id = ?').run(row.id);
    }
    const updated = requireComplaint(row.id);
    res.json({ upvotes: updated.upvotes, voted: !existing });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────────────────────────────────────

function nearbyFor(row, limit = 10) {
  const rows = db.prepare('SELECT * FROM complaints WHERE id != ?').all(row.id);
  return rows
    .map(c => ({
      ...serializeComplaint(c, null),
      distanceMeters: Math.round(haversineMeters(
        { lat: Number(row.lat), lng: Number(row.lng) },
        { lat: Number(c.lat), lng: Number(c.lng) },
      )),
    }))
    .filter(c => c.distanceMeters <= 1000)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

app.post('/api/complaints/:id/analyze', authRequired, async (req, res, next) => {
  try {
    const row = requireComplaint(req.params.id);
    if (!canAccessComplaint(req.user, row)) throw new HttpError(403, 'You can only analyse your own complaints.');
    const complaint = serializeComplaint(row, req.user);
    const nearby = nearbyFor(row);
    const analysis = await analyzeComplaint(complaint, nearby);

    let duplicateOf = row.duplicate_of;
    if (analysis.duplicate.isDuplicate && !analysis.duplicate.requiresAdminVerification && analysis.duplicate.matchedTicketId) {
      const matched = findComplaint(analysis.duplicate.matchedTicketId);
      if (matched && matched.id !== row.id) duplicateOf = matched.id;
    }

    // Apply AI category/priority only when an administrator has not already overridden them.
    const overrides = json(row.ai_overrides_json, {});
    const nextCategory = !overrides.categoryOverride && analysis.classification.confidence >= 70
      ? analysis.classification.category
      : row.category;
    const nextPriority = overrides.priorityOverride ? row.priority : analysis.priority.urgencyLevel;
    const nextDepartment = nextCategory !== row.category
      ? (CATEGORY_TO_DEPARTMENT[nextCategory] || row.department_id)
      : row.department_id;

    db.prepare(`UPDATE complaints
      SET ai_json = ?, ai_status = ?, duplicate_of = ?, category = ?, priority = ?, department_id = ?, updated_at = ?
      WHERE id = ?`)
      .run(JSON.stringify(analysis), 'completed', duplicateOf, nextCategory, nextPriority, nextDepartment, nowIso(), row.id);

    addTimeline(row.id, {
      status: row.status,
      title: 'AI analysis completed',
      description: `Gemini classified this as ${analysis.classification.category} (${analysis.classification.confidence}% confidence), priority score ${analysis.priority.score}/100 (${analysis.priority.urgencyLevel}).`,
      actor: 'CIVICTRACK AI',
      actorRole: 'AI System',
      note: analysis.actionBrief.aiExplanation,
    });

    res.json({ complaint: serializeComplaint(requireComplaint(row.id), req.user), analysis });
  } catch (err) { next(err); }
});

app.patch('/api/complaints/:id/ai-review', roleRequired('authority', 'admin'), (req, res, next) => {
  try {
    const row = requireComplaint(req.params.id);
    if (!row.ai_json) throw new HttpError(422, 'This complaint has no AI analysis to review.');
    const analysis = json(row.ai_json, {});
    const overrides = json(row.ai_overrides_json, {});
    const body = req.body || {};
    const updates = [];
    const params = [];

    if (body.categoryOverride !== undefined) {
      if (!CATEGORIES.includes(body.categoryOverride)) throw new HttpError(400, 'Invalid category override.');
      overrides.categoryOverride = body.categoryOverride;
      updates.push('category = ?'); params.push(body.categoryOverride);
    }
    if (body.priorityOverride !== undefined) {
      if (!PRIORITIES.includes(body.priorityOverride)) throw new HttpError(400, 'Invalid priority override.');
      overrides.priorityOverride = body.priorityOverride;
      updates.push('priority = ?'); params.push(body.priorityOverride);
    }
    if (body.duplicateRejected === true) {
      overrides.duplicateRejected = true;
      updates.push('duplicate_of = ?'); params.push(null);
    }
    if (body.duplicateConfirmed === true) {
      const matchedId = body.matchedTicketId || analysis.duplicate?.matchedTicketId;
      const matched = matchedId ? findComplaint(matchedId) : null;
      if (!matched || matched.id === row.id) throw new HttpError(422, 'Confirm a valid duplicate parent before linking.');
      overrides.duplicateConfirmed = true;
      updates.push('duplicate_of = ?'); params.push(matched.id);
      if (body.merge === true) {
        updates.push('status = ?'); params.push('rejected');
        updates.push('closed_at = ?'); params.push(nowIso());
      }
    }

    overrides.overriddenBy = req.user.name;
    overrides.overriddenAt = nowIso();

    if (updates.length === 0) throw new HttpError(400, 'No AI review decision was supplied.');
    updates.push('ai_overrides_json = ?'); params.push(JSON.stringify(overrides));
    updates.push('updated_at = ?'); params.push(nowIso());
    params.push(row.id);
    db.prepare(`UPDATE complaints SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    addTimeline(row.id, {
      status: body.merge === true ? 'rejected' : row.status,
      title: 'Administrator reviewed AI decision',
      description: [
        overrides.categoryOverride ? `Category overridden to ${overrides.categoryOverride}.` : '',
        overrides.priorityOverride ? `Priority overridden to ${overrides.priorityOverride}.` : '',
        overrides.duplicateConfirmed ? 'Duplicate match confirmed.' : '',
        overrides.duplicateRejected ? 'Duplicate match rejected.' : '',
      ].filter(Boolean).join(' ') || 'AI decision reviewed.',
      actor: req.user.name,
      actorRole: req.user.role === 'admin' ? 'Executive Authority' : 'Department Head',
      note: body.note,
    });

    res.json({ complaint: serializeComplaint(requireComplaint(row.id), req.user), overrides });
  } catch (err) { next(err); }
});

app.post('/api/ai/analyze-preview', authRequired, async (req, res, next) => {
  try {
    const raw = req.body.complaint || req.body;
    const lat = Number(raw.location?.lat ?? raw.lat);
    const lng = Number(raw.location?.lng ?? raw.lng);
    const draft = {
      id: 'draft',
      title: String(raw.title || '').trim(),
      description: String(raw.description || '').trim(),
      category: CATEGORIES.includes(raw.category) ? raw.category : 'other',
      location: {
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        address: String(raw.location?.address || raw.address || ''),
        ward: String(raw.location?.ward || ''),
        zone: String(raw.location?.zone || ''),
      },
      createdAt: nowIso(),
    };
    if (draft.title.length < 5 || draft.description.length < 10) {
      throw new HttpError(422, 'Provide a title and description before running AI analysis.');
    }
    const all = db.prepare('SELECT * FROM complaints').all();
    const nearby = Number.isFinite(lat) && Number.isFinite(lng)
      ? all.map(c => ({
        ...serializeComplaint(c, null),
        distanceMeters: Math.round(haversineMeters({ lat, lng }, { lat: Number(c.lat), lng: Number(c.lng) })),
      })).filter(c => c.distanceMeters <= 1000).sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 8)
      : [];
    const analysis = await analyzeComplaint(draft, nearby);
    res.json({ analysis });
  } catch (err) { next(err); }
});

app.post('/api/ai/classify', authRequired, async (req, res, next) => {
  try {
    res.json(await classifyComplaint(req.body.title, req.body.description));
  } catch (err) { next(err); }
});

app.post('/api/ai/summarize', authRequired, async (req, res, next) => {
  try {
    if (!String(req.body.description || '').trim()) throw new HttpError(400, 'Description is required.');
    res.json(await summarizeComplaint(req.body.description));
  } catch (err) { next(err); }
});

app.post('/api/ai/action-brief', authRequired, async (req, res, next) => {
  try {
    if (!req.body.complaint) throw new HttpError(400, 'Complaint data is required.');
    res.json(await generateActionBrief(req.body.complaint));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Stats, hotspots, analytics
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/stats', authOptional, (req, res) => {
  const rows = db.prepare('SELECT * FROM complaints').all();
  const visible = rows.filter(c => req.user ? (isStaff(req.user) || c.citizen_id === req.user.id) : true);
  const total = visible.length;
  const resolved = visible.filter(c => ['resolved', 'closed'].includes(c.status)).length;
  const pending = visible.filter(c => ['submitted', 'under_review'].includes(c.status)).length;
  const inProgress = visible.filter(c => ['assigned', 'in_progress'].includes(c.status)).length;
  const critical = visible.filter(c => c.priority === 'critical' && !['resolved', 'closed', 'rejected'].includes(c.status)).length;
  const overdue = visible.filter(c => !['resolved', 'closed', 'rejected'].includes(c.status) && new Date(c.target_resolution_date) < new Date()).length;
  const resolutionHours = visible
    .filter(c => ['resolved', 'closed'].includes(c.status) && c.closed_at)
    .map(c => (new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 3600000)
    .filter(h => Number.isFinite(h) && h >= 0);

  const byStatus = {};
  const byCategory = {};
  const byPriority = {};
  for (const c of visible) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    byPriority[c.priority] = (byPriority[c.priority] || 0) + 1;
  }

  res.json({
    total,
    resolved,
    pending,
    inProgress,
    critical,
    overdue,
    underReview: visible.filter(c => c.status === 'under_review').length,
    submitted: visible.filter(c => c.status === 'submitted').length,
    resolvedRate: total ? Number(((resolved / total) * 100).toFixed(1)) : 0,
    avgResolutionHours: resolutionHours.length ? Number((resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length).toFixed(1)) : null,
    duplicates: visible.filter(c => c.duplicate_of).length,
    aiAnalyzed: visible.filter(c => c.ai_status === 'completed').length,
    byStatus,
    byCategory,
    byPriority,
    demoData: total > 0 && visible.every(c => Boolean(c.is_demo)),
  });
});

app.get('/api/hotspots', (req, res) => {
  const epsMeters = Math.min(2000, Math.max(100, Number(req.query.eps) || 400));
  const minPts = Math.min(10, Math.max(2, Number(req.query.minPts) || 3));
  const rawDays = Number(req.query.days);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(365, Math.round(rawDays)) : null;
  const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

  const rows = db.prepare('SELECT * FROM complaints').all()
    .filter(row => !cutoff || Date.parse(row.created_at) >= cutoff);
  const complaints = rows.map(row => serializeComplaint(row, null));
  const hotspots = buildHotspots(complaints, { epsMeters, minPts });
  res.json({
    hotspots,
    params: { epsMeters, minPts },
    filters: { days },
    generatedAt: nowIso(),
  });
});

app.get('/api/analytics', (req, res) => {
  const rows = db.prepare('SELECT * FROM complaints').all();
  const complaints = rows.map(row => serializeComplaint(row, null));

  const months = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const monthRows = complaints.filter(c => c.createdAt.slice(0, 7) === key);
    months.push({
      month: label,
      key,
      received: monthRows.length,
      resolved: monthRows.filter(c => ['resolved', 'closed'].includes(c.status) && c.closedAt?.slice(0, 7) === key).length,
      duplicates: monthRows.filter(c => c.duplicateOf).length,
    });
  }

  const categories = Object.entries(
    complaints.reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    }, {}),
  ).map(([category, count]) => ({
    category,
    label: CATEGORY_LABELS[category] || category,
    count,
    percentage: complaints.length ? Number(((count / complaints.length) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.count - a.count);

  const wards = Object.entries(
    complaints.reduce((acc, c) => {
      const key = c.location.ward || 'Unassigned';
      if (!acc[key]) acc[key] = { ward: key, complaints: 0, resolved: 0, hours: [] };
      acc[key].complaints += 1;
      if (['resolved', 'closed'].includes(c.status)) {
        acc[key].resolved += 1;
        if (c.closedAt) acc[key].hours.push((new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime()) / 3600000);
      }
      return acc;
    }, {}),
  ).map(([, v]) => ({
    ward: v.ward,
    complaints: v.complaints,
    resolvedPercent: v.complaints ? Number(((v.resolved / v.complaints) * 100).toFixed(1)) : 0,
    avgHours: v.hours.length ? Number((v.hours.reduce((a, b) => a + b, 0) / v.hours.length).toFixed(1)) : null,
  })).sort((a, b) => b.complaints - a.complaints);

  const deptStats = departmentStats();
  const departments = db.prepare('SELECT * FROM departments').all().map(d => {
    const s = deptStats.get(d.id) || { active: 0, resolved: 0, slaMet: 0, totalResolved: 0, hours: [] };
    return {
      id: d.id,
      name: d.name,
      activeComplaints: s.active,
      resolvedThisMonth: s.resolved,
      avgResolutionHours: s.hours.length ? Number((s.hours.reduce((a, b) => a + b, 0) / s.hours.length).toFixed(1)) : null,
      slaComplianceRate: s.totalResolved ? Number(((s.slaMet / s.totalResolved) * 100).toFixed(1)) : null,
    };
  });

  const now = Date.now();
  const overdue = complaints.filter(c => !['resolved', 'closed', 'rejected'].includes(c.status) && new Date(c.targetResolutionDate).getTime() < now).length;
  const resolvedRows = complaints.filter(c => ['resolved', 'closed'].includes(c.status));
  const resolutionHours = resolvedRows.filter(c => c.closedAt).map(c => (new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime()) / 3600000).filter(h => h >= 0);

  res.json({
    kpis: {
      totalComplaints: complaints.length,
      resolvedRate: complaints.length ? Number(((resolvedRows.length / complaints.length) * 100).toFixed(1)) : 0,
      avgResolutionHours: resolutionHours.length ? Number((resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length).toFixed(1)) : null,
      activeCritical: complaints.filter(c => c.priority === 'critical' && !['resolved', 'closed', 'rejected'].includes(c.status)).length,
      duplicateLinks: complaints.filter(c => c.duplicateOf).length,
      aiAnalyzed: complaints.filter(c => c.aiStatus === 'completed').length,
      overdue,
      aiConfigured: isAiConfigured(),
      aiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    },
    months,
    categories,
    wards,
    departments,
    recent: complaints.slice(0, 8),
    demoData: complaints.length > 0 && complaints.every(c => c.isDemo),
    generatedAt: nowIso(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static production build + errors
// ─────────────────────────────────────────────────────────────────────────────

const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.path}` }));

app.use((err, _req, res, _next) => {
  if (err instanceof AIConfigError) {
    return res.status(503).json({ error: err.message, code: 'AI_NOT_CONFIGURED' });
  }
  if (err instanceof AIRequestError) {
    console.error('[AI]', err.message);
    return res.status(502).json({ error: err.message, code: 'AI_REQUEST_FAILED' });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, fields: err.fields });
  }
  console.error('[server]', err);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`CIVICTRACK AI API listening on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`Gemini: ${isAiConfigured() ? 'configured' : 'NOT configured (AI endpoints return 503)'}`);
});
