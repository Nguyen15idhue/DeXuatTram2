import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { adminUserService } from '../../services/api';
import Loading from '../../components/Loading';
import Toast from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';

const AdminUsersPage = () => {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, name: '' });
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', password: '', role: 'USER', status: 'ACTIVE'
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await adminUserService.getAll(token);
      if (res.success) setUsers(res.data);
    } catch {
      setError('Lỗi tải danh sách users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ full_name: '', email: '', phone: '', password: '', role: 'USER', status: 'ACTIVE' });
    setShowForm(true);
    setError('');
    setToast({ message: '', type: 'success' });
  };

  const openEdit = (user) => {
    setEditingId(user.id);
    setForm({
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      password: '',
      role: user.role,
      status: user.status
    });
    setShowForm(true);
    setError('');
    setToast({ message: '', type: 'success' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.full_name || !form.email) {
      setError('Vui lòng nhập đầy đủ thông tin bắt buộc');
      return;
    }

    if (!editingId && !form.password) {
      setError('Vui lòng nhập password');
      return;
    }

    try {
      let res;
      if (editingId) {
        res = await adminUserService.update(editingId, form, token);
      } else {
        res = await adminUserService.create(form, token);
      }

      if (res.success) {
        setToast({ message: editingId ? 'Cập nhật user thành công' : 'Tạo user thành công', type: 'success' });
        setShowForm(false);
        loadUsers();
      } else {
        setError(res.message || 'Thao tác thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleDeleteClick = (id, name) => {
    setConfirmDelete({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: '' });
    try {
      const res = await adminUserService.delete(id, token);
      if (res.success) {
        setToast({ message: 'Xóa user thành công', type: 'success' });
        loadUsers();
      } else {
        setError(res.message || 'Xóa thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleToggleLock = async (id) => {
    try {
      const res = await adminUserService.toggleLock(id, token);
      if (res.success) {
        setToast({ message: res.message, type: 'success' });
        loadUsers();
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const handleChangeRole = async (id, newRole) => {
    try {
      const res = await adminUserService.changeRole(id, newRole, token);
      if (res.success) {
        setToast({ message: 'Đổi role thành công', type: 'success' });
        loadUsers();
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  if (loading) return <Loading message="Đang tải danh sách users..." />;

  return (
    <div className="admin-users-page">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />

      <div className="page-header">
        <h1>Quản lý Users</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Thêm user</button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => { setError(''); loadUsers(); }} />}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa user"
        message={`Bạn có chắc chắn muốn xóa user "${confirmDelete.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: '' })}
        confirmText="Xóa"
        type="danger"
      />

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Sửa user' : 'Thêm user mới'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Họ tên *</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Số điện thoại</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Password {editingId ? '(để trống nếu không đổi)' : '*'}</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Trạng thái</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="LOCKED">LOCKED</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Cập nhật' : 'Tạo mới'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Họ tên</th>
              <th>Email</th>
              <th>SĐT</th>
              <th>Role</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan="7"><EmptyState icon="👤" title="Không có user nào" /></td></tr>
            ) : users.map((u, idx) => (
              <tr key={u.id}>
                <td>{idx + 1}</td>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>{u.phone || '-'}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => handleChangeRole(u.id, e.target.value)}
                    className="status-select"
                  >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td>
                  <span className={`badge badge-${u.status.toLowerCase()}`}>{u.status}</span>
                </td>
                <td>
                  <button className="btn btn-sm btn-edit" onClick={() => openEdit(u)}>Sửa</button>
                  <button className="btn btn-sm btn-lock" onClick={() => handleToggleLock(u.id)}>
                    {u.status === 'ACTIVE' ? 'Khóa' : 'Mở'}
                  </button>
                  {u.role !== 'ADMIN' && (
                    <button className="btn btn-sm btn-delete" onClick={() => handleDeleteClick(u.id, u.full_name)}>Xóa</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUsersPage;
