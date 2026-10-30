import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Complaint, ComplaintCategory, ComplaintPriority, ComplaintStatus, GeographicHotspot } from '../../types';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../common/Badge';
import { 
  Layers, 
  Filter, 
  MapPin, 
  Flame, 
  Eye, 
  ThumbsUp, 
  Compass, 
  AlertTriangle,
  Sparkles,
  Info,
  Search,
  CheckCircle2,
  Calendar,
  Crosshair,
  Sliders
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export type MapViewMode = 'markers' | 'heatmap' | 'both';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatShortDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface InteractiveMapProps {
  complaints: Complaint[];
  hotspots?: GeographicHotspot[];
  selectedComplaintId?: string | null;
  focusedHotspotId?: string | null;
  onSelectComplaint?: (complaint: Complaint) => void;
  onSelectHotspot?: (hotspot: GeographicHotspot) => void;
  showHotspotsToggle?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  heightClass?: string;
  enableControls?: boolean;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  complaints,
  hotspots = [],
  selectedComplaintId,
  focusedHotspotId,
  onSelectComplaint,
  onSelectHotspot,
  showHotspotsToggle = true,
  initialCenter = [18.5284, 73.8451],
  initialZoom = 13,
  heightClass = 'h-[650px]',
  enableControls = true
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const heatmapLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const hotspotsLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const navigate = useNavigate();
  const { showToast } = useToast();

  // Filters & State
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<MapViewMode>('markers');
  const [showHotspots, setShowHotspots] = useState<boolean>(true);
  const [activePopupData, setActivePopupData] = useState<Complaint | null>(null);

  // Helper to determine marker color per user requirements:
  // Green: Resolved
  // Red: Critical priority
  // Orange: High priority
  // Yellow: Medium priority
  // Blue: Low priority
  const getMarkerColor = (complaint: Complaint): { bg: string; border: string; label: string; text: string } => {
    if (complaint.status === 'resolved') {
      return { bg: '#10b981', border: '#059669', label: 'Green (Resolved)', text: '#ffffff' };
    }
    switch (complaint.priority) {
      case 'critical':
        return { bg: '#ef4444', border: '#b91c1c', label: 'Red (Critical)', text: '#ffffff' };
      case 'high':
        return { bg: '#f97316', border: '#c2410c', label: 'Orange (High)', text: '#ffffff' };
      case 'medium':
        return { bg: '#eab308', border: '#a16207', label: 'Yellow (Medium)', text: '#713f12' };
      case 'low':
        return { bg: '#3b82f6', border: '#1d4ed8', label: 'Blue (Low)', text: '#ffffff' };
      default:
        return { bg: '#3b82f6', border: '#1d4ed8', label: 'Blue', text: '#ffffff' };
    }
  };

  const getCategoryIconEmoji = (cat: ComplaintCategory): string => {
    switch (cat) {
      case 'pothole':
      case 'road_damage':
        return '🕳️';
      case 'drainage':
      case 'drainage_blockage':
        return '🔧';
      case 'waterlogging':
        return '🌊';
      case 'garbage':
      case 'garbage_overflow':
        return '🗑️';
      case 'streetlight':
      case 'broken_streetlight':
        return '💡';
      case 'electrical_hazard':
        return '⚡';
      default:
        return '⚠️';
    }
  };

  // Filter complaints strictly according to filter requirements
  const filteredComplaints = useMemo(() => complaints.filter(c => {
    // Category Filter
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'road_damage' && c.category !== 'road_damage' && c.category !== 'pothole') return false;
      if (categoryFilter === 'drainage' && c.category !== 'drainage' && c.category !== 'drainage_blockage') return false;
      if (categoryFilter === 'waterlogging' && c.category !== 'waterlogging') return false;
      if (categoryFilter === 'garbage' && c.category !== 'garbage' && c.category !== 'garbage_overflow') return false;
      if (categoryFilter === 'streetlight' && c.category !== 'streetlight' && c.category !== 'broken_streetlight') return false;
      if (categoryFilter === 'electrical_hazard' && c.category !== 'electrical_hazard') return false;
    }

    // Priority Filter
    if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;

    // Status Filter
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;

    // Search by ID or Location
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = c.ticketNumber.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
      const matchLocation = c.location.address.toLowerCase().includes(q) || c.location.ward.toLowerCase().includes(q);
      const matchTitle = c.title.toLowerCase().includes(q);
      if (!matchId && !matchLocation && !matchTitle) return false;
    }

    return true;
  }), [complaints, categoryFilter, priorityFilter, statusFilter, searchQuery]);

  // Initialize Map with Leaflet & OpenStreetMap
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // OpenStreetMap base tiles
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Initialize layer groups
    markersLayerGroupRef.current = L.layerGroup().addTo(map);
    heatmapLayerGroupRef.current = L.layerGroup().addTo(map);
    hotspotsLayerGroupRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers, Heatmap & Hotspots when complaints or filters change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const markersGroup = markersLayerGroupRef.current;
    const heatmapGroup = heatmapLayerGroupRef.current;
    const hotspotsGroup = hotspotsLayerGroupRef.current;

    if (!markersGroup || !heatmapGroup || !hotspotsGroup) return;

    // Clear all previous layers
    markersGroup.clearLayers();
    heatmapGroup.clearLayers();
    hotspotsGroup.clearLayers();

    // 1. RENDER HEATMAP LAYER (if viewMode === 'heatmap' or 'both')
    if (viewMode === 'heatmap' || viewMode === 'both') {
      filteredComplaints.forEach(c => {
        const { bg } = getMarkerColor(c);
        const radiusMeters = c.priority === 'critical' ? 280 : c.priority === 'high' ? 220 : 160;

        // Outer soft density halo
        L.circle([c.location.lat, c.location.lng], {
          radius: radiusMeters,
          color: bg,
          fillColor: bg,
          fillOpacity: 0.18,
          weight: 0,
        }).addTo(heatmapGroup);

        // Mid intensity glow
        L.circle([c.location.lat, c.location.lng], {
          radius: radiusMeters * 0.5,
          color: bg,
          fillColor: bg,
          fillOpacity: 0.35,
          weight: 1,
        }).addTo(heatmapGroup);

        // Core dense heat point
        L.circleMarker([c.location.lat, c.location.lng], {
          radius: 8,
          color: '#ffffff',
          fillColor: bg,
          fillOpacity: 0.85,
          weight: 2,
        }).addTo(heatmapGroup);
      });
    }

    // 2. RENDER MAP MARKERS (if viewMode === 'markers' or 'both')
    if (viewMode === 'markers' || viewMode === 'both') {
      filteredComplaints.forEach(c => {
        const colorConfig = getMarkerColor(c);
        const isCritical = c.priority === 'critical' && c.status !== 'resolved';
        const isResolved = c.status === 'resolved';
        const emoji = getCategoryIconEmoji(c.category);

        // Leaflet custom divIcon matching user color specification
        const iconHtml = `
          <div class="relative group cursor-pointer">
            ${isCritical ? '<div class="absolute -inset-2.5 rounded-full bg-rose-500/40 animate-ping"></div>' : ''}
            <div style="background-color: ${colorConfig.bg}; border-color: #ffffff;" class="w-9 h-9 rounded-full border-2 shadow-xl flex items-center justify-center text-sm font-bold text-white transform hover:scale-125 transition-transform duration-200">
              ${isResolved ? '✓' : emoji}
            </div>
            <div style="background-color: ${colorConfig.border};" class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b border-white"></div>
          </div>
        `;

        const customMarkerIcon = L.divIcon({
          className: 'civic-map-marker',
          html: iconHtml,
          iconSize: [36, 36],
          iconAnchor: [18, 36],
          popupAnchor: [0, -36],
        });

        // Exact Coordinates from database
        const marker = L.marker([c.location.lat, c.location.lng], { icon: customMarkerIcon });

        // Required Popup Content:
        // - Complaint ID
        // - Category
        // - Complaint description
        // - Exact coordinates
        // - Priority
        // - Submission date
        // - Current status
        const formattedDate = new Date(c.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        const popupContent = `
          <div class="p-3 max-w-[280px] font-sans text-xs space-y-2 text-slate-800">
            <div class="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span class="font-mono font-bold text-blue-600 text-sm">#${escapeHtml(c.ticketNumber)}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style="background-color: ${colorConfig.bg}20; color: ${colorConfig.bg}; border: 1px solid ${colorConfig.bg}40;">
                ${escapeHtml(c.status.replace('_', ' '))}
              </span>
            </div>

            <div>
              <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Category: <span class="text-slate-900">${escapeHtml(c.category.replace(/_/g, ' ').toUpperCase())}</span>
              </div>
              <p class="font-bold text-slate-900 mt-1 line-clamp-2 text-xs leading-snug">
                ${escapeHtml(c.title)}
              </p>
            </div>

            <p class="text-[11px] text-slate-600 line-clamp-3 leading-relaxed border-l-2 pl-2 border-slate-300">
              "${escapeHtml(c.description)}"
            </p>

            <div class="pt-1.5 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-500">Exact Coordinates:</span>
                <span class="font-mono font-bold text-slate-800">${escapeHtml(c.location.lat)}, ${escapeHtml(c.location.lng)}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-500">Priority:</span>
                <span class="font-bold uppercase text-[10px]" style="color: ${colorConfig.bg};">
                  ${escapeHtml(c.priority)}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-500">Submitted:</span>
                <span class="font-medium text-slate-700">${escapeHtml(formattedDate)}</span>
              </div>
            </div>

            <div class="pt-2">
              <a href="/track?id=${encodeURIComponent(c.ticketNumber)}" class="block text-center w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors">
                View full tracking timeline
              </a>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          className: 'custom-map-popup',
          maxWidth: 300,
        });

        marker.on('click', () => {
          setActivePopupData(c);
          if (onSelectComplaint) onSelectComplaint(c);
        });

        marker.addTo(markersGroup);
      });
    }

    // 3. RENDER HOTSPOT CLUSTERS (if showHotspots)
    if (showHotspots && hotspots.length > 0) {
      hotspots.forEach(hs => {
        const ringColor = hs.severityRisk === 'critical' ? '#ef4444' : hs.severityRisk === 'high' ? '#f97316' : '#3b82f6';
        const categoryRows = (hs.categories || [])
          .slice(0, 4)
          .map(
            category => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;">
                <span style="color:#334155;">${escapeHtml(category.label)}</span>
                <strong style="color:#0f172a;font-variant-numeric:tabular-nums;">${category.count}${category.percentage !== undefined ? ` <span style="font-weight:500;color:#94a3b8;">(${category.percentage}%)</span>` : ''}</strong>
              </div>`,
          )
          .join('');
        const dateRange = `${formatShortDate(hs.firstReportedAt)} – ${formatShortDate(hs.lastReportedAt)}`;
        const recentText = hs.recentComplaintCount !== undefined
          ? `${hs.recentComplaintCount} in the last 14 days`
          : 'Recent activity not recorded';
        const priorityLabel = hs.avgPriority ? hs.avgPriority.toUpperCase() : 'UNKNOWN';

        const hotspotPopup = `
          <div class="p-3 max-w-[310px] font-sans text-xs space-y-2 text-slate-800">
            <div class="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-rose-600">DBSCAN hotspot</span>
                <h4 class="font-bold text-slate-900 text-sm leading-snug mt-0.5">${escapeHtml(hs.name)}</h4>
                <p class="text-[11px] text-slate-500">${escapeHtml(hs.zone || 'Zone not recorded')} · ${escapeHtml(hs.ward || 'Ward not recorded')}</p>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style="background:${ringColor}1a;color:${ringColor};border:1px solid ${ringColor}40;">
                ${escapeHtml(hs.severityRisk)}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2 text-[11px]">
              <div class="rounded-lg bg-slate-50 border border-slate-100 p-2">
                <span class="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Active complaints</span>
                <strong class="text-base text-slate-900 tabular-nums">${hs.activeComplaintCount}</strong>
              </div>
              <div class="rounded-lg bg-slate-50 border border-slate-100 p-2">
                <span class="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Average priority</span>
                <strong class="text-sm text-slate-900">${escapeHtml(priorityLabel)}</strong>
                <span class="text-[10px] text-slate-500">${hs.avgPriorityScore !== undefined ? `${hs.avgPriorityScore}/100` : 'score not available'}</span>
              </div>
            </div>

            <div>
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Dominant categories</span>
              <div class="border-t border-slate-100">${categoryRows || '<span class="text-slate-500">No categories recorded.</span>'}</div>
            </div>

            <div class="rounded-lg bg-blue-50 border border-blue-100 p-2">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Suggested inspection</span>
              <span class="text-[11px] text-slate-700 leading-relaxed">${escapeHtml(hs.suggestedInspectionAction || 'Conduct a site inspection.')}</span>
            </div>

            <p class="text-[11px] text-slate-600 leading-relaxed border-l-2 border-blue-300 pl-2">${escapeHtml(hs.insight || hs.aiAlertReason)}</p>

            <div class="pt-1.5 border-t border-slate-100 space-y-1 text-[10px] text-slate-500">
              <div class="flex items-center justify-between gap-2">
                <span>Reports</span>
                <span class="font-medium text-slate-700">${escapeHtml(dateRange)}</span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <span>Recency</span>
                <span class="font-medium text-slate-700">${escapeHtml(recentText)}</span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <span>Radius</span>
                <span class="font-medium text-slate-700">${hs.radiusMeters} m</span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <span>Centre</span>
                <span class="font-mono font-bold text-slate-700">${hs.center[0]}, ${hs.center[1]}</span>
              </div>
            </div>
          </div>
        `;

        const circle = L.circle(hs.center, {
          color: ringColor,
          fillColor: ringColor,
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '5, 5',
          radius: hs.radiusMeters,
        }).addTo(hotspotsGroup);

        circle.bindTooltip(`
          <div class="p-1.5 text-xs font-semibold">
            <span class="text-rose-600 font-bold">DBSCAN hotspot</span>: ${escapeHtml(hs.name)}<br/>
            <span class="text-slate-600 font-normal">${hs.activeComplaintCount} active issues · ${escapeHtml((hs.avgPriority || 'unknown').toUpperCase())} priority · click for summary</span>
          </div>
        `, { sticky: true });
        circle.bindPopup(hotspotPopup, { className: 'custom-map-popup', maxWidth: 330 });

        const hotspotIcon = L.divIcon({
          className: '',
          html: `<div style="background:${ringColor};border:2px solid #fff;color:#fff;border-radius:9999px;min-width:26px;height:26px;padding:0 6px;display:flex;align-items:center;justify-content:center;font:700 11px/1 sans-serif;box-shadow:0 4px 10px rgba(15,23,42,.25)">${hs.activeComplaintCount}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const hotspotMarker = L.marker(hs.center, {
          icon: hotspotIcon,
          interactive: true,
          title: `${hs.name}: ${hs.activeComplaintCount} active complaints`,
        });
        hotspotMarker.bindPopup(hotspotPopup, { className: 'custom-map-popup', maxWidth: 330 });
        hotspotMarker.on('click', () => {
          if (onSelectHotspot) onSelectHotspot(hs);
        });
        hotspotMarker.addTo(hotspotsGroup);

        if (focusedHotspotId === hs.id) {
          hotspotMarker.openPopup();
        }
      });
    }

    // Pan to a specific hotspot selected from the summary panel.
    if (focusedHotspotId) {
      const focused = hotspots.find(hs => hs.id === focusedHotspotId);
      if (focused) {
        map.flyTo(focused.center, 15, { duration: 1 });
      }
    }

    // Pan to specific complaint if requested
    if (selectedComplaintId) {
      const selected = complaints.find(c => c.id === selectedComplaintId || c.ticketNumber === selectedComplaintId);
      if (selected) {
        map.flyTo([selected.location.lat, selected.location.lng], 16, { duration: 1 });
        setActivePopupData(selected);
      }
    }
  }, [filteredComplaints, viewMode, showHotspots, selectedComplaintId, focusedHotspotId, hotspots, complaints]);

  const handleResetView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(initialCenter, initialZoom, { duration: 1 });
      showToast('Map camera reset to city center', 'info');
    }
  };

  return (
    <div className="relative rounded-3xl overflow-hidden border border-slate-200 shadow-card bg-slate-100 flex flex-col">
      {/* Interactive Top Control HUD */}
      {enableControls && (
        <div className="bg-white/95 backdrop-blur-md p-3.5 border-b border-slate-200 z-20 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left filters: Search, Category, Priority, Status */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input for ID or Location */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Complaint ID or Street..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs w-48 sm:w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="py-1.5 px-2.5 rounded-xl border border-slate-300 font-semibold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Complaints ({complaints.length})</option>
              <option value="road_damage">Road Damage (Potholes)</option>
              <option value="drainage">Drainage Blockages</option>
              <option value="waterlogging">Waterlogging</option>
              <option value="garbage">Garbage Overflow</option>
              <option value="streetlight">Streetlights</option>
              <option value="electrical_hazard">Electrical Hazards</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="py-1.5 px-2.5 rounded-xl border border-slate-300 font-semibold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Priorities</option>
              <option value="critical">🔴 Critical Priority</option>
              <option value="high">🟠 High Priority</option>
              <option value="medium">🟡 Medium Priority</option>
              <option value="low">🔵 Low Priority</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-2.5 rounded-xl border border-slate-300 font-semibold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">🟢 Resolved</option>
            </select>
          </div>

          {/* Right controls: View Mode (Markers vs Heatmap), Hotspots, Reset */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Segmented Control: Markers vs Heatmap */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('markers')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  viewMode === 'markers' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Markers
              </button>
              <button
                type="button"
                onClick={() => setViewMode('heatmap')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  viewMode === 'heatmap' ? 'bg-white text-purple-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Heatmap
              </button>
              <button
                type="button"
                onClick={() => setViewMode('both')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  viewMode === 'both' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Both
              </button>
            </div>

            {/* Hotspot Toggle */}
            {showHotspotsToggle && (
              <button
                type="button"
                onClick={() => setShowHotspots(!showHotspots)}
                className={`px-2.5 py-1.5 rounded-xl font-bold border transition-colors flex items-center gap-1 ${
                  showHotspots
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Flame className={`w-3.5 h-3.5 ${showHotspots ? 'text-rose-600' : 'text-slate-400'}`} />
                <span>Hotspots</span>
              </button>
            )}

            {/* Reset Camera View */}
            <button
              type="button"
              onClick={handleResetView}
              className="p-1.5 rounded-xl bg-white text-slate-700 hover:text-blue-600 border border-slate-200 shadow-xs transition-colors"
              title="Reset view to city center"
            >
              <Compass className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Map Canvas Area */}
      <div className="relative flex-1">
        <div ref={mapContainerRef} className={`w-full ${heightClass}`} />

        {/* Marker Color Legend HUD (per user exact specs) */}
        <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-xl hidden sm:flex flex-col gap-1.5 text-[11px]">
          <span className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-0.5">
            Marker Priority Legend
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold text-rose-700">
              <span className="w-3 h-3 rounded-full bg-red-500 border border-white shadow-xs"></span>
              Red: Critical
            </span>
            <span className="flex items-center gap-1 font-semibold text-orange-700">
              <span className="w-3 h-3 rounded-full bg-orange-500 border border-white shadow-xs"></span>
              Orange: High
            </span>
            <span className="flex items-center gap-1 font-semibold text-amber-700">
              <span className="w-3 h-3 rounded-full bg-yellow-500 border border-white shadow-xs"></span>
              Yellow: Medium
            </span>
            <span className="flex items-center gap-1 font-semibold text-blue-700">
              <span className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow-xs"></span>
              Blue: Low
            </span>
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white shadow-xs"></span>
              Green: Resolved
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Plotted using stored database GPS coordinates ({filteredComplaints.length} in view)
          </p>
        </div>
      </div>
    </div>
  );
};
