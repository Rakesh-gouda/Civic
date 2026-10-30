import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MapPin, ShieldCheck, UserCheck, Lock, Mail, User, Phone,
  ArrowRight, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../services/api';

type RoleMode = 'citizen' | 'authority';

interface AuthPageProps {
  initialMode?: 'login' | 'register';
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'login' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();
  const { showToast } = useToast();

  const [authMode, setAuthMode] = useState<'login' | 'register'>(initialMode);
  const [roleMode, setRoleMode] = useState<RoleMode>('citizen');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [ward, setWard] = useState('Ward 3 - Shivaji Central');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const redirectAfterLogin = (role?: string) => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) return navigate(from, { replace: true });
    if (role === 'authority' || role === 'admin') return navigate('/authority-dashboard', { replace: true });
    return navigate('/citizen-dashboard', { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (authMode === 'register' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (authMode === 'login' && (!email || !password)) {
      setError('Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      if (authMode === 'register') {
        const user = await register({ name, email, password, phone, ward });
        showToast(`Welcome, ${user.name}. Your citizen account is ready.`, 'success', 'Registration complete');
        redirectAfterLogin(user.role);
      } else {
        const user = await login(email, password);
        showToast(`Signed in as ${user.name}.`, 'success', 'Welcome back');
        redirectAfterLogin(user.role);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Sign in failed. Please retry.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async (role: RoleMode) => {
    setError('');
    setBusy(true);
    try {
      const credentials = role === 'citizen'
        ? { email: 'citizen@demo.civictrack', password: 'Citizen@123' }
        : { email: 'authority@demo.civictrack', password: 'Authority@123' };
      const user = await login(credentials.email, credentials.password);
      showToast(`Signed in with the ${role} demonstration account.`, 'success', 'Demo access');
      redirectAfterLogin(user.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Demo sign-in failed. Is the API running?');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setError('');
    if (mode === 'register') setRoleMode('citizen');
    navigate(mode === 'register' ? '/register' : '/login', { replace: true });
  };

  return (
    <div className="bg-slate-50 min-h-screen py-12">
      <div className="max-w-md w-full mx-auto px-4 sm:px-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white mx-auto shadow-lg">
            <MapPin className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            CIVICTRACK<span className="text-blue-600 ml-1">AI</span>
          </h1>
          <p className="text-xs text-slate-500">
            Access your civic dashboard or the municipal authority console
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-soft space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Demonstration accounts
            </span>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              Seeded database
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => handleDemo('citizen')}
              disabled={busy}
              type="button"
              className="p-3 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-left transition-colors disabled:opacity-60"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                Citizen demo
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">citizen@demo.civictrack</p>
            </button>
            <button
              onClick={() => handleDemo('authority')}
              disabled={busy}
              type="button"
              className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-left transition-colors text-white disabled:opacity-60"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                Authority demo
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">authority@demo.civictrack</p>
            </button>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Passwords: Citizen@123 / Authority@123. These accounts exist only in the local demo database.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-card space-y-6">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2 rounded-lg transition-colors ${authMode === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 rounded-lg transition-colors ${authMode === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}
            >
              Register
            </button>
          </div>

          {authMode === 'login' && (
            <div className="grid grid-cols-2 gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setRoleMode('citizen')}
                className={`py-2 rounded-lg border ${roleMode === 'citizen' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
              >
                Citizen account
              </button>
              <button
                type="button"
                onClick={() => setRoleMode('authority')}
                className={`py-2 rounded-lg border ${roleMode === 'authority' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
              >
                Authority account
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {authMode === 'register' && (
              <div>
                <label htmlFor="name" className="block text-xs font-bold text-slate-700 mb-1">Full name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1">Email address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={roleMode === 'citizen' ? 'you@example.com' : 'officer@civictrack.gov'}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={authMode === 'register' ? 'At least 8 characters' : 'Your password'}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                />
              </div>
            </div>

            {authMode === 'register' && (
              <>
                <div>
                  <label htmlFor="phone" className="block text-xs font-bold text-slate-700 mb-1">Phone (optional)</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98xxx xxxxx"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="ward" className="block text-xs font-bold text-slate-700 mb-1">Primary ward</label>
                  <select
                    id="ward"
                    value={ward}
                    onChange={(e) => setWard(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 py-2.5 px-3 text-sm font-semibold bg-white"
                  >
                    <option>Ward 1 - Old City</option>
                    <option>Ward 2 - Sadashiv</option>
                    <option>Ward 3 - Shivaji Central</option>
                    <option>Ward 4 - Model Colony</option>
                    <option>Ward 5 - Sangamwadi</option>
                    <option>Ward 6 - Deccan</option>
                    <option>Ward 8 - Aundh North</option>
                    <option>Ward 11 - IT Park</option>
                  </select>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition-colors flex items-center justify-center gap-2"
            >
              {busy ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Working…</>
              ) : (
                <>
                  <span>{authMode === 'login' ? 'Sign in' : 'Create citizen account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {authMode === 'register' && (
            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
              Public registration creates citizen accounts only. Authority and administrator accounts are provisioned by the municipality.
            </p>
          )}

          <div className="pt-1 text-center text-xs text-slate-500">
            {authMode === 'login' ? (
              <p>
                Need an account?{' '}
                <button type="button" onClick={() => switchMode('register')} className="text-blue-600 font-bold hover:underline">
                  Register as a citizen
                </button>
              </p>
            ) : (
              <p>
                Already registered?{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-blue-600 font-bold hover:underline">
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
