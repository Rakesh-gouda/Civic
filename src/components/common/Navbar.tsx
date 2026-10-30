import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, MapPin, PlusCircle, Search, LayoutDashboard, BarChart3, Users,
  FileText, PhoneCall, Menu, X, ShieldCheck, UserCheck, ChevronDown, LogOut,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Modal } from './Modal';
import { aiApi } from '../../services/api';

export const Navbar: React.FC = () => {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ configured: boolean; model: string } | null>(null);

  useEffect(() => {
    aiApi.health()
      .then(h => setAiStatus({ configured: h.aiConfigured, model: h.aiModel }))
      .catch(() => setAiStatus(null));
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
  }, [location.pathname]);

  const citizenNavItems = [
    { name: 'Home', path: '/', icon: <Building2 className="w-4 h-4" /> },
    { name: 'My Dashboard', path: '/citizen-dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { name: 'Report Issue', path: '/submit', icon: <PlusCircle className="w-4 h-4" /> },
    { name: 'Track Ticket', path: '/track', icon: <Search className="w-4 h-4" /> },
    { name: 'Complaint Map', path: '/map', icon: <MapPin className="w-4 h-4" /> },
  ];

  const authorityNavItems = [
    { name: 'Authority', path: '/authority-dashboard', icon: <ShieldCheck className="w-4 h-4" /> },
    { name: 'Complaints', path: '/complaints-table', icon: <FileText className="w-4 h-4" /> },
    { name: 'AI Analytics', path: '/analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { name: 'Departments', path: '/departments', icon: <Users className="w-4 h-4" /> },
    { name: 'Map', path: '/map', icon: <MapPin className="w-4 h-4" /> },
  ];

  const guestNavItems = [
    { name: 'Home', path: '/', icon: <Building2 className="w-4 h-4" /> },
    { name: 'Complaint Map', path: '/map', icon: <MapPin className="w-4 h-4" /> },
    { name: 'Track Complaint', path: '/track', icon: <Search className="w-4 h-4" /> },
  ];

  const navItems = user
    ? role === 'citizen' ? citizenNavItems : authorityNavItems
    : guestNavItems;

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
    setSigningOut(false);
    setProfileDropdownOpen(false);
    navigate('/login', { replace: true });
  };

  const dashboardPath = role === 'citizen' ? '/citizen-dashboard' : '/authority-dashboard';
  const roleLabel = role === 'admin' ? 'Administrator' : role === 'authority' ? 'Authority' : role === 'citizen' ? 'Citizen' : 'Guest';

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="bg-slate-900 text-slate-300 text-[11px] px-4 hidden md:block">
          <div className="max-w-7xl mx-auto flex items-center justify-between h-8">
            <div className="flex items-center gap-3">
              <span className="font-semibold tracking-wide text-slate-200">Civic reporting, geospatial insight and resolution</span>
              <span className="text-slate-600">|</span>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${aiStatus?.configured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {aiStatus ? (aiStatus.configured ? `Gemini connected (${aiStatus.model})` : 'AI not configured — manual triage') : 'Checking AI status…'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-slate-400">OpenStreetMap · Leaflet</span>
              <button
                onClick={() => setEmergencyModalOpen(true)}
                className="text-amber-400 hover:text-amber-300 font-semibold flex items-center"
              >
                <PhoneCall className="w-3.5 h-3.5 mr-1" />
                Emergency guidance
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900">
                    CIVICTRACK<span className="text-blue-600 ml-1">AI</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Smart City
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium hidden sm:block">
                  Geospatial civic intelligence & resolution
                </p>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center space-x-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  {item.name}
                </Link>
              ))}
            </nav>

            <div className="hidden sm:flex items-center space-x-3">
              <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700">
                {role === 'authority' || role === 'admin' ? (
                  <><ShieldCheck className="w-3.5 h-3.5 text-blue-600" /><span>{roleLabel} console</span></>
                ) : role === 'citizen' ? (
                  <><UserCheck className="w-3.5 h-3.5 text-emerald-600" /><span>Citizen</span></>
                ) : (
                  <><MapPin className="w-3.5 h-3.5 text-slate-500" /><span>Public access</span></>
                )}
              </div>

              {(!user || role === 'citizen') && (
                <Link
                  to="/submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Report Issue
                </Link>
              )}

              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                    aria-expanded={profileDropdownOpen}
                  >
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                        {user.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="text-left hidden md:block">
                      <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[130px]">{user.name}</p>
                      <p className="text-[10px] text-slate-500 truncate max-w-[130px]">{roleLabel}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>

                  {profileDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-xl py-2 z-50">
                      <div className="px-4 py-2 border-b border-slate-100">
                        <p className="text-xs font-bold text-slate-900">{user.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                          {user.badge || roleLabel}
                        </span>
                      </div>
                      <Link
                        to={dashboardPath}
                        onClick={() => setProfileDropdownOpen(false)}
                        className="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Open dashboard
                      </Link>
                      <button
                        onClick={handleLogout}
                        disabled={signingOut}
                        className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 disabled:opacity-60"
                      >
                        {signingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Sign in
                </Link>
              )}
            </div>

            <div className="flex lg:hidden items-center space-x-2">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Toggle navigation"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-5 space-y-2">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase">{roleLabel} navigation</span>
              {aiStatus && (
                <span className={`text-[10px] font-semibold ${aiStatus.configured ? 'text-emerald-600' : 'text-amber-600'}`}>
                  AI {aiStatus.configured ? 'ready' : 'not configured'}
                </span>
              )}
            </div>

            <div className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    isActive(item.path) ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  {item.name}
                </Link>
              ))}

              {(!user || role === 'citizen') && (
                <Link
                  to="/submit"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm mt-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  Report civic issue
                </Link>
              )}

              <div className="pt-3 border-t border-slate-100 space-y-1">
                {user ? (
                  <>
                    <Link
                      to={dashboardPath}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block text-center w-full py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold text-sm"
                    >
                      {user.name} · dashboard
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full py-2 rounded-lg text-rose-600 font-semibold text-sm border border-rose-200"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-center w-full py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold text-sm"
                  >
                    Login / Register
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <Modal
        isOpen={emergencyModalOpen}
        onClose={() => setEmergencyModalOpen(false)}
        title="Emergency guidance"
        subtitle="CIVICTRACK AI is a civic reporting platform, not an emergency service."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
            <PhoneCall className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-900 text-sm">Life-threatening emergency</h4>
              <p className="text-xs text-rose-700 mt-1">
                Call <strong className="font-mono text-sm">112</strong> immediately for exposed live cables, fire, gas leaks or a road collapse.
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            For non-emergency civic defects, submit a complaint with a photograph and GPS coordinates. Critical electrical
            hazards are routed to the Electrical Department with an 8-hour target. Helpline numbers shown in the
            demonstration database are illustrative and should be replaced with your municipality's published contacts.
          </p>
          <div className="flex justify-end">
            <button
              onClick={() => setEmergencyModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
