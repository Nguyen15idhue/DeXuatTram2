import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

import PublicLayout from './layouts/PublicLayout';
import GuestLayout from './layouts/GuestLayout';
import UserLayout from './layouts/UserLayout';
import AdminLayout from './layouts/AdminLayout';

import RoleRoute from './components/RoleRoute';
import AssistantChat from './components/help/AssistantChat';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));

const MapPage = lazy(() => import('./pages/user/MapPage'));
const MyProposalsPage = lazy(() => import('./pages/user/MyProposalsPage'));
const GuestProposalPage = lazy(() => import('./pages/user/GuestProposalPage'));
const ProfilePage = lazy(() => import('./pages/user/ProfilePage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));

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
const AdminMapConfigPage = lazy(() => import('./pages/admin/AdminMapConfigPage'));
const AdminRolesPage = lazy(() => import('./pages/admin/AdminRolesPage'));
const AdminApiConfigPage = lazy(() => import('./pages/admin/AdminApiConfigPage'));
const AdminAuditLogPage = lazy(() => import('./pages/admin/AdminAuditLogPage'));
const AdminHelpPage = lazy(() => import('./pages/admin/AdminHelpPage'));
const AdminDocumentsPage = lazy(() => import('./pages/admin/AdminDocumentsPage'));

const SUPER_ONLY = ['SUPER_ADMIN'];
const ADMIN_AND_SALES = ['SUPER_ADMIN', 'ADMIN', 'SALES'];
const HIDE_ASSISTANT_PATHS = ['/login', '/register', '/map'];

import './App.css';

function GlobalAssistantChat() {
  const location = useLocation();
  if (HIDE_ASSISTANT_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))) {
    return null;
  }
  return <AssistantChat variant="floating" />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <GlobalAssistantChat />
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route element={<GuestLayout />}>
            <Route path="/de-xuat" element={<GuestProposalPage />} />
          </Route>

          <Route element={<UserLayout />}>
            <Route path="/map" element={<MapPage />} />
            <Route path="/my-proposals" element={<MyProposalsPage />} />
            <Route path="/my-proposals/*" element={<MyProposalsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/huong-dan" element={<HelpPage />} />
          </Route>

          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/*" element={<AdminUsersPage />} />
            <Route path="/admin/stations" element={<AdminStationsPage />} />
            <Route path="/admin/stations/*" element={<AdminStationsPage />} />
            <Route path="/admin/proposals" element={<AdminProposalsPage />} />
            <Route path="/admin/proposals/*" element={<AdminProposalsPage />} />
            <Route path="/admin/fields" element={<RoleRoute allowed={SUPER_ONLY}><AdminFieldsPage /></RoleRoute>} />
            <Route path="/admin/forms" element={<RoleRoute allowed={SUPER_ONLY}><AdminFormsPage /></RoleRoute>} />
            <Route path="/admin/forms/:id/edit" element={<RoleRoute allowed={SUPER_ONLY}><AdminFormBuilderPage /></RoleRoute>} />
            <Route path="/admin/views" element={<RoleRoute allowed={SUPER_ONLY}><AdminViewsPage /></RoleRoute>} />
            <Route path="/admin/views/:id/edit" element={<RoleRoute allowed={SUPER_ONLY}><AdminViewBuilderPage /></RoleRoute>} />
            <Route path="/admin/:entity/:id/files" element={<RoleRoute allowed={ADMIN_AND_SALES}><AdminRecordFilesPage /></RoleRoute>} />
            <Route path="/admin/data-lists" element={<RoleRoute allowed={SUPER_ONLY}><AdminDataListsPage /></RoleRoute>} />
            <Route path="/admin/data-lists/:id" element={<RoleRoute allowed={SUPER_ONLY}><AdminDataListsPage /></RoleRoute>} />
            <Route path="/admin/map-config" element={<RoleRoute allowed={SUPER_ONLY}><AdminMapConfigPage /></RoleRoute>} />
            <Route path="/admin/roles" element={<RoleRoute allowed={SUPER_ONLY}><AdminRolesPage /></RoleRoute>} />
            <Route path="/admin/api-configs" element={<RoleRoute allowed={SUPER_ONLY}><AdminApiConfigPage /></RoleRoute>} />
            <Route path="/admin/help" element={<RoleRoute allowed={SUPER_ONLY}><AdminHelpPage /></RoleRoute>} />
            <Route path="/admin/documents" element={<RoleRoute allowed={SUPER_ONLY}><AdminDocumentsPage /></RoleRoute>} />
            <Route path="/admin/audit-log" element={<RoleRoute allowed={ADMIN_AND_SALES}><AdminAuditLogPage /></RoleRoute>} />
            <Route path="/admin/huong-dan" element={<HelpPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
