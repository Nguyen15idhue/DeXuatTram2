import { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { profileService, api } from '../../services/api';
import DynamicForm from '../../components/dynamic/DynamicForm';
import Toast from '../../components/Toast';
import ErrorMessage from '../../components/ErrorMessage';

const USERS_FORM_ID = 8;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const ProfilePage = () => {
  const { user, updateUser, token } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const fileInputRef = useRef(null);

  const getAvatarUrl = () => {
    if (!user?.avatar) return null;
    const avatar = user.avatar;
    if (typeof avatar === 'object' && avatar.id) {
      return `/api/files/${avatar.id}/image`;
    }
    if (typeof avatar === 'number') {
      return `/api/files/${avatar}/image`;
    }
    return null;
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Ảnh phải nhỏ hơn 5MB');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('originalName', file.name);
      formData.append('entityType', 'users');
      formData.append('entityId', user.id);
      const uploadRes = await api.uploadWithAuth('/files/upload', formData, token);
      if (!uploadRes.success) throw new Error(uploadRes.message || 'Upload failed');
      const fileData = uploadRes.data;
      const profileRes = await profileService.update({
        full_name: user.full_name || '',
        phone: user.phone || '',
        avatar: fileData
      }, token);
      if (profileRes.success) {
        setToast({ message: 'Cập nhật ảnh đại diện thành công', type: 'success' });
        if (updateUser) updateUser(profileRes.data);
      } else {
        throw new Error(profileRes.message || 'Cập nhật thất bại');
      }
    } catch (err) {
      setError(err.message || 'Lỗi upload ảnh');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEditSubmit = async (formData) => {
    setError('');
    try {
      const res = await profileService.update({
        full_name: formData.full_name || formData.name || '',
        phone: formData.phone || '',
      }, token);
      if (res.success) {
        setToast({ message: 'Cập nhật hồ sơ thành công', type: 'success' });
        setIsEditing(false);
        if (updateUser) updateUser(res.data);
      } else {
        setError(res.message || 'Cập nhật thất bại');
        throw new Error(res.message || 'Cập nhật thất bại');
      }
    } catch (err) {
      setError(err.message || 'Lỗi kết nối server');
      throw err;
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!passwordForm.current_password) {
      setError('Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    try {
      const res = await profileService.update({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password
      }, token);
      if (res.success) {
        setToast({ message: 'Đổi mật khẩu thành công', type: 'success' });
        setShowPassword(false);
        setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      } else {
        setError(res.message || 'Đổi mật khẩu thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  };

  const avatarUrl = getAvatarUrl();

  return (
    <div className="profile-page">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      {error && <ErrorMessage message={error} />}

      <div className="profile-layout">
        <div className="profile-sidebar">
          <div className="profile-header">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
            <div className="profile-avatar-wrapper" onClick={handleAvatarClick} title="Click để thay đổi ảnh">
              <div className="profile-avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user?.full_name} />
                ) : (
                  <div className="profile-avatar-initials">{getInitials(user?.full_name)}</div>
                )}
              </div>
              <div className="profile-avatar-overlay">
                {uploading ? (
                  <span className="avatar-upload-spinner"></span>
                ) : (
                  <span className="avatar-upload-icon">&#128247;</span>
                )}
              </div>
            </div>
            <div className="profile-info">
              <h2>{user?.full_name || 'Chưa cập nhật'}</h2>
              <p>{user?.email}</p>
              <span className="profile-role-badge">{user?.role === 'ADMIN' ? 'Quản trị viên' : 'Người dùng'}</span>
            </div>
            {!isEditing && (
              <button className="btn btn-primary profile-edit-btn" onClick={() => setIsEditing(true)}>Chỉnh sửa</button>
            )}
          </div>
        </div>

        <div className="profile-main">
          {isEditing ? (
            <div className="profile-card">
              <h3>Chỉnh sửa thông tin</h3>
              <DynamicForm
                entity="users"
                formId={USERS_FORM_ID}
                onSubmit={handleEditSubmit}
                initialData={user}
                mode="edit"
              >
                <div className="popup-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>Hủy</button>
                </div>
              </DynamicForm>
            </div>
          ) : (
            <>
              <div className="profile-card">
                <h3>Thông tin cá nhân</h3>
                <div className="profile-field-row">
                  <span className="profile-field-label">Họ tên</span>
                  <span className="profile-field-value">{user?.full_name || 'Chưa cập nhật'}</span>
                </div>
                <div className="profile-field-row">
                  <span className="profile-field-label">Email</span>
                  <span className="profile-field-value">{user?.email}</span>
                </div>
                <div className="profile-field-row">
                  <span className="profile-field-label">Số điện thoại</span>
                  <span className="profile-field-value">{user?.phone || 'Chưa cập nhật'}</span>
                </div>
                <div className="profile-field-row">
                  <span className="profile-field-label">Vai trò</span>
                  <span className="profile-field-value">{user?.role === 'ADMIN' ? 'Quản trị viên' : 'Người dùng'}</span>
                </div>
                <div className="profile-field-row">
                  <span className="profile-field-label">Trạng thái</span>
                  <span className="profile-field-value">{user?.status === 'ACTIVE' ? 'Hoạt động' : 'Khóa'}</span>
                </div>
              </div>

              <div className="profile-card">
                <div className="profile-card-header">
                  <h3>Bảo mật</h3>
                  {!showPassword && (
                    <button className="btn btn-sm btn-primary" onClick={() => setShowPassword(true)}>Đổi mật khẩu</button>
                  )}
                </div>
                {showPassword && (
                  <form onSubmit={handlePasswordSubmit}>
                    <div className="profile-field-row">
                      <span className="profile-field-label">Mật khẩu hiện tại *</span>
                      <span className="profile-field-value">
                        <input type="password" className="form-control" value={passwordForm.current_password}
                          onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                          placeholder="Nhập mật khẩu hiện tại" />
                      </span>
                    </div>
                    <div className="profile-field-row">
                      <span className="profile-field-label">Mật khẩu mới *</span>
                      <span className="profile-field-value">
                        <input type="password" className="form-control" value={passwordForm.new_password}
                          onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                          placeholder="Ít nhất 6 ký tự" />
                      </span>
                    </div>
                    <div className="profile-field-row">
                      <span className="profile-field-label">Xác nhận mật khẩu *</span>
                      <span className="profile-field-value">
                        <input type="password" className="form-control" value={passwordForm.confirm_password}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                          placeholder="Nhập lại mật khẩu mới" />
                      </span>
                    </div>
                    <div className="popup-footer">
                      <button type="button" className="btn btn-secondary" onClick={() => { setShowPassword(false); setPasswordForm({ current_password: '', new_password: '', confirm_password: '' }); setError(''); }}>Hủy</button>
                      <button type="submit" className="btn btn-primary">Đổi mật khẩu</button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
