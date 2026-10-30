import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ComplaintProvider } from './context/ComplaintContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { ProtectedRoute } from './components/common/ProtectedRoute';

import { LandingPage } from './pages/LandingPage';
import { CitizenDashboard } from './pages/CitizenDashboard';
import { SubmitComplaintPage } from './pages/SubmitComplaintPage';
import { TrackComplaintPage } from './pages/TrackComplaintPage';
import { ComplaintMapPage } from './pages/ComplaintMapPage';
import { AuthorityDashboard } from './pages/AuthorityDashboard';
import { AIAnalyticsPage } from './pages/AIAnalyticsPage';
import { DepartmentManagementPage } from './pages/DepartmentManagementPage';
import { ComplaintManagementPage } from './pages/ComplaintManagementPage';
import { AuthPage } from './pages/AuthPage';
import { NotFoundPage } from './pages/NotFoundPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

const StaffOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute roles={['authority', 'admin']}>{children}</ProtectedRoute>
);

const CitizenOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute roles={['citizen']}>{children}</ProtectedRoute>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <AuthProvider>
          <ComplaintProvider>
            <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<AuthPage initialMode="login" />} />
                  <Route path="/register" element={<AuthPage initialMode="register" />} />
                  <Route path="/map" element={<ComplaintMapPage />} />
                  <Route path="/track" element={<TrackComplaintPage />} />

                  <Route path="/citizen-dashboard" element={<CitizenOnly><CitizenDashboard /></CitizenOnly>} />
                  <Route path="/submit" element={<CitizenOnly><SubmitComplaintPage /></CitizenOnly>} />

                  <Route path="/authority-dashboard" element={<StaffOnly><AuthorityDashboard /></StaffOnly>} />
                  <Route path="/analytics" element={<StaffOnly><AIAnalyticsPage /></StaffOnly>} />
                  <Route path="/departments" element={<StaffOnly><DepartmentManagementPage /></StaffOnly>} />
                  <Route path="/complaints-table" element={<StaffOnly><ComplaintManagementPage /></StaffOnly>} />

                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </ComplaintProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
