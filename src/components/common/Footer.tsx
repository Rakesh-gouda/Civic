import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ShieldCheck, Heart, Cpu, Globe2, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Footer: React.FC = () => {
  const { user, isStaff } = useAuth();

  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand & Overview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20">
                <MapPin className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">
                CIVICTRACK<span className="text-blue-500 ml-1">AI</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              A civic complaint platform for reporting issues with a photo and location, tracking municipal
              resolutions, and finding geographic complaint hotspots. Seeded demonstration records are labelled
              throughout the interface.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2">
              <div className="flex items-center gap-1.5">
                <Globe2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Leaflet &amp; OpenStreetMap</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span>Gemini AI (server-side)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Role-based access</span>
              </div>
            </div>
          </div>

          {/* Citizen Services */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
              Citizen Portal
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/submit" className="hover:text-blue-400 transition-colors">
                  Report an Issue
                </Link>
              </li>
              <li>
                <Link to="/track" className="hover:text-blue-400 transition-colors">
                  Track a Complaint
                </Link>
              </li>
              <li>
                <Link to="/citizen-dashboard" className="hover:text-blue-400 transition-colors">
                  My Complaints
                </Link>
              </li>
              <li>
                <Link to="/map" className="hover:text-blue-400 transition-colors">
                  Complaint Map
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-blue-400 transition-colors">
                  Create an Account
                </Link>
              </li>
            </ul>
          </div>

          {/* Staff or access links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
              {isStaff ? 'Authority Operations' : 'Staff Access'}
            </h4>
            <ul className="space-y-2 text-xs">
              {isStaff ? (
                <>
                  <li>
                    <Link to="/authority-dashboard" className="hover:text-blue-400 transition-colors">
                      Authority Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link to="/complaints-table" className="hover:text-blue-400 transition-colors">
                      Complaint Management
                    </Link>
                  </li>
                  <li>
                    <Link to="/analytics" className="hover:text-blue-400 transition-colors">
                      AI Analytics
                    </Link>
                  </li>
                  <li>
                    <Link to="/departments" className="hover:text-blue-400 transition-colors">
                      Department Management
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link to="/login" className="hover:text-blue-400 transition-colors">
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" className="hover:text-blue-400 transition-colors">
                      Citizen Registration
                    </Link>
                  </li>
                  <li>
                    <Link to="/track" className="hover:text-blue-400 transition-colors">
                      Check a Ticket
                    </Link>
                  </li>
                  <li>
                    <Link to="/map" className="hover:text-blue-400 transition-colors">
                      Browse Complaints
                    </Link>
                  </li>
                </>
              )}
              <li>
                <Link to="/login" className="hover:text-blue-400 transition-colors">
                  {isStaff ? 'Switch Account' : 'Officer Sign In'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Supported Categories */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
              Civic Categories
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-400">
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Potholes &amp; Road Damage
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                Drainage &amp; Waterlogging
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                Waste Management
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Streetlight Failures
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                Electrical Hazards
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Public Infrastructure
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom separator */}
        <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© 2026 CIVICTRACK AI · Civic technology demonstration platform</p>
          <div className="flex items-center gap-5">
            <Link to="/" className="hover:text-slate-300 transition-colors">
              Overview
            </Link>
            <Link to="/map" className="hover:text-slate-300 transition-colors">
              Map
            </Link>
            <Link to="/track" className="hover:text-slate-300 transition-colors">
              Track
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <Heart className="w-3 h-3 text-rose-400" />
              Built for public services
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-blue-400" />
              {user ? `Signed in as ${user.role}` : 'Public access'}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
