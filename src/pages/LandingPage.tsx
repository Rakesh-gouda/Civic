import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  MapPin,
  Camera,
  Cpu,
  Crosshair,
  Flame,
  Gauge,
  CheckCircle2,
  ShieldCheck,
  Search,
  ClipboardList,
  Map,
  Users,
  Building2,
  FileText,
  AlertTriangle,
  BarChart3,
  Compass,
  Layers,
} from 'lucide-react';
import { InteractiveMap } from '../components/map/InteractiveMap';
import { useComplaints } from '../context/ComplaintContext';
import { useAuth } from '../context/AuthContext';

const features = [
  {
    icon: Camera,
    title: 'Smart Complaint Reporting',
    description:
      'Citizens submit a title, description, category, photo and precise location through a guided form that validates every required field.',
  },
  {
    icon: Cpu,
    title: 'AI-Powered Issue Detection',
    description:
      'When a Gemini key is configured, the backend classifies complaints, writes a short summary, checks for duplicates and explains its reasoning.',
  },
  {
    icon: Crosshair,
    title: 'GPS-Based Location Tracking',
    description:
      'Use the browser Geolocation API to place a marker, or drag the marker and click the map to correct an inaccurate position. Coordinates are stored with the complaint.',
  },
  {
    icon: Flame,
    title: 'Geographic Hotspot Detection',
    description:
      'DBSCAN groups complaints that are close together, calculates the dominant categories and average priority, and suggests an inspection action.',
  },
  {
    icon: Gauge,
    title: 'Intelligent Priority Assignment',
    description:
      'AI analyses safety severity, people affected, urgency and duration to produce a 0–100 priority score with visible reasons. Authorities can override it.',
  },
  {
    icon: CheckCircle2,
    title: 'Transparent Complaint Resolution',
    description:
      'Every status change is stored in a timeline. Citizens can follow assignment, field work, resolution notes and evidence photographs.',
  },
];

const steps = [
  {
    title: 'Report a civic problem',
    description: 'Add a description, category, photograph and GPS location.',
    icon: FileText,
  },
  {
    title: 'AI analyses the complaint',
    description: 'The server asks Gemini for classification, summary, duplicates and priority reasons.',
    icon: Cpu,
  },
  {
    title: 'Location appears on the map',
    description: 'The saved coordinates are plotted with colour-coded priority markers and hotspots.',
    icon: MapPin,
  },
  {
    title: 'Authorities review and assign',
    description: 'Staff review evidence and AI output, choose a department, add an officer and update the workflow.',
    icon: ShieldCheck,
  },
  {
    title: 'Citizens track resolution',
    description: 'The tracking page shows the department, status timeline, notes and resolution evidence.',
    icon: Search,
  },
];

