import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'civictrack.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('citizen','authority','admin')),
    phone TEXT,
    ward TEXT,
    badge TEXT,
    department_id TEXT,
    karma_points INTEGER NOT NULL DEFAULT 0,
    avatar_url TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_code TEXT NOT NULL,
    head_name TEXT NOT NULL,
    head_email TEXT NOT NULL,
    phone TEXT NOT NULL,
    total_officers INTEGER NOT NULL DEFAULT 0,
    active_field_teams INTEGER NOT NULL DEFAULT 0,
    operating_zones TEXT NOT NULL DEFAULT '[]',
    color TEXT NOT NULL DEFAULT '#2563eb'
  );

  CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    ticket_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
    status TEXT NOT NULL CHECK (status IN ('submitted','under_review','assigned','in_progress','resolved','closed','rejected')),
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    address TEXT NOT NULL,
    ward TEXT NOT NULL DEFAULT '',
    zone TEXT NOT NULL DEFAULT '',
    landmark TEXT,
    image_url TEXT,
    resolution_image_url TEXT,
    resolution_notes TEXT,
    citizen_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    citizen_name TEXT NOT NULL,
    citizen_phone TEXT,
    citizen_email TEXT,
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    department_id TEXT REFERENCES departments(id),
    assigned_officer TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    target_resolution_date TEXT NOT NULL,
    closed_at TEXT,
    upvotes INTEGER NOT NULL DEFAULT 1,
    ai_json TEXT,
    ai_status TEXT NOT NULL DEFAULT 'not_analyzed'
      CHECK (ai_status IN ('not_analyzed','completed','failed')),
    ai_overrides_json TEXT,
    duplicate_of TEXT
  );

  CREATE TABLE IF NOT EXISTS timeline (
    id TEXT PRIMARY KEY,
    complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    note TEXT,
    evidence_photo_url TEXT
  );

  CREATE TABLE IF NOT EXISTS votes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    complaint_id TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, complaint_id)
  );

  CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
  CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
  CREATE INDEX IF NOT EXISTS idx_timeline_complaint ON timeline(complaint_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function json(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const DEPARTMENTS = [
  { id: 'dept-roads', name: 'Road Maintenance', categoryCode: 'road_damage', headName: 'Er. Anil Deshmukh', headEmail: 'roads@civictrack.gov', phone: '+91 20 2554 1011', officers: 46, teams: 9, zones: ['Central Zone', 'North Zone', 'South Zone'], color: '#2563eb' },
  { id: 'dept-drainage', name: 'Drainage Department', categoryCode: 'drainage_blockage', headName: 'Dr. Sunita Rao', headEmail: 'drainage@civictrack.gov', phone: '+91 20 2554 1022', officers: 38, teams: 8, zones: ['Central Zone', 'East Zone', 'West Zone'], color: '#0284c7' },
  { id: 'dept-waste', name: 'Waste Management', categoryCode: 'garbage_overflow', headName: 'Mr. Rajesh Kadam', headEmail: 'waste@civictrack.gov', phone: '+91 20 2554 1033', officers: 64, teams: 14, zones: ['All Wards'], color: '#059669' },
  { id: 'dept-electrical', name: 'Electrical Department', categoryCode: 'electrical_hazard', headName: 'Er. Meera Iyer', headEmail: 'electrical@civictrack.gov', phone: '+91 20 2554 1044', officers: 29, teams: 6, zones: ['Central Zone', 'North Zone', 'East Zone', 'West Zone'], color: '#d97706' },
  { id: 'dept-public-works', name: 'Public Works Department', categoryCode: 'other', headName: 'Er. Vikram Malhotra', headEmail: 'publicworks@civictrack.gov', phone: '+91 20 2554 1055', officers: 52, teams: 11, zones: ['All Wards'], color: '#7c3aed' }
];

const DEMO_USERS = [
  {
    id: 'usr-demo-citizen',
    name: 'Rakesh Sharma',
    email: 'citizen@demo.civictrack',
    password: 'Citizen@123',
    role: 'citizen',
    phone: '+91 98221 44021',
    ward: 'Ward 3 - Shivaji Central',
    badge: 'Civic Guardian',
    karma: 340,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
  },
  {
    id: 'usr-demo-authority',
    name: 'Er. Vikram Malhotra',
    email: 'authority@demo.civictrack',
    password: 'Authority@123',
    role: 'authority',
    phone: '+91 20 2554 1011',
    ward: 'All Metropolitan Zones',
    badge: 'Superintendent City Engineer',
    departmentId: 'dept-roads',
    karma: 0,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'
  },
  {
    id: 'usr-demo-admin',
    name: 'Municipal Commissioner',
    email: 'admin@demo.civictrack',
    password: 'Admin@123',
    role: 'admin',
    phone: '+91 20 2554 1000',
    ward: 'All Metropolitan Zones',
    badge: 'Commissioner',
    departmentId: 'dept-public-works',
    karma: 0,
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80'
  }
];

const DEMO_COMPLAINTS = [
  {
    ticket: 'CT-2026-881', title: 'Deep pothole near Metro Station Gate 3',
    description: 'A two-foot wide and eight-inch deep crater has formed at the bus stop exit. Two two-wheelers skidded during evening rain. Urgent hot-mix asphalt patching is required.',
    category: 'pothole', priority: 'critical', status: 'in_progress', lat: 18.5204, lng: 73.8567,
    address: 'Central Avenue, opposite Metro Pillar 142', ward: 'Ward 3 - Shivaji Central', zone: 'Central Zone', landmark: 'Near Metro Gate 3 bus shelter',
    image: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=900&q=80',
    citizen: 'Rakesh Sharma', email: 'citizen@demo.civictrack', phone: '+91 98221 44021', citizenId: 'usr-demo-citizen',
    dept: 'dept-roads', officer: 'Roads Rapid Response Crew 4', upvotes: 42,
    createdAt: '2026-10-26T09:15:00.000Z', updatedAt: '2026-10-30T08:30:00.000Z'
  },
  {
    ticket: 'CT-2026-892', title: 'Storm drain blockage causing knee-deep waterlogging',
    description: 'The stormwater main drain on 5th Cross Road is choked with plastic silt and construction debris. Rainwater has nowhere to drain and is flooding shopfronts.',
    category: 'waterlogging', priority: 'high', status: 'assigned', lat: 18.5284, lng: 73.8451,
    address: '5th Cross Commercial Market, Model Colony', ward: 'Ward 4 - Model Colony', zone: 'Central Zone', landmark: 'Behind Saraswat Co-op Bank',
    image: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80',
    citizen: 'Priya Nambiar', email: 'priya.n@example.com', phone: '+91 97654 32189', citizenId: 'usr-demo-citizen',
    dept: 'dept-drainage', officer: 'Drainage Crew B', upvotes: 31,
    createdAt: '2026-10-29T11:20:00.000Z', updatedAt: '2026-10-29T14:00:00.000Z'
  },
  {
    ticket: 'CT-2026-903', title: 'Blocked storm drain on Sahakar Road',
    description: 'The roadside drain is completely blocked with silt and leaves. Water is standing on the pedestrian crossing and entering ground-floor homes.',
    category: 'drainage_blockage', priority: 'high', status: 'under_review', lat: 18.5089, lng: 73.8260,
    address: 'Sahakar Road, near Shivaji Nagar market', ward: 'Ward 3 - Shivaji Central', zone: 'Central Zone', landmark: 'Opposite Sahakar Bank',
    image: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80',
    citizen: 'Rakesh Sharma', email: 'citizen@demo.civictrack', phone: '+91 98221 44021', citizenId: 'usr-demo-citizen',
    dept: 'dept-drainage', officer: null, upvotes: 17,
    createdAt: '2026-10-28T07:10:00.000Z', updatedAt: '2026-10-28T09:00:00.000Z'
  },
  {
    ticket: 'CT-2026-904', title: 'Water entering shops after drain overflow',
    description: 'After last night rain the entire lane is under eight inches of water. The same spot floods every monsoon and the drain cannot carry the flow.',
    category: 'waterlogging', priority: 'critical', status: 'submitted', lat: 18.5093, lng: 73.8265,
    address: 'Laxmi Lane, Shivaji Nagar', ward: 'Ward 3 - Shivaji Central', zone: 'Central Zone', landmark: 'Near Ganesh Temple',
    image: null,
    citizen: 'Anita Kulkarni', email: 'anita.k@example.com', phone: '+91 98230 11122', citizenId: 'usr-demo-citizen',
    dept: 'dept-drainage', officer: null, upvotes: 23,
    createdAt: '2026-10-29T06:40:00.000Z', updatedAt: '2026-10-29T06:40:00.000Z'
  },
  {
    ticket: 'CT-2026-905', title: 'Overflowing storm drain beside school',
    description: 'Drain water is overflowing onto the road outside the primary school. Children have to walk through contaminated water during dismissal.',
    category: 'drainage_blockage', priority: 'high', status: 'submitted', lat: 18.5085, lng: 73.8256,
    address: 'School Lane, Shivaji Nagar', ward: 'Ward 3 - Shivaji Central', zone: 'Central Zone', landmark: 'Beside Municipal Primary School',
    image: 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80',
    citizen: 'Rakesh Sharma', email: 'citizen@demo.civictrack', phone: '+91 98221 44021', citizenId: 'usr-demo-citizen',
    dept: 'dept-drainage', officer: null, upvotes: 14,
    createdAt: '2026-10-27T15:20:00.000Z', updatedAt: '2026-10-27T15:20:00.000Z'
  },
  {
    ticket: 'CT-2026-906', title: 'Garbage bins overflowing near community hall',
    description: 'Three municipal bins have not been cleared for four days. Waste is spilling onto the footpath and stray dogs are scattering it.',
    category: 'garbage_overflow', priority: 'medium', status: 'resolved', lat: 18.5100, lng: 73.8270,
    address: 'Community Hall Road, Shivaji Nagar', ward: 'Ward 3 - Shivaji Central', zone: 'Central Zone', landmark: 'Community hall rear gate',
    image: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=900&q=80',
    citizen: 'Rakesh Sharma', email: 'citizen@demo.civictrack', phone: '+91 98221 44021', citizenId: 'usr-demo-citizen',
    dept: 'dept-waste', officer: 'Waste Team 7', upvotes: 9,
    createdAt: '2026-10-22T08:00:00.000Z', updatedAt: '2026-10-24T12:30:00.000Z',
    resolutionNotes: 'Bins cleared and the collection schedule changed to daily for this street.',
    resolutionImage: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=900&q=80'
  },
  {
    ticket: 'CT-2026-907', title: 'Streetlight out on Central Avenue stretch',
    description: 'Four consecutive streetlights are dark between the metro pillar and the bus depot. The stretch is unsafe for pedestrians after 7 pm.',
    category: 'broken_streetlight', priority: 'medium', status: 'assigned', lat: 18.5208, lng: 73.8570,
    address: 'Central Avenue, between Metro Pillar 140 and bus depot', ward: 'Ward 3 - Shivaji Central', zone: 'Central Zone', landmark: 'Near bus depot gate',
    image: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80',
    citizen: 'Rakesh Sharma', email: 'citizen@demo.civictrack', phone: '+91 98221 44021', citizenId: 'usr-demo-citizen',
    dept: 'dept-electrical', officer: 'Electrical Maintenance Team 2', upvotes: 12,
    createdAt: '2026-10-27T19:30:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z'
  },
  {
    ticket: 'CT-2026-908', title: 'Broken kerb and road edge near junction',
    description: 'The kerb has collapsed into the carriageway after a water main repair. The exposed edge is a hazard for cyclists turning at the junction.',
    category: 'road_damage', priority: 'high', status: 'resolved', lat: 18.5210, lng: 73.8564,
    address: 'Central Avenue junction, opposite Metro Pillar 138', ward: 'Ward 3 - Shivaji Central', zone: 'Central Zone', landmark: 'At the traffic signal',
    image: null,
    citizen: 'Rakesh Sharma', email: 'citizen@demo.civictrack', phone: '+91 98221 44021', citizenId: 'usr-demo-citizen',
    dept: 'dept-roads', officer: 'Roads Crew 2', upvotes: 6,
    createdAt: '2026-10-20T13:15:00.000Z', updatedAt: '2026-10-23T16:45:00.000Z',
    resolutionNotes: 'Kerb rebuilt and the road edge compacted. Site cleared and rechecked by the ward engineer.',
    resolutionImage: null
  },
  {
    ticket: 'CT-2026-909', title: 'Exposed live wire hanging over footpath',
    description: 'A snapped overhead cable is hanging at head height over the footpath outside the market. Sparks were visible during the last rain. The area is busy with pedestrians.',
    category: 'electrical_hazard', priority: 'critical', status: 'submitted', lat: 18.5404, lng: 73.8767,
    address: 'Market Road, Aundh', ward: 'Ward 8 - Aundh North', zone: 'North Zone', landmark: 'Outside vegetable market',
    image: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=900&q=80',
    citizen: 'Rakesh Sharma', email: 'citizen@demo.civictrack', phone: '+91 98221 44021', citizenId: 'usr-demo-citizen',
    dept: 'dept-electrical', officer: null, upvotes: 38,
    createdAt: '2026-10-30T05:50:00.000Z', updatedAt: '2026-10-30T05:50:00.000Z'
  },
  {
    ticket: 'CT-2026-910', title: 'Garbage dumped on vacant plot',
    description: 'Construction debris and household waste have been dumped on the vacant plot beside the park. The pile is attracting mosquitoes and rodents.',
    category: 'garbage_overflow', priority: 'low', status: 'resolved', lat: 18.5344, lng: 73.8637,
    address: 'Park Lane, Deccan', ward: 'Ward 6 - Deccan', zone: 'West Zone', landmark: 'Beside Deccan Park',
    image: null,
    citizen: 'Rakesh Sharma', email: 'citizen@demo.civictrack', phone: '+91 98221 44021', citizenId: 'usr-demo-citizen',
    dept: 'dept-waste', officer: 'Waste Team 3', upvotes: 4,
    createdAt: '2026-10-18T10:00:00.000Z', updatedAt: '2026-10-21T09:30:00.000Z',
    resolutionNotes: 'Plot cleared and a no-dumping notice installed.',
    resolutionImage: null
  }
];

function insertTimeline(complaintId, events) {
  const stmt = db.prepare(`INSERT INTO timeline
    (id, complaint_id, status, title, description, timestamp, actor, actor_role, note, evidence_photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const e of events) {
    stmt.run(newId('tl'), complaintId, e.status, e.title, e.description, e.timestamp, e.actor, e.actorRole, e.note || null, e.evidence || null);
  }
}

export function seedDatabase() {
  const deptCount = db.prepare('SELECT COUNT(*) AS count FROM departments').get().count;
  if (deptCount === 0) {
    const stmt = db.prepare(`INSERT INTO departments
      (id, name, category_code, head_name, head_email, phone, total_officers, active_field_teams, operating_zones, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const d of DEPARTMENTS) {
      stmt.run(d.id, d.name, d.categoryCode, d.headName, d.headEmail, d.phone, d.officers, d.teams, JSON.stringify(d.zones), d.color);
    }
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const stmt = db.prepare(`INSERT INTO users
      (id, name, email, password_hash, role, phone, ward, badge, department_id, karma_points, avatar_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const u of DEMO_USERS) {
      stmt.run(u.id, u.name, u.email, hashPassword(u.password), u.role, u.phone || null, u.ward || null, u.badge || null, u.departmentId || null, u.karma, u.avatar || null, nowIso());
    }
  }

  const complaintCount = db.prepare('SELECT COUNT(*) AS count FROM complaints').get().count;
  if (complaintCount === 0) {
    const stmt = db.prepare(`INSERT INTO complaints
      (id, ticket_number, title, description, category, priority, status, lat, lng, address, ward, zone, landmark,
       image_url, resolution_image_url, resolution_notes, citizen_id, citizen_name, citizen_phone, citizen_email,
       is_anonymous, is_demo, department_id, assigned_officer, created_at, updated_at, target_resolution_date, closed_at,
       upvotes, ai_json, ai_status, ai_overrides_json, duplicate_of)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'not_analyzed', NULL, NULL)`);

    for (const c of DEMO_COMPLAINTS) {
      const target = new Date(new Date(c.createdAt).getTime() + 48 * 3600 * 1000).toISOString();
      stmt.run(
        c.ticket, c.ticket, c.title, c.description, c.category, c.priority, c.status,
        c.lat, c.lng, c.address, c.ward, c.zone, c.landmark || null,
        c.image || null, c.resolutionImage || null, c.resolutionNotes || null,
        c.citizenId || null, c.citizen, c.phone || null, c.email || null,
        0, 1, c.dept || null, c.officer || null,
        c.createdAt, c.updatedAt, target, c.status === 'resolved' ? c.updatedAt : null,
        c.upvotes || 1
      );

      const events = [
        { status: 'submitted', title: 'Complaint registered', description: 'Citizen submitted a geotagged civic report.', timestamp: c.createdAt, actor: c.citizen, actorRole: 'Citizen' },
        { status: 'under_review', title: 'Complaint under municipal review', description: 'Report queued for triage and field verification.', timestamp: new Date(new Date(c.createdAt).getTime() + 45 * 60000).toISOString(), actor: 'Municipal intake', actorRole: 'Department Head' }
      ];
      if (['assigned', 'in_progress', 'resolved'].includes(c.status)) {
        events.push({ status: 'assigned', title: 'Assigned to department', description: `Work order routed to ${c.dept}.`, timestamp: new Date(new Date(c.createdAt).getTime() + 2 * 3600000).toISOString(), actor: 'Municipal dispatch', actorRole: 'Department Head' });
      }
      if (['in_progress', 'resolved'].includes(c.status)) {
        events.push({ status: 'in_progress', title: 'Field work started', description: 'Field team mobilised to the reported location.', timestamp: new Date(new Date(c.createdAt).getTime() + 6 * 3600000).toISOString(), actor: c.officer || 'Field team', actorRole: 'Field Officer' });
      }
      if (c.status === 'resolved') {
        events.push({ status: 'resolved', title: 'Issue resolved', description: c.resolutionNotes || 'Work completed and verified by the department.', timestamp: c.updatedAt, actor: c.officer || 'Field team', actorRole: 'Field Officer', evidence: c.resolutionImage || null });
      }
      insertTimeline(c.ticket, events);
    }
  }
}

seedDatabase();
