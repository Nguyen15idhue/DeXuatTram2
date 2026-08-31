import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

import PublicLayout from './layouts/PublicLayout';
import UserLayout from './layouts/UserLayout';
import AdminLayout from './layouts/AdminLayout';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const MapPage = lazy(() => import('./pages/user/MapPage'));
const MyProposalsPage = lazy(() => import('./pages/user/MyProposalsPage'));
const ProfilePage = lazy(() => import('./pages/user/ProfilePage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminStationsPage = lazy(() => import('./pages/admin/AdminStationsPage'));
const AdminProposalsPage = lazy(() => import('./pages/admin/AdminProposalsPage'));
const AdminFieldsPage = lazy(() => import('./pages/admin/AdminFieldsPage'));
const AdminFormsPage = lazy(() => import('./pages/admin/AdminFormsPage'));
const AdminFormBuilderPage = lazy(() => import('./pages/admin/AdminFormBuilderPage'));
const AdminViewsPage = lazy(() => import('./pages/admin/AdminViewsPage'));
const AdminViewBuilderPage = lazy(() => import('./pages/admin/AdminViewBuilderPage'));
const AdminRecordFilesPage = lazy(() => import('./pages/admin/AdminRecordFilesPage'));
const AdminDataListsPage = lazy(() => import('./pages/admin/AdminDataListsPage'));

import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<div className="loading">Đang tải...</div>}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route element={<UserLayout />}>
            <Route path="/map" element={<MapPage />} />
            <Route path="/my-proposals" element={<MyProposalsPage />} />
            <Route path="/my-proposals/*" element={<MyProposalsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/*" element={<AdminUsersPage />} />
            <Route path="/admin/stations" element={<AdminStationsPage />} />
            <Route path="/admin/stations/*" element={<AdminStationsPage />} />
            <Route path="/admin/proposals" element={<AdminProposalsPage />} />
            <Route path="/admin/proposals/*" element={<AdminProposalsPage />} />
            <Route path="/admin/fields" element={<AdminFieldsPage />} />
            <Route path="/admin/forms" element={<AdminFormsPage />} />
            <Route path="/admin/forms/:id/edit" element={<AdminFormBuilderPage />} />
            <Route path="/admin/views" element={<AdminViewsPage />} />
            <Route path="/admin/views/:id/edit" element={<AdminViewBuilderPage />} />
            <Route path="/admin/:entity/:id/files" element={<AdminRecordFilesPage />} />
            <Route path="/admin/data-lists" element={<AdminDataListsPage />} />
            <Route path="/admin/data-lists/:id" element={<AdminDataListsPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}

export default App;