export const LandingPage: React.FC = () => {
  const { complaints, hotspots, stats, loading, error } = useComplaints();
  const { user } = useAuth();

  const total = stats?.total ?? complaints.length;
  const resolved = stats?.resolved ?? complaints.filter(c => c.status === 'resolved').length;
  const resolvedRate = stats?.resolvedRate;
  const avgHours = stats?.avgResolutionHours;
  const demo = stats?.demoData ?? true;
  const mapComplaints = complaints.slice(0, 40);

  const statCards = [
    {
      label: 'Complaints stored',
      value: loading ? '…' : String(total),
      note: 'Rows in the local SQLite database',
    },
    {
      label: 'Resolved',
      value: loading ? '…' : String(resolved),
      note: resolvedRate !== undefined ? `${resolvedRate}% resolution rate` : 'Updated from the database',
    },
    {
      label: 'DBSCAN hotspots',
      value: loading ? '…' : String(hotspots.length),
      note: 'Groups of 3+ nearby active complaints',
    },
    {
      label: 'Average resolution',
      value: avgHours === null || avgHours === undefined ? '—' : `${avgHours} h`,
      note: 'Measured where resolution timestamps exist',
    },
  ];

  return (
    <div className="bg-white">
      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-7">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-blue-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                AI-powered geospatial civic intelligence
              </span>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-tight">
                Turning Citizen Complaints Into Intelligent Civic Action.
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                Report civic issues, discover problem hotspots and track resolutions through one intelligent platform.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/submit"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-900/30 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  Report an Issue
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/map"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-sm transition-colors"
                >
                  <Map className="w-4 h-4" />
                  Explore Complaint Map
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Leaflet + OpenStreetMap
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Gemini analysis on the server
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  SQLite persistence
                </span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-3 shadow-2xl">
                <div className="rounded-2xl overflow-hidden border border-white/10">
                  {loading ? (
                    <div className="h-[380px] flex items-center justify-center text-sm text-slate-300 bg-slate-800">
                      Loading complaints from the database…
                    </div>
                  ) : mapComplaints.length > 0 ? (
                    <InteractiveMap
                      complaints={mapComplaints}
                      hotspots={hotspots}
                      heightClass="h-[380px]"
                      enableControls={false}
                      showHotspotsToggle={false}
                      initialZoom={12}
                    />
                  ) : (
                    <div className="h-[380px] flex flex-col items-center justify-center gap-2 text-sm text-slate-300 bg-slate-800 px-6 text-center">
                      <MapPin className="w-8 h-8 text-slate-500" />
                      No complaints have been stored yet. Submit one to see it plotted here.
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-[11px] text-slate-400">
                  <span>Actual stored complaint coordinates · colour-coded priority</span>
                  <span className="font-semibold text-slate-300">{mapComplaints.length} plotted</span>
                </div>
              </div>
              {error && (
                <p className="mt-3 text-xs text-amber-300">
                  {error} Start the API with <code className="font-mono">npm run server</code>.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATISTICS ─────────────────────────────────────────────────────── */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Platform statistics</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                These figures are calculated from the local database, not marketing claims.
              </p>
            </div>
            {demo && (
              <span className="inline-flex items-center gap-1.5 self-start sm:self-auto px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5" />
                Seeded demonstration data
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(card => (
              <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
                <p className="text-3xl font-black text-slate-900 mt-2 tabular-nums">{card.value}</p>
                <p className="text-[11px] text-slate-500 mt-1">{card.note}</p>
              </div>
            ))}
          </div>

          {demo && (
            <p className="mt-4 text-[11px] text-slate-500">
              The database ships with seeded demonstration complaints and accounts. Delete{' '}
              <code className="font-mono text-slate-700">server/data/civictrack.db</code> and restart the server to start empty.
            </p>
          )}
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Capabilities</p>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            One platform for reporting, triage and resolution
          </h2>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            CIVICTRACK AI connects the citizen report, the AI analysis, the geospatial picture and the municipal
            workflow. Each capability below maps to a working page in this application.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {features.map(feature => (
            <div key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mt-4">{feature.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed mt-2">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">How it works</p>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
              From report to verified resolution
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-10">
            {steps.map((step, index) => (
              <div key={step.title} className="bg-white rounded-2xl border border-slate-200 p-5 relative">
                <span className="text-[11px] font-black text-slate-300">STEP {index + 1}</span>
                <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center mt-2">
                  <step.icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-3 leading-snug">{step.title}</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOTSPOT / MAP PREVIEW ──────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 space-y-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Geospatial intelligence</p>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              See where problems repeat
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Complaints are clustered with DBSCAN using their stored latitude and longitude. A hotspot shows the
              complaint count, dominant categories, average priority and a suggested inspection action. Clusters are
              drawn as visible boundaries on the map.
            </p>

            <div className="space-y-3">
              {hotspots.length > 0 ? (
                hotspots.slice(0, 2).map(hotspot => (
                  <div key={hotspot.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">{hotspot.name}</span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                        {hotspot.severityRisk}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5">
                      {hotspot.activeComplaintCount} active complaints
                      {hotspot.avgPriority ? ` · avg priority ${hotspot.avgPriority}` : ''}
                      {hotspot.avgPriorityScore !== undefined ? ` (${hotspot.avgPriorityScore}/100)` : ''}
                    </p>
                    {hotspot.dominantCategories && hotspot.dominantCategories.length > 0 && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Dominant:{' '}
                        {hotspot.dominantCategories
                          .slice(0, 3)
                          .map(category => `${category.count} ${category.label.toLowerCase()}`)
                          .join(', ')}
                      </p>
                    )}
                    {hotspot.suggestedInspectionAction && (
                      <p className="text-[11px] text-slate-500 mt-2 border-t border-slate-100 pt-2">
                        <strong className="text-slate-700">Suggested action:</strong> {hotspot.suggestedInspectionAction}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
                  No hotspot currently meets the clustering threshold (3 active complaints within 400 m).
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/map"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                <Compass className="w-4 h-4" />
                Open the interactive map
              </Link>
              {user && (
                <Link
                  to="/analytics"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold"
                >
                  <BarChart3 className="w-4 h-4" />
                  Authority analytics
                </Link>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-slate-200 p-3 bg-slate-50">
              {mapComplaints.length > 0 ? (
                <InteractiveMap
                  complaints={mapComplaints}
                  hotspots={hotspots}
                  heightClass="h-[420px]"
                  enableControls={false}
                  showHotspotsToggle={false}
                  initialZoom={12}
                />
              ) : (
                <div className="h-[420px] rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-sm text-slate-500">
                  <Layers className="w-8 h-8 text-slate-300 mb-2" />
                  No stored complaints to plot yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT ──────────────────────────────────────────────────────────── */}
      <section className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-7 space-y-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">About the platform</p>
              <h2 className="text-3xl font-extrabold tracking-tight">
                Built for municipal teams and the citizens they serve
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                CIVICTRACK AI is a production-style demonstration of how civic complaints can be captured with
                evidence, analysed by a language model, plotted geographically and moved through a department
                workflow. It is not a live municipal service and it does not invent AI output.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <Users className="w-5 h-5 text-blue-300" />
                  <h3 className="text-sm font-bold mt-2">For citizens</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Report with GPS and photos, follow the timeline, add follow-up notes and see resolution evidence.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <Building2 className="w-5 h-5 text-blue-300" />
                  <h3 className="text-sm font-bold mt-2">For authorities</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Review AI suggestions, correct mistakes, assign departments and officers, and record the outcome.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 text-xs text-slate-300">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-blue-300" />
                  Honest scope
                </h3>
                {[
                  'AI features require a server-side GEMINI_API_KEY. Without it the API returns a clear "not configured" error.',
                  'The database is local SQLite, not a hosted municipal system.',
                  'Seeded demo complaints are labelled in the database and are not presented as live AI results.',
                  'SMS, email and PDF export are not implemented; no buttons claim otherwise.',
                ].map(item => (
                  <p key={item} className="flex items-start gap-2 leading-relaxed">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold">Ready to report a civic issue?</h3>
              <p className="text-xs text-slate-400 mt-1">
                Create a citizen account or sign in with a demonstration account on the login page.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/register"
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
              >
                Create account
              </Link>
              <Link
                to="/map"
                className="px-4 py-2.5 rounded-xl border border-white/20 text-white hover:bg-white/10 text-xs font-bold"
              >
                Browse the map
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
