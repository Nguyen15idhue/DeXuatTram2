import { lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

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
const EvReportGuestPage = lazy(() => import('./pages/user/EvReportGuestPage'));
const ProfilePage = lazy(() => import('./pages/user/ProfilePage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminLeadsPage = lazy(() => import('./pages/admin/AdminLeadsPage'));
const ReportEditorPage = lazy(() => import('./pages/admin/ReportEditorPage'));
const AdminStationsPage = lazy(() => import('./pages/admin/AdminStationsPage'));
const AdminProposalsPage = lazy(() => import('./pages/admin/AdminProposalsPage'));
const AdminProposalsDanhGiaQuyHoachPage = lazy(() => import('./pages/admin/AdminProposalsDanhGiaQuyHoachPage'));
const AdminProposalsReviewPage = lazy(() => import('./pages/admin/AdminProposalsReviewPage'));
const AdminProposalsDanhGiaLayoutPage = lazy(() => import('./pages/admin/AdminProposalsDanhGiaLayoutPage'));
const AdminProposalsLapToTrinhPage = lazy(() => import('./pages/admin/AdminProposalsLapToTrinhPage'));
const AdminProposalsDuyetBCDXPage = lazy(() => import('./pages/admin/AdminProposalsDuyetBCDXPage'));
const AdminProposalsTrinhKyPage = lazy(() => import('./pages/admin/AdminProposalsTrinhKyPage'));
const AdminProposalSigningPage = lazy(() => import('./pages/admin/AdminProposalSigningPage'));
const AdminESignPage = lazy(() => import('./pages/admin/AdminESignPage'));
const AdminEvReportsPage = lazy(() => import('./pages/admin/AdminEvReportsPage'));
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
const LEAD_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'MKT'];
const PROPOSAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV'];
const SIGNING_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'CTV', 'NPP'];
const ESIGN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'MKT', 'CTV', 'NPP'];
const PANEL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SALES', 'MKT', 'CTV', 'NPP'];
const HIDE_ASSISTANT_PATHS = ['/login', '/register', '/map'];

import './App.css';

function GlobalAssistantChat() {
  const location = useLocation();
  if (HIDE_ASSISTANT_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))) {
    return null;
  }
  return <AssistantChat variant="floating" />;
}

function AdminLanding() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-base-content">Đang tải...</div>;
  }
  if (user?.role === 'MKT') return <Navigate to="/admin/leads" replace />;
  if (user?.role === 'CTV') return <Navigate to="/admin/proposals" replace />;
  if (user?.role === 'NPP') return <Navigate to="/admin/e-sign" replace />;
  return <AdminDashboard />;
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
            <Route path="/nhu-cau-sac-xe" element={<EvReportGuestPage />} />
          </Route>

          <Route element={<UserLayout />}>
            <Route path="/map" element={<MapPage />} />
            <Route path="/my-proposals" element={<MyProposalsPage />} />
            <Route path="/my-proposals/*" element={<MyProposalsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/huong-dan" element={<HelpPage />} />
          </Route>

          <Route element={<AdminLayout />}>
            <Route
              path="/admin"
              element={
                <RoleRoute allowed={PANEL_ROLES}>
                  <AdminLanding />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/leads"
              element={
                <RoleRoute allowed={LEAD_ROLES}>
                  <AdminLeadsPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/leads/*"
              element={
                <RoleRoute allowed={LEAD_ROLES}>
                  <AdminLeadsPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <RoleRoute allowed={LEAD_ROLES}>
                  <ReportEditorPage />
                </RoleRoute>
              }
            />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/*" element={<AdminUsersPage />} />
            <Route path="/admin/stations" element={<AdminStationsPage />} />
            <Route path="/admin/stations/*" element={<AdminStationsPage />} />
            <Route path="/admin/proposals" element={<RoleRoute allowed={PROPOSAL_ROLES}><AdminProposalsPage /></RoleRoute>} />
            <Route path="/admin/proposals/*" element={<AdminProposalsPage />} />
            <Route
              path="/admin/proposals/danh-gia-quy-hoach"
              element={
                <RoleRoute allowed={PROPOSAL_ROLES}>
                  <AdminProposalsDanhGiaQuyHoachPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/proposals/yeu-cau-cham-diem-lai"
              element={
                <RoleRoute allowed={ADMIN_AND_SALES}>
                  <AdminProposalsReviewPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/proposals/danh-gia-layout"
              element={
                <RoleRoute allowed={PROPOSAL_ROLES}>
                  <AdminProposalsDanhGiaLayoutPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/proposals/lap-to-trinh"
              element={
                <RoleRoute allowed={PROPOSAL_ROLES}>
                  <AdminProposalsLapToTrinhPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/proposals/duyet-bcdx"
              element={
                <RoleRoute allowed={PROPOSAL_ROLES}>
                  <AdminProposalsDuyetBCDXPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/proposals/trinh-ky"
              element={
                <RoleRoute allowed={SIGNING_ROLES}>
                  <AdminProposalsTrinhKyPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/proposals/ky-bcdx"
              element={
                <RoleRoute allowed={SIGNING_ROLES}>
                  <AdminProposalSigningPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/proposals/ky-bcdx/:id"
              element={
                <RoleRoute allowed={SIGNING_ROLES}>
                  <AdminProposalSigningPage />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/e-sign"
              element={
                <RoleRoute allowed={ESIGN_ROLES}>
                  <AdminESignPage />
                </RoleRoute>
              }
            />
            <Route path="/admin/ev-reports" element={<AdminEvReportsPage />} />
            <Route path="/admin/ev-reports/*" element={<AdminEvReportsPage />} />
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
