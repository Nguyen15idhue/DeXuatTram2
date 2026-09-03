import { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { profileService, api } from '../../services/api';
import DynamicForm from '../../components/dynamic/DynamicForm';
import Toast from '../../components/Toast';
import ErrorMessage from '../../components/ErrorMessage';
import { User, Mail, Phone, Shield, CheckCircle, Camera, Lock, Pencil, X } from 'lucide-react';

const USERS_FORM_ID = 8;

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
    <div className="max-w-4xl mx-auto">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
      {error && <ErrorMessage message={error} />}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar - Avatar & Info */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body items-center text-center">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              <div
                className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer group"
                onClick={handleAvatarClick}
                title="Click để thay đổi ảnh"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={user?.full_name} className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-primary">{getInitials(user?.full_name)}</span>
                )}
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {uploading ? (
                    <span className="loading loading-spinner loading-sm text-white"></span>
                  ) : (
                    <Camera size={20} className="text-white" />
                  )}
                </div>
              </div>

              <h2 className="card-title mt-2">{user?.full_name || 'Chưa cập nhật'}</h2>
              <p className="text-sm text-base-content/60">{user?.email}</p>
              <span className={`badge ${user?.role === 'ADMIN' ? 'badge-primary' : 'badge-ghost'}`}>
                {user?.role === 'ADMIN' ? 'Quản trị viên' : 'Người dùng'}
              </span>

              {!isEditing && (
                <button className="btn btn-primary btn-sm gap-1 mt-2 w-full" onClick={() => setIsEditing(true)}>
                  <Pencil size={14} />
                  Chỉnh sửa
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body">
                <h3 className="card-title">Chỉnh sửa thông tin</h3>
                <DynamicForm
                  entity="users"
                  formId={USERS_FORM_ID}
                  onSubmit={handleEditSubmit}
                  initialData={user}
                  mode="edit"
                >
                  <button type="button" className="btn btn-ghost" onClick={() => setIsEditing(false)}>
                    <X size={14} />
                    Hủy
                  </button>
                </DynamicForm>
              </div>
            </div>
          ) : (
            <>
              {/* Personal Info */}
              <div className="card bg-base-100 shadow-sm border border-base-300 mb-6">
                <div className="card-body">
                  <h3 className="card-title">Thông tin cá nhân</h3>
                  <div className="divide-y divide-base-300">
                    <div className="flex items-center gap-3 py-3">
                      <User size={16} className="text-base-content/50" />
                      <span className="text-sm text-base-content/50 w-32">Họ tên</span>
                      <span className="font-medium">{user?.full_name || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex items-center gap-3 py-3">
                      <Mail size={16} className="text-base-content/50" />
                      <span className="text-sm text-base-content/50 w-32">Email</span>
                      <span className="font-medium">{user?.email}</span>
                    </div>
                    <div className="flex items-center gap-3 py-3">
                      <Phone size={16} className="text-base-content/50" />
                      <span className="text-sm text-base-content/50 w-32">Số điện thoại</span>
                      <span className="font-medium">{user?.phone || 'Chưa cập nhật'}</span>
                    </div>
                    <div className="flex items-center gap-3 py-3">
                      <Shield size={16} className="text-base-content/50" />
                      <span className="text-sm text-base-content/50 w-32">Vai trò</span>
                      <span className="font-medium">{user?.role === 'ADMIN' ? 'Quản trị viên' : 'Người dùng'}</span>
                    </div>
                    <div className="flex items-center gap-3 py-3">
                      <CheckCircle size={16} className="text-base-content/50" />
                      <span className="text-sm text-base-content/50 w-32">Trạng thái</span>
                      <span className={`badge badge-sm ${user?.status === 'ACTIVE' ? 'badge-success' : 'badge-error'}`}>
                        {user?.status === 'ACTIVE' ? 'Hoạt động' : 'Khóa'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security */}
              <div className="card bg-base-100 shadow-sm border border-base-300">
                <div className="card-body">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="card-title">Bảo mật</h3>
                    {!showPassword && (
                      <button className="btn btn-primary btn-sm gap-1" onClick={() => setShowPassword(true)}>
                        <Lock size={14} />
                        Đổi mật khẩu
                      </button>
                    )}
                  </div>
                  {showPassword && (
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">Mật khẩu hiện tại *</span>
                        </label>
                        <input
                          type="password"
                          className="input input-bordered"
                          value={passwordForm.current_password}
                          onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                          placeholder="Nhập mật khẩu hiện tại"
                        />
                      </div>
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">Mật khẩu mới *</span>
                        </label>
                        <input
                          type="password"
                          className="input input-bordered"
                          value={passwordForm.new_password}
                          onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                          placeholder="Ít nhất 6 ký tự"
                        />
                      </div>
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text font-medium">Xác nhận mật khẩu *</span>
                        </label>
                        <input
                          type="password"
                          className="input input-bordered"
                          value={passwordForm.confirm_password}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                          placeholder="Nhập lại mật khẩu mới"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-ghost" onClick={() => {
                          setShowPassword(false);
                          setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
                          setError('');
                        }}>
                          Hủy
                        </button>
                        <button type="submit" className="btn btn-primary">Đổi mật khẩu</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
