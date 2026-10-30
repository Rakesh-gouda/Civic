import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Users,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  MapPin,
  Sliders,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { useComplaints } from '../context/ComplaintContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/common/Modal';
import { Department } from '../types';

interface EditForm {
  name: string;
  headName: string;
  headEmail: string;
  phone: string;
  totalOfficers: string;
  activeFieldTeams: string;
  operatingZones: string;
}

function toForm(department: Department): EditForm {
  return {
    name: department.name,
    headName: department.headName,
    headEmail: department.headEmail,
    phone: department.phone,
    totalOfficers: String(department.totalOfficers),
    activeFieldTeams: String(department.activeFieldTeams),
    operatingZones: department.operatingZones.join(', '),
  };
}

export const DepartmentManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { departments, complaints, updateDepartment, refresh, loading } = useComplaints();
  const { user, isStaff } = useAuth();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.role === 'admin';

  const openComplaints = useMemo(
    () => complaints.filter(c => !['resolved', 'closed', 'rejected'].includes(c.status)),
    [complaints],
  );

  const workload = useMemo(() => {
    const map = new Map<string, number>();
    openComplaints.forEach(c => {
      if (c.departmentId) map.set(c.departmentId, (map.get(c.departmentId) || 0) + 1);
    });
    return map;
  }, [openComplaints]);

  const openEdit = (department: Department) => {
    setEditing(department);
    setForm(toForm(department));
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
    setForm(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      showToast('Department metrics refreshed from the database.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not refresh departments.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    if (!editing || !form || !isAdmin) return;
    if (!form.name.trim() || !form.headName.trim()) {
      showToast('Department name and head of department are required.', 'error');
      return;
    }

    const officers = Number(form.totalOfficers);
    const teams = Number(form.activeFieldTeams);
    if (!Number.isFinite(officers) || officers < 0 || !Number.isInteger(officers)) {
      showToast('Total officers must be a whole number of zero or more.', 'error');
      return;
    }
    if (!Number.isFinite(teams) || teams < 0 || !Number.isInteger(teams)) {
      showToast('Active field teams must be a whole number of zero or more.', 'error');
      return;
    }

    const operatingZones = form.operatingZones
      .split(',')
      .map(zone => zone.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      await updateDepartment(editing.id, {
        name: form.name.trim(),
        headName: form.headName.trim(),
        headEmail: form.headEmail.trim(),
        phone: form.phone.trim(),
        totalOfficers: officers,
        activeFieldTeams: teams,
        operatingZones,
      });
      showToast(`${form.name.trim()} was updated.`, 'success');
      setEditing(null);
      setForm(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The department could not be updated.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              Municipal structure
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
              Department management
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
              Workload, resolution time and SLA compliance are calculated from stored complaints. Contact details and
              team counts come from the department records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/authority-dashboard')}
              className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Authority dashboard
            </button>
          </div>
        </div>

        {!isStaff && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Department records are read-only for this account. An administrator can edit department details.
          </div>
        )}

        {isStaff && !isAdmin && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
            Contact information and workload are visible to all staff. Only administrators can change department
            records.
          </div>
        )}

        {/* Department cards */}
        {departments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-2">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
            <h2 className="text-base font-bold text-slate-900">No departments stored</h2>
            <p className="text-xs text-slate-500">
              The backend seeds five municipal departments on first start. Restart the server if this list is empty.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {departments.map(department => {
              const active = workload.get(department.id) ?? department.activeComplaints;
              return (
                <div
                  key={department.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                >
                  <div className="h-1.5" style={{ backgroundColor: department.color }} />
                  <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900 leading-snug">{department.name}</h2>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Category scope: <span className="font-semibold">{department.categoryCode === 'all' ? 'All categories' : department.categoryCode.replace(/_/g, ' ')}</span>
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-1 rounded border uppercase flex-shrink-0"
                        style={{
                          backgroundColor: `${department.color}15`,
                          color: department.color,
                          borderColor: `${department.color}40`,
                        }}
                      >
                        {active} active
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Resolved
                        </span>
                        <strong className="text-sm text-slate-900 tabular-nums">
                          {department.resolvedThisMonth}
                        </strong>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Avg time
                        </span>
                        <strong className="text-sm text-slate-900 tabular-nums">
                          {department.avgResolutionHours === null ? '—' : `${department.avgResolutionHours} h`}
                        </strong>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          SLA
                        </span>
                        <strong className="text-sm text-slate-900 tabular-nums">
                          {department.slaComplianceRate === null ? '—' : `${department.slaComplianceRate}%`}
                        </strong>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-500">SLA compliance</span>
                        <span className="font-bold text-slate-700">
                          {department.slaComplianceRate === null
                            ? 'No resolved records yet'
                            : `${department.slaComplianceRate}% of resolved complaints met target`}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${department.slaComplianceRate ?? 0}%`,
                            backgroundColor: department.color,
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600">
                      <p className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>
                          <strong className="text-slate-800">{department.headName}</strong> · head of department
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        {department.totalOfficers} officers · {department.activeFieldTeams} active field teams
                      </p>
                      <p className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">
                          {department.operatingZones.length ? department.operatingZones.join(', ') : 'No zones recorded'}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                      {department.headEmail ? (
                        <a
                          href={`mailto:${department.headEmail}`}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1.5"
                        >
                          <Mail className="w-3 h-3" />
                          Email head
                        </a>
                      ) : (
                        <span className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-400 text-[11px] font-bold inline-flex items-center gap-1.5">
                          <Mail className="w-3 h-3" />
                          No email stored
                        </span>
                      )}
                      {department.phone ? (
                        <a
                          href={`tel:${department.phone.replace(/\s+/g, '')}`}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1.5"
                        >
                          <Phone className="w-3 h-3" />
                          Call desk
                        </a>
                      ) : (
                        <span className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-400 text-[11px] font-bold inline-flex items-center gap-1.5">
                          <Phone className="w-3 h-3" />
                          No phone stored
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate('/complaints-table')}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold inline-flex items-center gap-1.5 border border-blue-200"
                      >
                        <ArrowRight className="w-3 h-3" />
                        Complaints
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => openEdit(department)}
                          className="ml-auto px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold inline-flex items-center gap-1.5"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 text-[11px] text-slate-500 flex items-start gap-2">
          <TrendingUp className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <span>
            Resolution time is measured from complaint creation to the moment it was resolved or closed. SLA compliance
            compares that duration against each complaint's target resolution date. Counts refresh whenever a complaint
            changes status, priority, department or assignment.
          </span>
        </div>
      </div>

      {/* Edit modal (admin only) */}
      {editing && form && (
        <Modal
          isOpen={!!editing}
          onClose={closeEdit}
          title={`Edit ${editing.name}`}
          subtitle="Changes are written to the department record in the database."
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  maxLength={120}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Head of department</label>
                <input
                  type="text"
                  value={form.headName}
                  onChange={e => setForm({ ...form, headName: e.target.value })}
                  maxLength={120}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Head email</label>
                <input
                  type="email"
                  value={form.headEmail}
                  onChange={e => setForm({ ...form, headEmail: e.target.value })}
                  maxLength={160}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Desk phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  maxLength={40}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Total officers</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.totalOfficers}
                  onChange={e => setForm({ ...form, totalOfficers: e.target.value })}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Active field teams</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.activeFieldTeams}
                  onChange={e => setForm({ ...form, activeFieldTeams: e.target.value })}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Operating zones</label>
                <input
                  type="text"
                  value={form.operatingZones}
                  onChange={e => setForm({ ...form, operatingZones: e.target.value })}
                  placeholder="Central Zone, East Zone"
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
                />
                <p className="text-[10px] text-slate-400 mt-1">Separate zones with commas.</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-500 flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
              Workload, resolution time and SLA compliance are derived from complaints and cannot be edited directly.
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save department
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
