import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import AuthProvider from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import GlobalSocketListener from './components/GlobalSocketListener';

// Lazy-loaded page components (created in next steps)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CreateIncidentPage = lazy(() => import('./pages/CreateIncidentPage'));
const IncidentDetailPage = lazy(() => import('./pages/IncidentDetailPage'));
const IncidentListPage = lazy(() => import('./pages/IncidentListPage'));
const StaffDashboardPage = lazy(() => import('./pages/StaffDashboardPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/AdminAnalyticsPage'));
const BroadcastAlertPage = lazy(() => import('./pages/BroadcastAlertPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const HeatmapPage = lazy(() => import('./pages/HeatmapPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const StaffManagementPage = lazy(() => import('./pages/StaffManagementPage'));
const CreateDepartmentPage = lazy(() => import('./pages/CreateDepartmentPage'));

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-bg-base">
    <div className="flex flex-col items-center gap-4">
      <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      <span className="text-text-secondary text-sm font-medium">Loading…</span>
    </div>
  </div>
);

export default function App() {
  const location = useLocation();

  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface-2)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-lg)',
            borderRadius: 'var(--radius-lg)',
            fontSize: '14px',
          },
        }}
      />
      <GlobalSocketListener />

      <Suspense fallback={<PageFallback />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/incidents" element={<IncidentListPage />} />
            <Route path="/incidents/:id" element={<IncidentDetailPage />} />
            <Route path="/incidents/:id/chat" element={<ChatPage />} />
            <Route path="/heatmap" element={<HeatmapPage />} />
            <Route path="/profile" element={<UserProfilePage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['STUDENT', 'FACULTY', 'ADMIN']} />}>
            <Route path="/incidents/new" element={<CreateIncidentPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['MAINTENANCE', 'SECURITY']} />}>
            <Route path="/staff-dashboard" element={<StaffDashboardPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/analytics" element={<AdminAnalyticsPage />} />
            <Route path="/alerts/new" element={<BroadcastAlertPage />} />
            <Route path="/staff" element={<StaffManagementPage />} />
            <Route path="/departments/new" element={<CreateDepartmentPage />} />
          </Route>

          {/* Catch-all redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </AuthProvider>
  );
}
