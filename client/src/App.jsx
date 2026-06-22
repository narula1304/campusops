import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AuthProvider from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';

// Lazy-loaded page components (created in next steps)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CreateIncidentPage = lazy(() => import('./pages/CreateIncidentPage'));
const IncidentDetailPage = lazy(() => import('./pages/IncidentDetailPage'));

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-900">
    <span className="text-slate-400 text-lg">Loading…</span>
  </div>
);

export default function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['STUDENT', 'FACULTY', 'ADMIN']} />}>
            <Route path="/incidents/new" element={<CreateIncidentPage />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
