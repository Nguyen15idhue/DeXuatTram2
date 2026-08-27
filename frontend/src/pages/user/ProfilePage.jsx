import { useAuth } from '../../contexts/AuthContext';

const ProfilePage = () => {
  const { user } = useAuth();

  return (
    <div className="profile-page">
      <h1>Hồ sơ cá nhân</h1>
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
          <span>{user?.phone}</span>
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
    </div>
  );
};

export default ProfilePage;
