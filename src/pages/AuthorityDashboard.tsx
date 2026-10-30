import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  TrendingUp,
  FileText,
  ChevronRight,
  Loader2,
  Building2,
  MapPin,
  Camera,
  RefreshCw,
  Layers,
  CircleDot,
} from 'lucide-react';
import { useComplaints } from '../context/ComplaintContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import {
  Complaint,
  ComplaintPriority,
  ComplaintStatus,
} from '../types';

const STATUS_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  submitted: ['under_review', 'assigned', 'rejected'],
  under_review: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['resolved'],
  resolved: ['closed'],
  closed: [],
  rejected: ['under_review'],
};

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected / duplicate',
};

const PRIORITIES: ComplaintPriority[] = ['low', 'medium', 'high', 'critical'];

interface ReviewForm {
  status: ComplaintStatus | '';
  priority: ComplaintPriority;
  departmentId: string;
  assignedOfficer: string;
  note: string;
  resolutionNotes: string;
}

export const AuthorityDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    complaints,
    departments,
    stats,
    loading,
    error,
    refresh,
    updateComplaint,
    updateStatus,
    analyzeComplaintById,
    reviewAiDecision,
    getDepartmentById,
  } = useComplaints();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [triageFilter, setTriageFilter] = useState('all');
  const [reviewing, setReviewing] = useState<Complaint | null>(null);
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const activeComplaints = useMemo(
    () => complaints.filter(c => !['resolved', 'closed', 'rejected'].includes(c.status)),
    [complaints],
  );
  const criticalComplaints = useMemo(
    () => activeComplaints.filter(c => c.priority === 'critical'),
    [activeComplaints],
  );

  const filteredQueue = useMemo(() => {
    return activeComplaints.filter(c => {
      if (triageFilter === 'all') return true;
      if (triageFilter === 'critical') return c.priority === 'critical';
      if (triageFilter === 'overdue') return new Date(c.targetResolutionDate).getTime() < Date.now();
      return c.category === triageFilter;
    });
  }, [activeComplaints, triageFilter]);

  const openReview = (complaint: Complaint) => {
    setReviewing(complaint);
    setAiError(null);
    setForm({
      status: '',
      priority: complaint.priority,
      departmentId: complaint.departmentId,
      assignedOfficer: complaint.assignedOfficer || '',
      note: '',
      resolutionNotes: '',
    });
  };

  const closeReview = () => {
    if (saving || aiBusy) return;
    setReviewing(null);
    setForm(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      showToast('Dashboard data refreshed from the database.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not refresh.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveReview = async () => {
    if (!reviewing || !form) return;

    const nextStatus = form.status || undefined;
    const wantsResolve = nextStatus === 'resolved';
    if (wantsResolve && !form.note.trim() && !form.resolutionNotes.trim() && !reviewing.resolutionImageUrl) {
      showToast(
        'Add a resolution note or upload resolution evidence before resolving this complaint.',
        'error',
        'Resolution evidence required',
      );
      return;
    }

    const payload: Parameters<typeof updateComplaint>[1] = {};
    if (nextStatus && nextStatus !== reviewing.status) payload.status = nextStatus;
    if (form.priority !== reviewing.priority) payload.priority = form.priority;
    if (form.departmentId && form.departmentId !== reviewing.departmentId) payload.departmentId = form.departmentId;
    if (form.assignedOfficer.trim() !== (reviewing.assignedOfficer || '')) {
      payload.assignedOfficer = form.assignedOfficer.trim();
    }
    if (form.note.trim()) payload.note = form.note.trim();
    if (form.resolutionNotes.trim()) payload.resolutionNotes = form.resolutionNotes.trim();

    if (Object.keys(payload).length === 0) {
      showToast('No changes were selected.', 'info');
      return;
    }

    setSaving(true);
    try {
      await updateComplaint(reviewing.id, payload);
      showToast(`Ticket ${reviewing.ticketNumber} updated. Citizens will see the new status and timeline.`, 'success');
      setReviewing(null);
      setForm(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The complaint could not be updated.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRunAi = async () => {
    if (!reviewing) return;
    setAiBusy(true);
    setAiError(null);
    try {
      await analyzeComplaintById(reviewing.id);
      const updated = complaints.find(c => c.id === reviewing.id);
      if (updated) setReviewing(updated);
      showToast('AI analysis completed and stored with the complaint.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI analysis failed.';
      setAiError(message);
      showToast(message, 'error', 'AI unavailable');
    } finally {
      setAiBusy(false);
    }
  };

  const handleApplyAi = async () => {
    if (!reviewing?.aiAnalysis) return;
    setAiBusy(true);
    try {
      await reviewAiDecision(reviewing.id, {
        categoryOverride: reviewing.aiAnalysis.classification.category,
        priorityOverride: reviewing.aiAnalysis.priority.urgencyLevel,
        note: 'Administrator accepted the AI classification and priority.',
      });
      showToast('AI classification and priority were applied.', 'success');
      setReviewing(null);
      setForm(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not apply the AI result.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleRejectDuplicate = async () => {
    if (!reviewing) return;
    setAiBusy(true);
    try {
      await reviewAiDecision(reviewing.id, {
        duplicateRejected: true,
        note: 'Administrator rejected the AI duplicate flag.',
      });
      showToast('The duplicate flag was rejected. The complaint remains unique.', 'success');
      setReviewing(null);
      setForm(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update the duplicate flag.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleConfirmDuplicate = async () => {
    if (!reviewing?.aiAnalysis?.duplicate.matchedTicketId) return;
    setAiBusy(true);
    try {
      await reviewAiDecision(reviewing.id, {
        duplicateConfirmed: true,
        matchedTicketId: reviewing.aiAnalysis.duplicate.matchedTicketId,
        merge: true,
        note: `Administrator confirmed this complaint duplicates ${reviewing.aiAnalysis.duplicate.matchedTicketId}.`,
      });
      showToast('Duplicate confirmed and this ticket was rejected.', 'success');
      setReviewing(null);
      setForm(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not confirm the duplicate.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleAdvance = async (complaint: Complaint) => {
    const next = STATUS_TRANSITIONS[complaint.status][0];
    if (!next) return;
    try {
      await updateStatus(complaint.id, next, `Status moved to ${STATUS_LABELS[next]} from the authority dashboard.`);
      showToast(`Ticket ${complaint.ticketNumber} moved to ${STATUS_LABELS[next]}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not change the status.', 'error');
    }
  };

  const statusOptions = reviewing
    ? [reviewing.status, ...STATUS_TRANSITIONS[reviewing.status]].filter(
        (value, index, array) => array.indexOf(value) === index,
      )
    : [];

  return (
    <div className="bg-slate-50 min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="bg-slate-900 rounded-2xl text-white p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Municipal authority dashboard
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Signed in as <strong className="text-white">{user?.name}</strong>
                  {user?.role ? ` · ${user.role === 'admin' ? 'Administrator' : 'Authority officer'}` : ''}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  All figures and complaints on this page are read from the local database.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
              <button
                type="button"
                onClick={() => navigate('/analytics')}
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs inline-flex items-center gap-1.5"
              >
                <TrendingUp className="w-3.5 h-3.5 text-blue-300" />
                Analytics
              </button>
              <button
                type="button"
                onClick={() => navigate('/complaints-table')}
                className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                Complaint management
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            {error}
          </div>
        )}

        {stats?.demoData && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            These figures include seeded demonstration complaints. They are real database rows, not live municipal data.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            title="Total"
            value={loading || !stats ? '…' : stats.total}
            subtitle="All stored complaints"
            icon={<FileText className="w-5 h-5 text-blue-600" />}
            accentColor="blue"
          />
          <StatCard
            title="Critical"
            value={loading || !stats ? '…' : stats.critical}
            subtitle="Active critical hazards"
            icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
            accentColor="rose"
          />
          <StatCard
            title="Pending"
            value={loading || !stats ? '…' : stats.pending}
            subtitle="Submitted or under review"
            icon={<CircleDot className="w-5 h-5 text-purple-600" />}
            accentColor="purple"
          />
          <StatCard
            title="In progress"
            value={loading || !stats ? '…' : stats.inProgress}
            subtitle="Assigned or field work"
            icon={<Clock className="w-5 h-5 text-amber-600" />}
            accentColor="amber"
          />
          <StatCard
            title="Resolved"
            value={loading || !stats ? '…' : stats.resolved}
            subtitle={stats ? `${stats.resolvedRate}% resolution rate` : 'Resolved or closed'}
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            accentColor="emerald"
          />
          <StatCard
            title="Overdue"
            value={loading || !stats ? '…' : stats.overdue}
            subtitle="Past target date, still open"
            icon={<Clock className="w-5 h-5 text-slate-700" />}
            accentColor="navy"
          />
        </div>

        {/* Critical alert */}
        {criticalComplaints.length > 0 && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-xl bg-rose-600 text-white flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                  {criticalComplaints.length} active critical complaint{criticalComplaints.length === 1 ? '' : 's'}
                </h2>
                <p className="text-xs text-rose-800 mt-0.5">
                  Latest: <strong>{criticalComplaints[0].title}</strong> · {criticalComplaints[0].location.address}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openReview(criticalComplaints[0])}
              className="self-start sm:self-center px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
            >
              Review critical complaint
            </button>
          </div>
        )}

        {/* Department workload */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Department workload</h2>
              <p className="text-xs text-slate-500">Live counts and resolution metrics calculated from complaints.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/departments')}
              className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              Manage departments <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {departments.length === 0 ? (
            <p className="text-xs text-slate-500">No departments are stored.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {departments.map(dept => (
                <div key={dept.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{dept.name}</h3>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase flex-shrink-0"
                      style={{ backgroundColor: `${dept.color}15`, color: dept.color, borderColor: `${dept.color}40` }}
                    >
                      {dept.activeComplaints} active
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-1">
                    <p>Head: <strong className="text-slate-800">{dept.headName}</strong></p>
                    <p>Field teams: <strong className="text-slate-800">{dept.activeFieldTeams}</strong></p>
                    <p>
                      Avg resolution:{' '}
                      <strong className="text-slate-800">
                        {dept.avgResolutionHours === null ? 'No resolved data' : `${dept.avgResolutionHours} h`}
                      </strong>
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-500">SLA compliance</span>
                      <strong className="text-slate-800">
                        {dept.slaComplianceRate === null ? '—' : `${dept.slaComplianceRate}%`}
                      </strong>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${dept.slaComplianceRate ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Triage queue */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Open complaint queue</h2>
              <p className="text-xs text-slate-500">
                Review evidence, AI output, priority, department and status. {filteredQueue.length} shown.
              </p>
            </div>
            <select
              value={triageFilter}
              onChange={e => setTriageFilter(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            >
              <option value="all">All open complaints</option>
              <option value="critical">Critical priority</option>
              <option value="overdue">Past target date</option>
              <option value="pothole">Pothole &amp; surface</option>
              <option value="road_damage">Road damage</option>
              <option value="drainage">Drainage</option>
              <option value="waterlogging">Waterlogging</option>
              <option value="garbage">Garbage</option>
              <option value="streetlight">Streetlight</option>
              <option value="electrical_hazard">Electrical hazard</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Complaint</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">AI</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 px-4 text-center text-slate-500">
                      No open complaints match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map(c => {
                    const next = STATUS_TRANSITIONS[c.status][0];
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-600 whitespace-nowrap">
                          {c.ticketNumber}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <strong className="text-slate-900 block truncate">{c.title}</strong>
                          <span className="text-[11px] text-slate-500 block truncate">{c.location.address}</span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <CategoryBadge category={c.category} showIcon={false} />
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <PriorityBadge priority={c.priority} />
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {c.aiStatus === 'completed' && c.aiAnalysis ? (
                            <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {c.aiAnalysis.priority.score}/100
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {c.aiStatus === 'failed' ? 'Failed' : 'Not analysed'}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {next && (
                              <button
                                type="button"
                                onClick={() => handleAdvance(c)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-200"
                                title={`Move to ${STATUS_LABELS[next]}`}
                              >
                                {STATUS_LABELS[next]}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openReview(c)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px]"
                            >
                              Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Review modal */}
      {reviewing && form && (
        <Modal
          isOpen={!!reviewing}
          onClose={closeReview}
          title={`Review ${reviewing.ticketNumber}`}
          subtitle={reviewing.title}
          maxWidth="4xl"
        >
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                {reviewing.imageUrl ? (
                  <a href={reviewing.imageUrl} target="_blank" rel="noreferrer">
                    <img
                      src={reviewing.imageUrl}
                      alt={`Evidence for ${reviewing.ticketNumber}`}
                      className="w-full h-48 rounded-xl object-cover border border-slate-200"
                    />
                  </a>
                ) : (
                  <div className="w-full h-48 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                    <Camera className="w-6 h-6 text-slate-300" />
                    No photo supplied
                  </div>
                )}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
                  <p className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>{reviewing.location.address}</span>
                  </p>
                  <p className="font-mono">
                    {reviewing.location.lat.toFixed(6)}, {reviewing.location.lng.toFixed(6)}
                  </p>
                  <p>Reported by {reviewing.citizenName}</p>
                  <p>Target {new Date(reviewing.targetResolutionDate).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={reviewing.category} />
                  <PriorityBadge priority={reviewing.priority} />
                  <StatusBadge status={reviewing.status} />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed max-h-28 overflow-y-auto">
                  {reviewing.description}
                </p>

                <button
                  type="button"
                  onClick={() => navigate(`/track?id=${reviewing.ticketNumber}`)}
                  className="text-[11px] font-bold text-blue-600 hover:underline"
                >
                  Open public tracking page →
                </button>

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-blue-600" />
                      AI result
                    </span>
                    <button
                      type="button"
                      onClick={handleRunAi}
                      disabled={aiBusy}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      {aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {reviewing.aiStatus === 'completed' ? 'Re-run analysis' : 'Run analysis'}
                    </button>
                  </div>

                  {aiError && (
                    <p className="text-[11px] rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-800">
                      {aiError}
                    </p>
                  )}

                  {reviewing.aiStatus === 'completed' && reviewing.aiAnalysis ? (
                    <div className="space-y-2 text-[11px] text-slate-700">
                      <p>
                        <strong>Category:</strong>{' '}
                        {reviewing.aiAnalysis.classification.category.replace(/_/g, ' ')} (
                        {reviewing.aiAnalysis.classification.confidence}% confidence)
                      </p>
                      <p>
                        <strong>Priority score:</strong> {reviewing.aiAnalysis.priority.score}/100 (
                        {reviewing.aiAnalysis.priority.urgencyLevel})
                      </p>
                      <p>
                        <strong>Duplicate:</strong>{' '}
                        {reviewing.aiAnalysis.duplicate.isDuplicate
                          ? `${reviewing.aiAnalysis.duplicate.matchedTicketId || 'possible match'} — ${reviewing.aiAnalysis.duplicate.reasoning}`
                          : 'No duplicate identified.'}
                      </p>
                      <p className="italic">“{reviewing.aiAnalysis.summary}”</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleApplyAi}
                          disabled={aiBusy}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-60"
                        >
                          Apply AI category &amp; priority
                        </button>
                        {reviewing.aiAnalysis.duplicate.isDuplicate && (
                          <button
                            type="button"
                            onClick={handleRejectDuplicate}
                            disabled={aiBusy}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-60"
                          >
                            Reject duplicate flag
                          </button>
                        )}
                        {reviewing.aiAnalysis.duplicate.isDuplicate &&
                          reviewing.aiAnalysis.duplicate.requiresAdminVerification &&
                          reviewing.aiAnalysis.duplicate.matchedTicketId && (
                            <button
                              type="button"
                              onClick={handleConfirmDuplicate}
                              disabled={aiBusy}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-60"
                            >
                              Confirm duplicate &amp; reject ticket
                            </button>
                          )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      {reviewing.aiStatus === 'failed'
                        ? 'The AI request failed. Review the complaint manually or retry.'
                        : 'No AI result is stored for this complaint yet.'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as ComplaintStatus | '' })}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 bg-white"
                >
                  <option value="">Keep current ({STATUS_LABELS[reviewing.status]})</option>
                  {statusOptions
                    .filter(status => status !== reviewing.status)
                    .map(status => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value as ComplaintPriority })}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 bg-white"
                >
                  {PRIORITIES.map(priority => (
                    <option key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <select
                  value={form.departmentId}
                  onChange={e => setForm({ ...form, departmentId: e.target.value })}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 bg-white"
                >
                  <option value="">Unassigned</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Responsible officer</label>
                <input
                  type="text"
                  value={form.assignedOfficer}
                  onChange={e => setForm({ ...form, assignedOfficer: e.target.value })}
                  placeholder="Officer or field team name"
                  maxLength={120}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Review note {form.status === 'resolved' && <span className="text-rose-600">(required to resolve)</span>}
                </label>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="Describe the decision, inspection result or work performed."
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Resolution notes (stored on the complaint)
                </label>
                <textarea
                  rows={2}
                  value={form.resolutionNotes}
                  onChange={e => setForm({ ...form, resolutionNotes: e.target.value })}
                  placeholder="Optional summary of the completed work shown to citizens."
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Resolution evidence photographs can be uploaded from the complaint management page. The server records the
              authenticated reviewer and timestamp for every change.
            </p>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeReview}
                disabled={saving || aiBusy}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={saving || aiBusy}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save review
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
