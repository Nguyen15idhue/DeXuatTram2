import { Suspense } from "react";
import { Outlet, Link } from "react-router-dom";
import RouteFallback from "../components/RouteFallback";

const GuestLayout = () => {
  return (
    <div className="min-h-screen bg-base-100">
      <header className="navbar bg-primary text-primary-content px-4 md:px-8">
        <p className="font-bold text-lg">TMT-EGREEN</p>
      </header>
      <main>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="footer footer-center mt-auto p-4 bg-base-200 text-base-content text-sm">
        Gửi nhu cầu vị trí sạc xe
      </footer>
    </div>
  );
};

export default GuestLayout;
