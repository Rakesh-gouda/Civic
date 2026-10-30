import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText,
  Search,
  CheckCircle2,
  Eye,
  Layers,
  BrainCircuit,
  Loader2,
  AlertTriangle,
  Camera,
  Upload,
  X as XIcon,
  Building2,
  User,
  ArrowRight,
} from 'lucide-react';
import { useComplaints } from '../context/ComplaintContext';
import { useToast } from '../context/ToastContext';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import AIAnalysisPanel from '../components/ai/AIAnalysisPanel';
import { Complaint, ComplaintPriority, ComplaintStatus, AIAnalysisState } from '../types';
import { uploadImage } from '../services/api';

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

interface EditForm {
  status: ComplaintStatus | '';
  priority: ComplaintPriority;
  departmentId: string;
  assignedOfficer: string;
  note: string;
  resolutionNotes: string;
}

export const ComplaintManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    complaints,
    departments,
    updateComplaint,
    analyzeComplaintById,
    reviewAiDecision,
    getComplaintById,
    getDepartmentById,
  } = useComplaints();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [wardFilter, setWardFilter] = useState('all');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [aiState, setAiState] = useState<AIAnalysisState>({
    status: 'idle',
    result: null,
    error: null,
    overrides: {},
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [resolutionFile, setResolutionFile] = useState<File | null>(null);
  const [resolutionPreview, setResolutionPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeComplaint = activeId ? complaints.find(c => c.id === activeId) ?? null : null;

  const categories = useMemo(
    () => Array.from(new Set(complaints.map(c => c.category))).sort(),
    [complaints],
  );
  const wards = useMemo(
    () => Array.from(new Set(complaints.map(c => c.location.ward).filter(Boolean))).sort(),
    [complaints],
  );

  const filteredList = useMemo(() => {
    return complaints.filter(c => {
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (wardFilter !== 'all' && c.location.ward !== wardFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          c.title.toLowerCase().includes(q) ||
          c.location.address.toLowerCase().includes(q) ||
          c.ticketNumber.toLowerCase().includes(q) ||
          c.citizenName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [complaints, categoryFilter, priorityFilter, statusFilter, wardFilter, searchQuery]);

  const openReview = (complaint: Complaint) => {
    setActiveId(complaint.id);
    setForm({
      status: '',
      priority: complaint.priority,
      departmentId: complaint.departmentId,
      assignedOfficer: complaint.assignedOfficer || '',
      note: '',
      resolutionNotes: complaint.resolutionNotes || '',
    });
    setAiState({
      status: complaint.aiAnalysis ? 'success' : 'idle',
      result: complaint.aiAnalysis,
      error: null,
      overrides: complaint.aiOverrides || {},
    });
    setAiError(null);
    setBackupError(null);
    setResolutionFile(null);
    setResolutionPreview(complaint.resolutionImageUrl || null);
  };

  // Support /complaints-table?focus=TICKET from dashboards.
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    const match = getComplaintById(focus);
    if (match) {
      openReview(match);
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, complaints]);

  const closeReview = () => {
    if (saving || aiBusy) return;
    setActiveId(null);
    setForm(null);
    setResolutionFile(null);
    setResolutionPreview(null);
    setBackupError(null);
  };

  const setAiError = (value: string | null) => {
    setAiState(prev => ({ ...prev, error: value }));
  };

  const handleResolutionFile = (file: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      showToast('Resolution evidence must be a PNG, JPG or WEBP image.', 'error');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      showToast('Resolution evidence must be 6 MB or smaller.', 'error');
      return;
    }
    setResolutionFile(file);
    setResolutionPreview(URL.createObjectURL(file));
  };

  const handleRunAI = async () => {
    if (!activeComplaint) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const analysis = await analyzeComplaintById(activeComplaint.id);
      setAiState({ status: 'success', result: analysis, error: null, overrides: activeComplaint.aiOverrides || {} });
      showToast('AI analysis completed and saved to the complaint.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI analysis failed.';
      setAiState({ status: 'error', result: null, error: message, overrides: {} });
      showToast(message, 'error', 'AI unavailable');
    } finally {
      setAiBusy(false);
    }
  };

  const handlePersistOverrides = async (overrides: AIAnalysisState['overrides']) => {
    if (!activeComplaint) return;
    const payload: Parameters<typeof reviewAiDecision>[1] = {};
    if (overrides.categoryOverride) payload.categoryOverride = overrides.categoryOverride;
    if (overrides.priorityOverride) payload.priorityOverride = overrides.priorityOverride;
    if (overrides.duplicateRejected) payload.duplicateRejected = true;
    if (overrides.duplicateConfirmed) {
      const matched = activeComplaint.aiAnalysis?.duplicate.matchedTicketId;
      if (!matched) {
        showToast('There is no matched ticket to confirm.', 'error');
        return;
      }
      payload.duplicateConfirmed = true;
      payload.matchedTicketId = matched;
    }
    if (Object.keys(payload).length === 0) {
      showToast('Choose at least one AI override to save.', 'info');
      return;
    }
    setAiBusy(true);
    try {
      await reviewAiDecision(activeComplaint.id, payload);
      setAiState(prev => ({ ...prev, overrides }));
      showToast('AI review decision saved. The authenticated reviewer is recorded.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save the AI review.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleMergeDuplicate = async () => {
    if (!activeComplaint?.aiAnalysis?.duplicate.matchedTicketId) return;
    setAiBusy(true);
    try {
      await reviewAiDecision(activeComplaint.id, {
        duplicateConfirmed: true,
        matchedTicketId: activeComplaint.aiAnalysis.duplicate.matchedTicketId,
        merge: true,
        note: `Confirmed duplicate of ${activeComplaint.aiAnalysis.duplicate.matchedTicketId}.`,
      });
      showToast('Duplicate confirmed and this ticket was rejected.', 'success');
      closeReview();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not merge the duplicate.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSave = async () => {
    if (!activeComplaint || !form) return;
    setBackupError(null);

    const nextStatus = form.status || undefined;
    if (nextStatus === 'resolved') {
      const hasNote = Boolean(form.note.trim() || form.resolutionNotes.trim());
      const hasEvidence = Boolean(resolutionFile || resolutionPreview || activeComplaint.resolutionImageUrl);
      if (!hasNote || !hasEvidence) {
        showToast(
          'A resolution note and a resolution photograph are required before resolving a complaint.',
          'error',
          'Evidence required',
        );
        return;
      }
    }

    setSaving(true);
    try {
      let resolutionImageUrl: string | undefined;
      if (resolutionFile) resolutionImageUrl = await uploadImage(resolutionFile);

      const payload: Parameters<typeof updateComplaint>[1] = {};
      if (nextStatus && nextStatus !== activeComplaint.status) payload.status = nextStatus;
      if (form.priority !== activeComplaint.priority) payload.priority = form.priority;
      if (form.departmentId !== activeComplaint.departmentId) payload.departmentId = form.departmentId;
      if (form.assignedOfficer.trim() !== (activeComplaint.assignedOfficer || '')) {
        payload.assignedOfficer = form.assignedOfficer.trim();
      }
      if (form.note.trim()) payload.note = form.note.trim();
      if (form.resolutionNotes.trim()) payload.resolutionNotes = form.resolutionNotes.trim();
      if (resolutionImageUrl) payload.resolutionImageUrl = resolutionImageUrl;

      if (Object.keys(payload).length === 0) {
        showToast('No changes were selected.', 'info');
        return;
      }

      await updateComplaint(activeComplaint.id, payload);
      showToast(`Ticket ${activeComplaint.ticketNumber} updated.`, 'success');
      setActiveId(null);
      setForm(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The complaint could not be updated.';
      setBackupError(message);
      showToast(message, 'error', 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = activeComplaint
    ? [activeComplaint.status, ...STATUS_TRANSITIONS[activeComplaint.status]].filter(
        (value, index, array) => array.indexOf(value) === index,
      )
    : [];

  return (
    <div className="bg-slate-50 min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Authority workflow
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
              Complaint management
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              Review evidence and AI output, override mistakes, assign a department and officer, and move each complaint
              through the permitted status transitions.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">
            Showing {filteredList.length} of {complaints.length} complaints
          </span>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search ticket, address, citizen..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs font-semibold bg-white"
            >
              <option value="all">All categories</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category.replace(/_/g, ' ')}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs font-semibold bg-white"
            >
              <option value="all">All priorities</option>
              {PRIORITIES.map(priority => (
                <option key={priority} value={priority}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs font-semibold bg-white"
            >
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_LABELS) as ComplaintStatus[]).map(status => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>

            <select
              value={wardFilter}
              onChange={e => setWardFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 py-2 px-3 text-xs font-semibold bg-white"
            >
              <option value="all">All wards</option>
              {wards.map(ward => (
                <option key={ward} value={ward}>
                  {ward}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Ticket</th>
                  <th className="py-3.5 px-4">Complaint</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4">AI</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 px-4 text-center text-slate-500">
                      No complaints match these filters.
                    </td>
                  </tr>
                ) : (
                  filteredList.map(c => {
                    const department = getDepartmentById(c.departmentId);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-600 whitespace-nowrap">
                          {c.ticketNumber}
                        </td>

                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="flex items-center gap-3">
                            {c.imageUrl ? (
                              <img
                                src={c.imageUrl}
                                alt=""
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-200"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                <Camera className="w-4 h-4 text-slate-300" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <strong className="text-slate-900 block truncate">{c.title}</strong>
                              <span className="text-[11px] text-slate-500 block truncate">{c.location.address}</span>
                            </div>
                          </div>
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

                        <td className="py-3.5 px-4 max-w-[160px]">
                          <span className="text-slate-700 truncate block">
                            {department?.name || 'Unassigned'}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate block">
                            {c.assignedOfficer || 'No officer'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {c.aiStatus === 'completed' && c.aiAnalysis ? (
                            <div className="space-y-0.5">
                              <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                                {c.aiAnalysis.priority.score}/100
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                {c.aiAnalysis.classification.confidence}% category
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {c.aiStatus === 'failed' ? 'Failed' : 'Not analysed'}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openReview(c)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-colors"
                            >
                              Review
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/track?id=${c.ticketNumber}`)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Open public tracking page"
                            >
                              <Eye className="w-4 h-4" />
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
      {activeComplaint && form && (
        <Modal
          isOpen={!!activeComplaint}
          onClose={closeReview}
          title={`Review ${activeComplaint.ticketNumber}`}
          subtitle={activeComplaint.title}
          maxWidth="4xl"
        >
          <div className="space-y-5">
            {/* Evidence and summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                {activeComplaint.imageUrl ? (
                  <a href={activeComplaint.imageUrl} target="_blank" rel="noreferrer">
                    <img
                      src={activeComplaint.imageUrl}
                      alt={`Citizen evidence for ${activeComplaint.ticketNumber}`}
                      className="w-full h-44 rounded-xl object-cover border border-slate-200"
                    />
                  </a>
                ) : (
                  <div className="w-full h-44 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                    <Camera className="w-6 h-6 text-slate-300" />
                    No citizenship photo supplied
                  </div>
                )}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
                  <p><strong className="text-slate-800">Location:</strong> {activeComplaint.location.address}</p>
                  <p className="font-mono">{activeComplaint.location.lat.toFixed(6)}, {activeComplaint.location.lng.toFixed(6)}</p>
                  <p><strong className="text-slate-800">Ward:</strong> {activeComplaint.location.ward}</p>
                  <p><strong className="text-slate-800">Citizen:</strong> {activeComplaint.citizenName}</p>
                  <p><strong className="text-slate-800">Target:</strong> {new Date(activeComplaint.targetResolutionDate).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={activeComplaint.category} />
                  <PriorityBadge priority={activeComplaint.priority} />
                  <StatusBadge status={activeComplaint.status} />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-line">
                  {activeComplaint.description}
                </p>
                <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {getDepartmentById(activeComplaint.departmentId)?.name || 'Unassigned department'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {activeComplaint.assignedOfficer || 'No officer assigned'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {activeComplaint.upvotes} upvotes
                  </span>
                </div>
                {activeComplaint.duplicateOf && (
                  <p className="text-[11px] rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">
                    This complaint is currently linked as a duplicate of <strong>{activeComplaint.duplicateOf}</strong>.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/track?id=${activeComplaint.ticketNumber}`)}
                  className="text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Open public tracking page <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* AI review */}
            <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <BrainCircuit className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800">AI analysis &amp; administrator review</span>
                </div>
                <button
                  type="button"
                  onClick={handleRunAI}
                  disabled={aiBusy}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 transition-colors"
                >
                  {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BrainCircuit className="w-3.5 h-3.5" />}
                  {activeComplaint.aiStatus === 'completed' ? 'Re-run AI analysis' : 'Run AI analysis'}
                </button>
              </div>

              {aiState.status === 'error' && aiState.error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{aiState.error}</span>
                </div>
              )}

              {aiState.status === 'success' && aiState.result ? (
                <div className="bg-white rounded-xl p-1">
                  <AIAnalysisPanel
                    analysisState={aiState}
                    isAdmin={true}
                    onOverride={handlePersistOverrides}
                  />
                  {aiState.result.duplicate.isDuplicate && aiState.result.duplicate.matchedTicketId && (
                    <div className="border-t border-slate-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-600">
                        Confirmed duplicate of <strong>{aiState.result.duplicate.matchedTicketId}</strong>? Merging rejects
                        this ticket and links it to the master complaint.
                      </p>
                      <button
                        type="button"
                        onClick={handleMergeDuplicate}
                        disabled={aiBusy}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-60 flex-shrink-0"
                      >
                        Confirm &amp; merge duplicate
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  {activeComplaint.aiStatus === 'failed'
                    ? 'The last AI request failed. You can retry, or review this complaint manually.'
                    : 'No AI result is stored yet. Run the analysis to classify the complaint, check duplicates and score its priority.'}
                </p>
              )}

              <p className="text-[11px] text-slate-500">
                AI output comes only from the configured Gemini backend. If the key is missing, the server returns an
                explicit error instead of inventing a result.
              </p>
            </div>

            {/* Workflow form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as ComplaintStatus | '' })}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 bg-white"
                >
                  <option value="">Keep current ({STATUS_LABELS[activeComplaint.status]})</option>
                  {statusOptions
                    .filter(status => status !== activeComplaint.status)
                    .map(status => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Only transitions allowed by the workflow are listed.
                </p>
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
                  placeholder="Officer or field team"
                  maxLength={120}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Review note {form.status === 'resolved' && <span className="text-rose-600">(required)</span>}
                </label>
                <textarea
                  rows={3}
                  value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="Explain the decision, inspection outcome or work performed."
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Resolution notes (visible to the citizen)
                </label>
                <textarea
                  rows={2}
                  value={form.resolutionNotes}
                  onChange={e => setForm({ ...form, resolutionNotes: e.target.value })}
                  placeholder="Summary of the completed work."
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Resolution evidence photograph
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="w-full sm:w-40 h-28 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {resolutionPreview ? (
                      <img src={resolutionPreview} alt="Resolution preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-400">No evidence photo</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => handleResolutionFile(e.target.files?.[0] || null)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Choose evidence photo
                    </button>
                    {resolutionPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setResolutionFile(null);
                          setResolutionPreview(activeComplaint.resolutionImageUrl || null);
                        }}
                        className="ml-2 px-2 py-2 text-[11px] font-bold text-slate-500 hover:text-rose-600 inline-flex items-center gap-1"
                      >
                        <XIcon className="w-3 h-3" />
                        Clear
                      </button>
                    )}
                    <p className="text-[10px] text-slate-400">PNG, JPG or WEBP, max 6 MB.</p>
                  </div>
                </div>
              </div>
            </div>

            {backupError && (
              <p className="text-xs rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">{backupError}</p>
            )}

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
                onClick={handleSave}
                disabled={saving || aiBusy}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save &amp; sign off
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
