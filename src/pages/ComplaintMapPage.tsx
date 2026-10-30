import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Layers,
  Flame,
  PlusCircle,
  AlertTriangle,
  SlidersHorizontal,
  Loader2,
  Activity,
  CalendarDays,
  Crosshair,
  Gauge,
  ClipboardCheck,
  RefreshCw,
} from 'lucide-react';
import { useComplaints } from '../context/ComplaintContext';
import { InteractiveMap } from '../components/map/InteractiveMap';
import { PriorityBadge } from '../components/common/Badge';
import { platformApi } from '../services/api';
import { ComplaintPriority, GeographicHotspot } from '../types';

type DrawerTab = 'complaints' | 'hotspots';

const WINDOW_OPTIONS = [
  { value: 0, label: 'All active' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-rose-50 text-rose-700 border-rose-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  moderate: 'bg-blue-50 text-blue-700 border-blue-200',
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function priorityLabel(value?: ComplaintPriority): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';
}

export const ComplaintMapPage: React.FC = () => {
  const navigate = useNavigate();
  const { complaints, hotspots } = useComplaints();

  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [focusedHotspotId, setFocusedHotspotId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('hotspots');
  const [windowDays, setWindowDays] = useState(0);
  const [filteredHotspots, setFilteredHotspots] = useState<GeographicHotspot[] | null>(null);
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [hotspotError, setHotspotError] = useState<string | null>(null);

  const criticalCount = complaints.filter(c => c.priority === 'critical' && !['resolved', 'closed', 'rejected'].includes(c.status)).length;
  const resolvedCount = complaints.filter(c => ['resolved', 'closed'].includes(c.status)).length;

  // When a date window is selected, query the backend with the same DBSCAN
  // parameters. "All active" reuses the shared context response.
  useEffect(() => {
    let cancelled = false;
    if (!windowDays) {
      setFilteredHotspots(null);
      setHotspotError(null);
      setHotspotsLoading(false);
      return;
    }

    setHotspotsLoading(true);
    setHotspotError(null);
    platformApi
      .hotspots(400, 3, windowDays)
      .then(response => {
        if (!cancelled) setFilteredHotspots(response.hotspots);
      })
      .catch(err => {
        if (!cancelled) {
          setFilteredHotspots([]);
          setHotspotError(err instanceof Error ? err.message : 'Could not load hotspots.');
        }
      })
      .finally(() => {
        if (!cancelled) setHotspotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  const visibleHotspots = filteredHotspots ?? hotspots;

  useEffect(() => {
    if (focusedHotspotId && !visibleHotspots.some(hs => hs.id === focusedHotspotId)) {
      setFocusedHotspotId(null);
    }
  }, [focusedHotspotId, visibleHotspots]);

  const totalHotspotComplaints = useMemo(
    () => visibleHotspots.reduce((sum, hs) => sum + hs.activeComplaintCount, 0),
    [visibleHotspots],
  );

  const handleSelectComplaint = (id: string) => {
    setFocusedHotspotId(null);
    setSelectedComplaintId(id);
  };

  const handleFocusHotspot = (hotspot: GeographicHotspot) => {
    setSelectedComplaintId(null);
    setFocusedHotspotId(hotspot.id);
  };

  return (
    <div className="bg-slate-100 min-h-screen flex flex-col">
      {/* Top Header / Statistics HUD */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 shadow-sm z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Main Civic Complaint Geospatial Map
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                  OpenStreetMap • Live GIS
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Displaying saved civic defects using actual stored database GPS coordinates
              </p>
            </div>
          </div>

          {/* Quick HUD Metrics */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <span className="text-slate-500">Stored Coordinates:</span>
              <strong className="text-slate-900 font-mono text-sm">{complaints.length}</strong>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-orange-700">Hotspots:</span>
              <strong className="text-orange-900 font-mono text-sm">{visibleHotspots.length}</strong>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span className="text-rose-700">Critical (Red):</span>
              <strong className="text-rose-900 font-mono text-sm">{criticalCount}</strong>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-emerald-700">Resolved (Green):</span>
              <strong className="text-emerald-900 font-mono text-sm">{resolvedCount}</strong>
            </div>

            <button
              onClick={() => navigate('/submit')}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Report New Issue
            </button>

            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors"
              title="Toggle detail drawer"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Map & Drawer Area */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Leaflet Map Fullscreen Area */}
        <div className="flex-1 relative">
          <InteractiveMap
            complaints={complaints}
            hotspots={visibleHotspots}
            selectedComplaintId={selectedComplaintId}
            focusedHotspotId={focusedHotspotId}
            onSelectComplaint={c => handleSelectComplaint(c.id)}
            onSelectHotspot={handleFocusHotspot}
            heightClass="h-[calc(100vh-140px)]"
            enableControls={true}
          />
        </div>

        {/* Side Drawer */}
        {sidebarOpen && (
          <div className="w-80 sm:w-96 bg-white border-l border-slate-200 shadow-xl flex flex-col h-[calc(100vh-140px)] z-20">
            <div className="border-b border-slate-200 bg-slate-50/80 sticky top-0 z-10">
              <div className="flex items-center justify-between px-4 pt-3">
                <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setDrawerTab('complaints')}
                    className={`px-3 py-1.5 inline-flex items-center gap-1.5 ${
                      drawerTab === 'complaints' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Complaints ({complaints.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerTab('hotspots')}
                    className={`px-3 py-1.5 inline-flex items-center gap-1.5 ${
                      drawerTab === 'hotspots' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    Hotspots ({visibleHotspots.length})
                  </button>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                  aria-label="Close drawer"
                >
                  ✕
                </button>
              </div>

              {drawerTab === 'hotspots' && (
                <div className="px-4 py-3 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-slate-500 leading-tight">
                    DBSCAN · 400 m radius · min 3 active complaints
                    {windowDays ? ` · ${WINDOW_OPTIONS.find(o => o.value === windowDays)?.label}` : ''}
                  </p>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 flex-shrink-0">
                    <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={windowDays}
                      onChange={e => setWindowDays(Number(e.target.value))}
                      className="text-[10px] font-bold bg-white border border-slate-300 rounded-lg px-1.5 py-1"
                      aria-label="Hotspot submission window"
                    >
                      {WINDOW_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {drawerTab === 'complaints' && (
                <div className="px-4 py-3">
                  <p className="text-[11px] text-slate-500">Click any card to pan the map marker</p>
                </div>
              )}
            </div>

            {drawerTab === 'complaints' ? (
              <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
                {complaints.map(item => {
                  const isSelected = selectedComplaintId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectComplaint(item.id)}
                      className={`p-4 transition-all cursor-pointer hover:bg-slate-50 space-y-2 ${
                        isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-blue-600">#{item.ticketNumber}</span>
                        <PriorityBadge priority={item.priority} />
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">{item.title}</h4>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{item.location.address}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono text-[10px] text-slate-400">
                          {item.location.lat.toFixed(6)}, {item.location.lng.toFixed(6)}
                        </span>

                        <button
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/track?id=${item.ticketNumber}`);
                          }}
                          className="text-xs font-bold text-blue-600 hover:underline"
                        >
                          Track Audit →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {hotspotsLoading && (
                  <div className="p-6 text-center text-xs text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Recomputing hotspots for the selected window…
                  </div>
                )}

                {hotspotError && (
                  <div className="m-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {hotspotError}
                  </div>
                )}

                {!hotspotsLoading && visibleHotspots.length === 0 && !hotspotError && (
                  <div className="p-6 text-center space-y-2">
                    <Flame className="w-9 h-9 text-slate-300 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-900">No hotspots in this window</h3>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      A hotspot needs at least 3 active complaints within 400 m. Resolved, closed and rejected
                      complaints remain on the map but do not create hotspots.
                    </p>
                  </div>
                )}

                {!hotspotsLoading && visibleHotspots.length > 0 && (
                  <div className="p-3 space-y-3">
                    <div className="rounded-xl bg-slate-900 text-white p-3 flex items-center justify-between gap-3">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Detected clusters
                        </span>
                        <strong className="text-lg tabular-nums">{visibleHotspots.length}</strong>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Complaints clustered
                        </span>
                        <strong className="text-lg tabular-nums">{totalHotspotComplaints}</strong>
                      </div>
                      <Activity className="w-5 h-5 text-blue-300 flex-shrink-0" />
                    </div>

                    {visibleHotspots.map(hotspot => {
                      const isFocused = focusedHotspotId === hotspot.id;
                      const categories = hotspot.categories || hotspot.dominantCategories || [];
                      return (
                        <div
                          key={hotspot.id}
                          className={`rounded-2xl border bg-white overflow-hidden transition-colors ${
                            isFocused ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleFocusHotspot(hotspot)}
                            className="w-full text-left p-3.5 space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-xs font-bold text-slate-900 leading-snug">{hotspot.name}</h3>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  {hotspot.zone || 'Zone not recorded'} · {hotspot.ward || 'Ward not recorded'}
                                </p>
                              </div>
                              <span
                                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border flex-shrink-0 ${
                                  SEVERITY_STYLES[hotspot.severityRisk] || SEVERITY_STYLES.moderate
                                }`}
                              >
                                {hotspot.severityRisk}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 text-center">
                              <div className="rounded-lg bg-slate-50 border border-slate-100 p-1.5">
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  Complaints
                                </span>
                                <strong className="text-sm text-slate-900 tabular-nums">
                                  {hotspot.activeComplaintCount}
                                </strong>
                              </div>
                              <div className="rounded-lg bg-slate-50 border border-slate-100 p-1.5">
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  Avg priority
                                </span>
                                <strong className="text-[11px] text-slate-900">
                                  {priorityLabel(hotspot.avgPriority)}
                                </strong>
                                <span className="block text-[9px] text-slate-500">
                                  {hotspot.avgPriorityScore !== undefined
                                    ? `${hotspot.avgPriorityScore}/100`
                                    : 'score n/a'}
                                </span>
                              </div>
                              <div className="rounded-lg bg-slate-50 border border-slate-100 p-1.5">
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  Radius
                                </span>
                                <strong className="text-sm text-slate-900 tabular-nums">{hotspot.radiusMeters}</strong>
                                <span className="text-[9px] text-slate-500"> m</span>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Dominant categories
                              </span>
                              {categories.length === 0 ? (
                                <p className="text-[11px] text-slate-500">No category data.</p>
                              ) : (
                                categories.slice(0, 4).map(category => (
                                  <div key={category.category} className="space-y-0.5">
                                    <div className="flex items-center justify-between gap-2 text-[10px]">
                                      <span className="text-slate-600 truncate">{category.label}</span>
                                      <span className="font-bold text-slate-800 tabular-nums">
                                        {category.count}
                                        {category.percentage !== undefined ? ` (${category.percentage}%)` : ''}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-blue-500"
                                        style={{
                                          width: `${category.percentage ?? Math.max(4, (category.count / hotspot.activeComplaintCount) * 100)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            <p className="text-[11px] text-slate-600 leading-relaxed border-l-2 border-blue-300 pl-2">
                              {hotspot.insight || hotspot.aiAlertReason}
                            </p>

                            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                                <ClipboardCheck className="w-3 h-3" />
                                Suggested inspection
                              </span>
                              <p className="text-[10px] text-slate-700 leading-relaxed mt-0.5">
                                {hotspot.suggestedInspectionAction || 'Conduct a site inspection.'}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" />
                                {formatDate(hotspot.firstReportedAt)} – {formatDate(hotspot.lastReportedAt)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" />
                                {hotspot.recentComplaintCount ?? 0} in 14 days
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Gauge className="w-3 h-3" />
                                {hotspot.trend}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[9px] text-slate-400">
                              <span className="font-mono">
                                {hotspot.center[0].toFixed(6)}, {hotspot.center[1].toFixed(6)}
                              </span>
                              <span className="inline-flex items-center gap-1 font-bold text-blue-600">
                                <Crosshair className="w-3 h-3" />
                                {isFocused ? 'Focused on map' : 'Show on map'}
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
