import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ThumbsUp,
  Send,
  ShieldCheck,
  Cpu,
  MessageSquare,
  FileText,
  Building2,
  User,
  Calendar,
  Loader2,
  ArrowRight,
  Camera,
  XCircle,
} from 'lucide-react';
import { useComplaints } from '../context/ComplaintContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/common/Badge';
import { InteractiveMap } from '../components/map/InteractiveMap';
import { ComplaintStatus } from '../types';

const WORKFLOW_STEPS: { key: ComplaintStatus; label: string }[] = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

function stepIndex(status: ComplaintStatus): number {
  const index = WORKFLOW_STEPS.findIndex(s => s.key === status);
  return index < 0 ? 0 : index;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const TrackComplaintPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { complaints, getComplaintById, getDepartmentById, upvoteComplaint, addTimelineNote } = useComplaints();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [voting, setVoting] = useState(false);

  // Resolve the ticket from the URL (?id=CT-...) whenever the URL changes.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idParam = params.get('id');
    setSelectedTicket(idParam ? idParam.trim() : null);
    setSearchQuery(idParam ? idParam.trim() : '');
  }, [location.search]);

  const activeComplaint = selectedTicket ? getComplaintById(selectedTicket) : undefined;
  const department = activeComplaint ? getDepartmentById(activeComplaint.departmentId) : undefined;

  const isOwner = Boolean(
    user && activeComplaint && activeComplaint.citizenId && activeComplaint.citizenId === user.id,
  );
  const canAddNote = Boolean(user && (user.role === 'authority' || user.role === 'admin' || isOwner));

  const sortedTimeline = useMemo(() => {
    if (!activeComplaint) return [];
    return [...activeComplaint.timeline].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [activeComplaint]);

  const latestEvent = sortedTimeline.length ? sortedTimeline[sortedTimeline.length - 1] : null;
  const isRejected = activeComplaint?.status === 'rejected';
  const currentStep = activeComplaint ? stepIndex(activeComplaint.status) : 0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    const found = getComplaintById(query);
    if (!found) {
      showToast(`No complaint matches “${query}”. Check the ticket ID and try again.`, 'error', 'Not found');
      return;
    }
    navigate(`/track?id=${encodeURIComponent(found.ticketNumber)}`);
  };

  const handleUpvote = async () => {
    if (!activeComplaint || !user) return;
    setVoting(true);
    try {
      await upvoteComplaint(activeComplaint.id);
      showToast('Your support has been recorded for this complaint.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not record your vote.', 'error');
    } finally {
      setVoting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeComplaint || !noteText.trim()) return;
    setSubmittingNote(true);
    try {
      await addTimelineNote(activeComplaint.id, noteText.trim());
      setNoteText('');
      showToast('Your note was added to the complaint timeline.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add the note.', 'error');
    } finally {
      setSubmittingNote(false);
    }
  };

  const recentComplaints = complaints.slice(0, 6);

  return (
    <div className="bg-slate-50 min-h-screen py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Search header */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
              <Search className="w-3.5 h-3.5" />
              Complaint tracking
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Track a civic complaint
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Enter the ticket ID you received when the complaint was submitted. The page shows the stored
              location, assigned department, status timeline and any resolution evidence.
            </p>
          </div>

          <form onSubmit={handleSearch} className="max-w-xl mx-auto flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Enter ticket ID (for example CT-2026-881)"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                aria-label="Ticket ID"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors"
            >
              Track complaint
            </button>
          </form>

          {recentComplaints.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
              <span className="text-slate-400 font-medium">Recent complaint IDs:</span>
              {recentComplaints.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/track?id=${encodeURIComponent(c.ticketNumber)}`)}
                  className={`px-2.5 py-1 rounded-lg font-mono font-bold border transition-colors ${
                    activeComplaint?.id === c.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {c.ticketNumber}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* No complaint selected / not found */}
        {!activeComplaint && (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-3">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <h2 className="text-base font-bold text-slate-900">
              {selectedTicket ? 'Complaint not found' : 'Enter a ticket ID to begin'}
            </h2>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              {selectedTicket
                ? `No stored complaint matches “${selectedTicket}”. Check the ID from your submission confirmation or browse the complaint map.`
                : 'You can also find complaints on the interactive map or from your citizen dashboard if you are signed in.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('/map')}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5" />
                Open complaint map
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => navigate('/citizen-dashboard')}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5" />
                  My complaints
                </button>
              )}
            </div>
          </div>
        )}

        {activeComplaint && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Main column */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Ticket ID
                    </span>
                    <h2 className="text-2xl font-black text-blue-600 font-mono tracking-tight">
                      {activeComplaint.ticketNumber}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryBadge category={activeComplaint.category} />
                    <PriorityBadge priority={activeComplaint.priority} />
                    <StatusBadge status={activeComplaint.status} />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xl font-bold text-slate-900 leading-snug">{activeComplaint.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                    {activeComplaint.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Location
                      </span>
                      <strong className="text-slate-800">{activeComplaint.location.address}</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {activeComplaint.location.ward}
                        {activeComplaint.location.zone ? ` · ${activeComplaint.location.zone}` : ''}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                        {activeComplaint.location.lat.toFixed(6)}, {activeComplaint.location.lng.toFixed(6)}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2">
                    <Building2 className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Responsible department
                      </span>
                      <strong className="text-slate-800">
                        {department ? department.name : activeComplaint.departmentId || 'Not assigned'}
                      </strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Officer: {activeComplaint.assignedOfficer || 'Not assigned'}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2">
                    <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Reported by
                      </span>
                      <strong className="text-slate-800">{activeComplaint.citizenName}</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {formatDateTime(activeComplaint.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Target resolution
                      </span>
                      <strong className="text-slate-800">
                        {formatDateTime(activeComplaint.targetResolutionDate)}
                      </strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Last updated {formatDateTime(activeComplaint.updatedAt)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Workflow progress */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Resolution progress
                    </span>
                    {isRejected ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                        <XCircle className="w-3.5 h-3.5" /> Rejected / duplicate
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        Step {currentStep + 1} of {WORKFLOW_STEPS.length}
                      </span>
                    )}
                  </div>

                  {isRejected ? (
                    <p className="text-xs rounded-xl bg-slate-50 border border-slate-200 p-3 text-slate-600">
                      This complaint was closed as a duplicate or rejected after administrative review. The timeline
                      below records the reason.
                    </p>
                  ) : (
                    <div className="relative flex items-start justify-between">
                      <div className="absolute top-4 left-0 right-0 h-1 bg-slate-200 -translate-y-1/2 z-0">
                        <div
                          className="h-full bg-blue-600 transition-all"
                          style={{ width: `${(currentStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }}
                        />
                      </div>
                      {WORKFLOW_STEPS.map((step, index) => {
                        const done = index <= currentStep;
                        return (
                          <div key={step.key} className="relative z-10 flex flex-col items-center gap-2 flex-1">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                                done
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-400'
                              }`}
                            >
                              {done ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
                            </div>
                            <span
                              className={`text-[10px] text-center font-semibold leading-tight ${
                                done ? 'text-slate-900' : 'text-slate-400'
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Map of the stored coordinates */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    Stored complaint location
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {activeComplaint.location.lat.toFixed(5)}, {activeComplaint.location.lng.toFixed(5)}
                  </span>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  <InteractiveMap
                    complaints={[activeComplaint]}
                    hotspots={[]}
                    initialCenter={[activeComplaint.location.lat, activeComplaint.location.lng]}
                    initialZoom={16}
                    heightClass="h-[320px]"
                    enableControls={false}
                    showHotspotsToggle={false}
                  />
                </div>
              </div>

              {/* Evidence */}
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-600" />
                  Photographic evidence
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="block text-[11px] font-bold text-slate-600 mb-1.5">
                      Reported condition
                    </span>
                    {activeComplaint.imageUrl ? (
                      <a href={activeComplaint.imageUrl} target="_blank" rel="noreferrer">
                        <img
                          src={activeComplaint.imageUrl}
                          alt={`Reported condition for ${activeComplaint.ticketNumber}`}
                          className="w-full h-44 rounded-xl object-cover border border-slate-200"
                        />
                      </a>
                    ) : (
                      <div className="w-full h-44 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                        <Camera className="w-6 h-6 text-slate-300" />
                        No photo supplied
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold text-slate-600 mb-1.5">
                      Resolution evidence
                    </span>
                    {activeComplaint.resolutionImageUrl ? (
                      <a href={activeComplaint.resolutionImageUrl} target="_blank" rel="noreferrer">
                        <img
                          src={activeComplaint.resolutionImageUrl}
                          alt={`Resolution evidence for ${activeComplaint.ticketNumber}`}
                          className="w-full h-44 rounded-xl object-cover border border-emerald-200"
                        />
                      </a>
                    ) : (
                      <div className="w-full h-44 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                        <Clock className="w-6 h-6 text-slate-300" />
                        No resolution photo yet
                      </div>
                    )}
                  </div>
                </div>
                {activeComplaint.resolutionNotes && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block mb-1">
                      Resolution notes
                    </span>
                    <p className="text-xs text-emerald-900 leading-relaxed whitespace-pre-line">
                      {activeComplaint.resolutionNotes}
                    </p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Status timeline
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {sortedTimeline.length} recorded event{sortedTimeline.length === 1 ? '' : 's'}
                  </span>
                </div>

                {sortedTimeline.length === 0 ? (
                  <p className="text-xs text-slate-500">No timeline events have been recorded yet.</p>
                ) : (
                  <ol className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {sortedTimeline.map(event => (
                      <li key={event.id} className="relative">
                        <span className="absolute -left-[27px] top-1.5 w-4 h-4 rounded-full bg-white border-4 border-blue-600" />
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">{event.title}</span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {formatDateTime(event.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                            {event.description}
                          </p>
                          {event.note && event.note !== event.description && (
                            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2.5 text-xs text-blue-900">
                              <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                              {event.note}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 pt-0.5">
                            <span className="font-bold text-slate-700">{event.actor}</span>
                            <span>·</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-semibold">
                              {event.actorRole}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {canAddNote ? (
                  <form onSubmit={handleAddNote} className="pt-4 border-t border-slate-100 space-y-2">
                    <label htmlFor="track-note" className="block text-xs font-bold text-slate-700">
                      Add a follow-up note
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="track-note"
                        type="text"
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Share an update or additional observation"
                        maxLength={1500}
                        className="flex-1 text-xs rounded-xl border border-slate-300 p-3 focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={submittingNote || noteText.trim().length < 2}
                        className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        {submittingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Add note
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Notes are appended to the official timeline and cannot be edited or deleted.
                    </p>
                  </form>
                ) : (
                  <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">
                    {user
                      ? 'Only the citizen who filed this complaint, or municipal staff, can add a timeline note.'
                      : 'Sign in as the reporting citizen to add a follow-up note.'}
                  </p>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Latest update</h4>
                {latestEvent ? (
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-900">{latestEvent.title}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{latestEvent.description}</p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-600">{latestEvent.actor}</span>
                      <span>·</span>
                      <span>{formatDateTime(latestEvent.timestamp)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No updates recorded yet.</p>
                )}
              </div>

              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Community support</h4>
                <p className="text-3xl font-black text-slate-900 tabular-nums">
                  {activeComplaint.upvotes}
                  <span className="text-xs font-semibold text-slate-400 ml-1">upvotes</span>
                </p>
                {user ? (
                  <button
                    type="button"
                    onClick={handleUpvote}
                    disabled={voting}
                    className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 text-xs font-bold border border-blue-200 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {voting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                    Support this complaint
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors"
                  >
                    Sign in to support
                  </button>
                )}
                <p className="text-[11px] text-slate-400">
                  Upvotes are stored per signed-in account and can be toggled.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                  AI analysis
                </h4>
                {activeComplaint.aiStatus === 'completed' && activeComplaint.aiAnalysis ? (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <span className="text-slate-500">Category</span>
                      <strong className="text-slate-900">
                        {activeComplaint.aiAnalysis.classification.category.replace(/_/g, ' ')}
                        {` (${activeComplaint.aiAnalysis.classification.confidence}%)`}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <span className="text-slate-500">Priority score</span>
                      <strong className="text-slate-900">
                        {activeComplaint.aiAnalysis.priority.score}/100 · {activeComplaint.aiAnalysis.priority.urgencyLevel}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <span className="text-slate-500">Duplicate check</span>
                      <strong className="text-slate-900">
                        {activeComplaint.aiAnalysis.duplicate.isDuplicate
                          ? activeComplaint.duplicateOf
                            ? `Linked to ${activeComplaint.duplicateOf}`
                            : activeComplaint.aiAnalysis.duplicate.requiresAdminVerification
                              ? 'Possible match, needs review'
                              : 'Possible duplicate'
                          : 'No duplicate found'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Summary</span>
                      <p className="text-slate-700 leading-relaxed">{activeComplaint.aiAnalysis.summary}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Recommended action</span>
                      <p className="text-slate-700 leading-relaxed">
                        {activeComplaint.aiAnalysis.actionBrief.recommendedAction}
                      </p>
                    </div>
                    {activeComplaint.aiOverrides && Object.keys(activeComplaint.aiOverrides).length > 0 && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                        An administrator reviewed this AI result
                        {activeComplaint.aiOverrides.overriddenBy
                          ? ` (${activeComplaint.aiOverrides.overriddenBy})`
                          : ''}
                        .
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">
                      {activeComplaint.aiStatus === 'failed'
                        ? 'The AI analysis request failed. Municipal staff can still review the complaint manually.'
                        : 'This complaint has not been analysed by the AI service.'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      AI results are produced only by the configured Gemini backend; no values are fabricated here.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-900 text-white p-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Target resolution window
                  </span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-sm font-bold">
                  {formatDateTime(activeComplaint.targetResolutionDate)}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {['resolved', 'closed'].includes(activeComplaint.status)
                    ? 'This complaint has been resolved or closed.'
                    : new Date(activeComplaint.targetResolutionDate).getTime() < Date.now()
                      ? 'The target resolution time has passed.'
                      : 'The target time for municipal resolution.'}
                </p>
              </div>

              {!isOwner && user && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Only municipal staff can change the status, priority or department of a complaint. Citizens can
                    add notes and support a complaint.
                  </span>
                </div>
              )}

              {!user && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[11px] text-slate-600 space-y-2">
                  <p>Want to report your own issue?</p>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                  >
                    Sign in or create an account
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
