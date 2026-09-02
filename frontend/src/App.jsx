import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

import PublicLayout from './layouts/PublicLayout';
import UserLayout from './layouts/UserLayout';
import AdminLayout from './layouts/AdminLayout';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

import MapPage from './pages/user/MapPage';
import MyProposalsPage from './pages/user/MyProposalsPage';
import ProfilePage from './pages/user/ProfilePage';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminStationsPage from './pages/admin/AdminStationsPage';
import AdminProposalsPage from './pages/admin/AdminProposalsPage';
import AdminFieldsPage from './pages/admin/AdminFieldsPage';
import AdminFormsPage from './pages/admin/AdminFormsPage';
import AdminFormBuilderPage from './pages/admin/AdminFormBuilderPage';
import AdminViewsPage from './pages/admin/AdminViewsPage';
import AdminViewBuilderPage from './pages/admin/AdminViewBuilderPage';
import AdminRecordFilesPage from './pages/admin/AdminRecordFilesPage';
import AdminDataListsPage from './pages/admin/AdminDataListsPage';
import AdminMapConfigPage from './pages/admin/AdminMapConfigPage';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
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
            <Route path="/admin/map-config" element={<AdminMapConfigPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
