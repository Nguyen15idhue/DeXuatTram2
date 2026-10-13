import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import NotificationBell from './NotificationBell';

const AdminHeader = ({ onMenuToggle, showBell = true }) => {
  return (
    <div className="navbar bg-base-100 shadow-sm lg:hidden sticky top-0 z-30">
      <label className="btn btn-square btn-ghost drawer-button" onClick={onMenuToggle}>
        <Menu size={20} />
      </label>
      <Link to="/admin" className="btn btn-ghost text-xl font-bold text-primary">
        Admin Panel
      </Link>
      <div className="ml-auto">
        {showBell && <NotificationBell mode="admin" />}
      </div>
    </div>
  );
};

export default AdminHeader;
