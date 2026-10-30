import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => (
  <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 px-4">
    <div className="text-center max-w-md">
      <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white mx-auto">
        <MapPin className="w-7 h-7" />
      </div>
      <p className="mt-6 text-xs font-bold tracking-[0.2em] text-blue-600 uppercase">404 — Not found</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">This page does not exist</h1>
      <p className="mt-2 text-sm text-slate-500">
        The link may be outdated. Use the navigation above or return to the platform home page.
      </p>
      <Link to="/" className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
        <ArrowLeft className="w-4 h-4" /> Back to home
      </Link>
    </div>
  </div>
);
