import { Suspense } from 'react';
import { Outlet, Link } from 'react-router-dom';
import RouteFallback from '../components/RouteFallback';

const GuestLayout = () => {
  return (
    <div className="min-h-screen bg-base-100">
      <header className="navbar bg-primary text-primary-content px-4 md:px-8">
        <Link to="/de-xuat" className="font-bold text-lg">Đề xuất trạm sạc</Link>
        <div className="flex-1" />
        <Link to="/login" className="btn btn-ghost btn-sm">Đăng nhập</Link>
      </header>
      <main>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="footer footer-center p-4 bg-base-200 text-base-content text-sm">
        Gửi đề xuất vị trí trạm sạc — không cần tài khoản
      </footer>
    </div>
  );
};

export default GuestLayout;
