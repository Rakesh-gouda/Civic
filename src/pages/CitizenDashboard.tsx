import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  Search,
  MapPin,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ThumbsUp,
  Layers,
  ChevronRight,
  Menu,
  X,
  Mail,
  Phone,
  ShieldCheck,
  Loader2,
  Pencil,
  Camera,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useComplaints } from '../context/ComplaintContext';
import { useToast } from '../context/ToastContext';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { InteractiveMap } from '../components/map/InteractiveMap';
import { Complaint, ComplaintStatus } from '../types';

type SidebarTab = 'overview' | 'my-complaints' | 'nearby' | 'profile';

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected / duplicate',
};

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
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

export const CitizenDashboard: React.FC = () => {
  const { user, logout, updateProfile } = useAuth();
  const { complaints, hotspots, upvoteComplaint } = useComplaints();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SidebarTab>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [trackInput, setTrackInput] = useState('');
  const [votingId, setVotingId] = useState<string | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', ward: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const myComplaints = useMemo(() => {
    if (!user) return [];
    return complaints.filter(c => {
      if (c.citizenId) return c.citizenId === user.id;
      // Older records without an owner id fall back to the stored email.
      return Boolean(c.citizenEmail && c.citizenEmail.toLowerCase() === user.email.toLowerCase());
    });
  }, [complaints, user]);

  const openCount = myComplaints.filter(c => ['submitted', 'under_review'].includes(c.status)).length;
  const inProgressCount = myComplaints.filter(c => ['assigned', 'in_progress'].includes(c.status)).length;
  const resolvedCount = myComplaints.filter(c => ['resolved', 'closed'].includes(c.status)).length;
  const totalUpvotes = myComplaints.reduce((sum, c) => sum + c.upvotes, 0);

  const filteredMyComplaints = useMemo(() => {
    return myComplaints.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return (
          c.title.toLowerCase().includes(q) ||
          c.ticketNumber.toLowerCase().includes(q) ||
          c.location.address.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [myComplaints, statusFilter, searchTerm]);

  const ward = user?.ward || myComplaints[0]?.location.ward || '';
  const nearbyComplaints = useMemo(() => {
    const source = ward
      ? complaints.filter(c => c.location.ward === ward)
      : complaints;
    return source
      .filter(c => !myComplaints.some(mine => mine.id === c.id))
      .slice(0, 8);
  }, [complaints, myComplaints, ward]);

  const recentActivity = useMemo(() => {
    const events = myComplaints.flatMap(c =>
      c.timeline.map(event => ({ complaint: c, event })),
    );
    return events
      .sort((a, b) => new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime())
      .slice(0, 6);
  }, [myComplaints]);

  const handleUpvote = async (complaint: Complaint) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setVotingId(complaint.id);
    try {
      await upvoteComplaint(complaint.id);
      showToast(`Your support was recorded for ${complaint.ticketNumber}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not record your vote.', 'error');
    } finally {
      setVotingId(null);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      showToast('You have been signed out.', 'info');
      navigate('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleTrackSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackInput.trim()) return;
    navigate(`/track?id=${encodeURIComponent(trackInput.trim())}`);
  };

  const openProfileEditor = () => {
    if (!user) return;
    setProfileForm({ name: user.name, phone: user.phone || '', ward: user.ward || '' });
    setProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim()) {
      showToast('Your name cannot be empty.', 'error');
      return;
    }
    setProfileSaving(true);
    try {
      await updateProfile({
        name: profileForm.name.trim(),
        phone: profileForm.phone.trim() || undefined,
        ward: profileForm.ward.trim() || undefined,
      });
      showToast('Your profile was updated.', 'success');
      setProfileOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update your profile.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const navItems: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'my-complaints', label: 'My complaints', icon: <FileText className="w-4 h-4" /> },
    { id: 'nearby', label: 'Nearby issues', icon: <MapPin className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  ];

  const renderComplaintRow = (complaint: Complaint) => (
    <div
      key={complaint.id}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-200 transition-colors"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-blue-600">{complaint.ticketNumber}</span>
          <StatusBadge status={complaint.status} />
          <PriorityBadge priority={complaint.priority} />
        </div>
        <strong className="block text-sm text-slate-900 truncate">{complaint.title}</strong>
        <p className="text-[11px] text-slate-500 truncate">
          {complaint.location.address} · {formatDateTime(complaint.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => setSelectedComplaint(complaint)}
          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </button>
        <button
          type="button"
          onClick={() => navigate(`/track?id=${encodeURIComponent(complaint.ticketNumber)}`)}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5"
        >
          Track
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-100 min-h-screen flex flex-col lg:flex-row">
      {/* Mobile bar */}
      <div className="lg:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 sticky top-16 z-30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white"
            aria-label="Toggle dashboard navigation"
          >
            {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-bold text-sm">Citizen portal</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/submit')}
          className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold"
        >
          New complaint
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col justify-between p-4 border-r border-slate-800 transform lg:transform-none lg:static lg:w-64 transition-transform duration-200 ease-in-out ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-sm font-black flex-shrink-0">
              {initials(user?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-white truncate">{user?.name || 'Citizen'}</h4>
              <p className="text-[11px] text-blue-300 truncate font-semibold">
                {user?.ward || 'Ward not set'}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-1">
            {navItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === item.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}

            <div className="pt-3 mt-3 border-t border-slate-800 space-y-1">
              <button
                type="button"
                onClick={() => navigate('/submit')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <PlusCircle className="w-4 h-4 text-blue-400" />
                Submit complaint
              </button>
              <button
                type="button"
                onClick={() => navigate('/track')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Search className="w-4 h-4" />
                Track a complaint
              </button>
              <button
                type="button"
                onClick={() => navigate('/map')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Layers className="w-4 h-4" />
                Complaint map
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-60"
        >
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          Sign out
        </button>
      </aside>

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Overview */}
        {activeTab === 'overview' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Welcome back, {user?.name?.split(' ')[0] || 'citizen'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Your complaints and their live status, read directly from the municipal database.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/submit')}
                className="self-start sm:self-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                Report an issue
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'My complaints', value: myComplaints.length, icon: <FileText className="w-4 h-4" />, tone: 'bg-blue-50 text-blue-700' },
                { label: 'Awaiting review', value: openCount, icon: <Clock className="w-4 h-4" />, tone: 'bg-purple-50 text-purple-700' },
                { label: 'In progress', value: inProgressCount, icon: <AlertTriangle className="w-4 h-4" />, tone: 'bg-amber-50 text-amber-700' },
                { label: 'Resolved', value: resolvedCount, icon: <CheckCircle2 className="w-4 h-4" />, tone: 'bg-emerald-50 text-emerald-700' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {item.label}
                    </span>
                    <span className={`p-1.5 rounded-lg ${item.tone}`}>{item.icon}</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900 mt-2 tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">My recent complaints</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('my-complaints')}
                    className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    View all <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                {myComplaints.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center space-y-2">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-800">You have not filed a complaint yet</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Report a civic issue with a photo and your current location. A tracking ID is created
                      immediately.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/submit')}
                      className="mt-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                    >
                      Report an issue
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">{myComplaints.slice(0, 4).map(renderComplaintRow)}</div>
                )}
              </div>

              <div className="space-y-6">
                <div className="bg-slate-900 rounded-2xl p-5 text-white space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Track a complaint</h2>
                  <form onSubmit={handleTrackSearch} className="space-y-2">
                    <input
                      type="text"
                      value={trackInput}
                      onChange={e => setTrackInput(e.target.value)}
                      placeholder="CT-2026-881"
                      className="w-full text-xs rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-white placeholder:text-slate-500 font-mono focus:ring-2 focus:ring-blue-500"
                      aria-label="Ticket ID"
                    />
                    <button
                      type="submit"
                      disabled={!trackInput.trim()}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold"
                    >
                      Open tracking page
                    </button>
                  </form>
                  <p className="text-[11px] text-slate-400">
                    Every submitted complaint receives a unique ticket ID.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Community impact</h2>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 inline-flex items-center gap-1.5">
                      <ThumbsUp className="w-3.5 h-3.5" /> Upvotes received
                    </span>
                    <strong className="text-slate-900 text-lg tabular-nums">{totalUpvotes}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Your ward
                    </span>
                    <strong className="text-slate-900">{user?.ward || 'Not set'}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> Account role
                    </span>
                    <strong className="text-slate-900 capitalize">{user?.role || 'citizen'}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Latest activity on your complaints</h2>
              {recentActivity.length === 0 ? (
                <p className="text-xs text-slate-500">No status updates have been recorded yet.</p>
              ) : (
                <ol className="space-y-3">
                  {recentActivity.map(({ complaint, event }) => (
                    <li
                      key={`${complaint.id}-${event.id}`}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/track?id=${encodeURIComponent(complaint.ticketNumber)}`)}
                            className="text-xs font-bold text-blue-600 hover:underline"
                          >
                            {complaint.ticketNumber}
                          </button>
                          <span className="text-[11px] text-slate-400">{formatDateTime(event.timestamp)}</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800">{event.title}</p>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{event.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}

        {/* My complaints */}
        {activeTab === 'my-complaints' && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">My complaints</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {myComplaints.length} complaint{myComplaints.length === 1 ? '' : 's'} filed from this account.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search by ticket, title or address"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 py-2 px-3 text-xs font-semibold bg-white"
              >
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_LABELS) as ComplaintStatus[]).map(status => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            {filteredMyComplaints.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-2">
                <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                <h2 className="text-base font-bold text-slate-900">
                  {myComplaints.length === 0 ? 'No complaints filed yet' : 'No complaints match this filter'}
                </h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {myComplaints.length === 0
                    ? 'Submit an issue to start tracking its progress with the municipal departments.'
                    : 'Clear the search or choose another status to see more complaints.'}
                </p>
                {myComplaints.length === 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/submit')}
                    className="mt-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                  >
                    Report an issue
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">{filteredMyComplaints.map(renderComplaintRow)}</div>
            )}
          </>
        )}

        {/* Nearby */}
        {activeTab === 'nearby' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Nearby issues</h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  {ward
                    ? `Complaints stored in ${ward}.`
                    : 'Set your ward in your profile to narrow this view. All complaints are shown for now.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/map')}
                className="self-start sm:self-center px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                Full complaint map
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <InteractiveMap
                complaints={complaints}
                hotspots={hotspots}
                heightClass="h-[420px]"
                enableControls={false}
                showHotspotsToggle={false}
              />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h2 className="text-base font-bold text-slate-900">Other reports in your area</h2>
              {nearbyComplaints.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No other complaints are stored for this area yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {nearbyComplaints.map(c => (
                    <div
                      key={c.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-white"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-blue-600">{c.ticketNumber}</span>
                          <CategoryBadge category={c.category} showIcon={false} />
                          <PriorityBadge priority={c.priority} />
                          <StatusBadge status={c.status} />
                        </div>
                        <strong className="block text-xs text-slate-900 truncate mt-1">{c.title}</strong>
                        <p className="text-[11px] text-slate-500 truncate">{c.location.address}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpvote(c)}
                          disabled={votingId === c.id}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                        >
                          {votingId === c.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ThumbsUp className="w-3.5 h-3.5" />
                          )}
                          {c.upvotes}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/track?id=${encodeURIComponent(c.ticketNumber)}`)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold"
                        >
                          Track
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Profile */}
        {activeTab === 'profile' && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Profile</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Your account details as stored by the platform.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-black flex-shrink-0">
                    {initials(user?.name)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900 truncate">{user?.name}</h2>
                    <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                    {user?.badge && (
                      <span className="inline-flex mt-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {user.badge}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={openProfileEditor}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit profile
                </button>
              </div>

              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">Account details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Full name
                    </span>
                    <strong className="text-slate-800">{user?.name || '—'}</strong>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Email
                    </span>
                    <strong className="text-slate-800 inline-flex items-center gap-1.5 break-all">
                      <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      {user?.email || '—'}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Phone
                    </span>
                    <strong className="text-slate-800 inline-flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {user?.phone || 'Not provided'}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Ward
                    </span>
                    <strong className="text-slate-800 inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {user?.ward || 'Not set'}
                    </strong>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500 flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                  Passwords are stored as scrypt hashes on the server and are never returned to the browser. Email
                  addresses cannot be changed from this page.
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => navigate('/submit')}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Report an issue
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {loggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Complaint detail modal */}
      {selectedComplaint && (
        <Modal
          isOpen={!!selectedComplaint}
          onClose={() => setSelectedComplaint(null)}
          title={selectedComplaint.ticketNumber}
          subtitle={selectedComplaint.title}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={selectedComplaint.category} />
              <PriorityBadge priority={selectedComplaint.priority} />
              <StatusBadge status={selectedComplaint.status} />
            </div>

            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {selectedComplaint.description}
            </p>

            {selectedComplaint.imageUrl && (
              <img
                src={selectedComplaint.imageUrl}
                alt={`Evidence for ${selectedComplaint.ticketNumber}`}
                className="w-full h-40 rounded-xl object-cover border border-slate-200"
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  Location
                </span>
                <strong className="text-slate-800">{selectedComplaint.location.address}</strong>
                <p className="font-mono text-slate-500 mt-0.5">
                  {selectedComplaint.location.lat.toFixed(6)}, {selectedComplaint.location.lng.toFixed(6)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  Submitted
                </span>
                <strong className="text-slate-800">{formatDateTime(selectedComplaint.createdAt)}</strong>
                <p className="text-slate-500 mt-0.5">
                  Target {formatDateTime(selectedComplaint.targetResolutionDate)}
                </p>
              </div>
            </div>

            {selectedComplaint.aiStatus === 'completed' && selectedComplaint.aiAnalysis ? (
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-[11px] text-slate-700 space-y-1">
                <span className="font-bold text-slate-800 inline-flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-blue-600" />
                  AI summary
                </span>
                <p className="leading-relaxed">{selectedComplaint.aiAnalysis.summary}</p>
                <p className="text-slate-500">
                  Priority score {selectedComplaint.aiAnalysis.priority.score}/100 ·{' '}
                  {selectedComplaint.aiAnalysis.priority.urgencyLevel}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                This complaint has not been analysed by the AI service yet.
              </p>
            )}

            {selectedComplaint.resolutionNotes && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-[11px] text-emerald-900">
                <span className="font-bold block mb-0.5">Resolution notes</span>
                {selectedComplaint.resolutionNotes}
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleUpvote(selectedComplaint)}
                disabled={votingId === selectedComplaint.id}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {votingId === selectedComplaint.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ThumbsUp className="w-3.5 h-3.5" />
                )}
                Support ({selectedComplaint.upvotes})
              </button>
              <button
                type="button"
                onClick={() => navigate(`/track?id=${encodeURIComponent(selectedComplaint.ticketNumber)}`)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                Open full tracking page
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Profile edit modal */}
      {profileOpen && (
        <Modal
          isOpen={profileOpen}
          onClose={() => setProfileOpen(false)}
          title="Edit profile"
          subtitle="Update the contact details stored against your account."
          maxWidth="md"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Full name</label>
              <input
                type="text"
                value={profileForm.name}
                onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                maxLength={120}
                className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Phone (optional)</label>
              <input
                type="tel"
                value={profileForm.phone}
                onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                maxLength={40}
                className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ward (optional)</label>
              <input
                type="text"
                value={profileForm.ward}
                onChange={e => setProfileForm({ ...profileForm, ward: e.target.value })}
                maxLength={80}
                placeholder="For example: Ward 3 - Shivaji"
                className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Your email address ({user?.email}) is used to sign in and cannot be changed here.
            </p>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                disabled={profileSaving}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {profileSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save profile
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
