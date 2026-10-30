import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: Array<'citizen' | 'authority' | 'admin'>;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          Checking your session…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roles && !roles.includes(role as 'citizen' | 'authority' | 'admin')) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-soft">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Access restricted</h1>
          <p className="text-sm text-slate-500 mt-2">
            This area is limited to municipal authority accounts. You are signed in as a {role}.
          </p>
          <Link to="/citizen-dashboard" className="inline-block mt-5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Go to citizen dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
