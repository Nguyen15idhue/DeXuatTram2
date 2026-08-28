import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { profileService } from '../../services/api';
import Toast from '../../components/Toast';
import ErrorMessage from '../../components/ErrorMessage';

const ProfilePage = () => {
  const { user, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const handleEdit = () => {
    setForm({
      full_name: user?.full_name || '',
      phone: user?.phone || '',
      current_password: '',
      new_password: '',
      confirm_password: ''
    });
    setIsEditing(true);
    setError('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.full_name) {
      setError('Họ tên là bắt buộc');
      return;
    }

    if (form.new_password) {
      if (!form.current_password) {
        setError('Vui lòng nhập mật khẩu hiện tại');
        return;
      }
      if (form.new_password.length < 6) {
        setError('Mật khẩu mới phải có ít nhất 6 ký tự');
        return;
      }
      if (form.new_password !== form.confirm_password) {
        setError('Mật khẩu xác nhận không khớp');
        return;
      }
    }

    try {
      const res = await profileService.update({
        full_name: form.full_name,
        phone: form.phone,
        current_password: form.current_password || undefined,
        new_password: form.new_password || undefined
      }, localStorage.getItem('token'));

      if (res.success) {
        setToast({ message: 'Cập nhật hồ sơ thành công', type: 'success' });
        setIsEditing(false);
        if (updateUser) {
          updateUser(res.data);
        }
      } else {
        setError(res.message || 'Cập nhật thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  return (
    <div className="profile-page">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />

      <div className="page-header">
        <h1>Hồ sơ cá nhân</h1>
        {!isEditing && (
          <button className="btn btn-primary" onClick={handleEdit}>Chỉnh sửa</button>
        )}
      </div>

      {error && <ErrorMessage message={error} />}

      {isEditing ? (
        <div className="profile-card">
          <form onSubmit={handleSubmit}>
            <div className="profile-field">
              <label>Họ tên:</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="profile-field">
              <label>Email:</label>
              <span className="profile-email">{user?.email}</span>
            </div>
            <div className="profile-field">
              <label>Số điện thoại:</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="profile-divider">
              <span>Đổi mật khẩu (không bắt buộc)</span>
            </div>
            <div className="profile-field">
              <label>Mật khẩu hiện tại:</label>
              <input
                type="password"
                value={form.current_password}
                onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                placeholder="Nhập mật khẩu hiện tại"
              />
            </div>
            <div className="profile-field">
              <label>Mật khẩu mới:</label>
              <input
                type="password"
                value={form.new_password}
                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                placeholder="Ít nhất 6 ký tự"
              />
            </div>
            <div className="profile-field">
              <label>Xác nhận:</label>
              <input
                type="password"
                value={form.confirm_password}
                onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                placeholder="Nhập lại mật khẩu mới"
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>Hủy</button>
              <button type="submit" className="btn btn-primary">Lưu thay đổi</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="profile-card">
          <div className="profile-field">
            <label>Họ tên:</label>
            <span>{user?.full_name}</span>
          </div>
          <div className="profile-field">
            <label>Email:</label>
            <span>{user?.email}</span>
          </div>
          <div className="profile-field">
            <label>Số điện thoại:</label>
            <span>{user?.phone || 'Chưa cập nhật'}</span>
          </div>
          <div className="profile-field">
            <label>Vai trò:</label>
            <span>{user?.role}</span>
          </div>
          <div className="profile-field">
            <label>Trạng thái:</label>
            <span>{user?.status}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
