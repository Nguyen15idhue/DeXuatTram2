import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import RouteFallback from "../components/RouteFallback";
import { Phone, Mail, MapPin } from "lucide-react";

const GuestLayout = () => {
  return (
    <div className="min-h-screen bg-base-100 flex flex-col">
      <header className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/brand/tmt-egreen-logo.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-green-950/85 via-green-800/70 to-emerald-600/55" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-20">
          <h1
            className="text-5xl md:text-7xl font-black tracking-tight leading-none"
            style={{ textShadow: "0 6px 24px rgba(0,0,0,0.45)" }}
          >
            <span className="text-white">TMT</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-300 via-emerald-200 to-white">
              -EGREEN
            </span>
          </h1>
          <p className="mt-4 text-base md:text-xl text-white/90 max-w-2xl leading-relaxed">
            Hệ thống quản lý & đề xuất trạm sạc điện — cùng bạn kiến tạo tương lai xanh.
          </p>
        </div>
      </header>
      <main className="flex-1">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="mt-auto bg-gray-950 text-gray-300">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h4 className="text-white font-bold text-lg mb-4">TMT-EGREEN</h4>
            <ul className="space-y-2 text-sm text-gray-400 leading-relaxed">
              <li>Ngày thành lập: 22/05/2025</li>
              <li>
                Giấy chứng nhận đăng ký doanh nghiệp Số 0111060371 – Sở tài chính Hà Nội cấp ngày
                22/05/2025
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-4">Liên hệ</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li className="flex items-start gap-3">
                <Phone size={16} className="text-gray-400 mt-0.5 shrink-0" />
                <span>037 585 2469</span>
              </li>
              <li className="flex items-start gap-3">
                <Mail size={16} className="text-gray-400 mt-0.5 shrink-0" />
                <span>admin-egreen@tmt-vietnam.com</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={16} className="text-gray-400 mt-0.5 shrink-0" />
                <span>Tầng 9+10 tòa nhà Coninco, số 4 Tôn Thất Tùng, P. Kim Liên, TP. Hà Nội, Việt Nam</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-gray-500">
            <span>© {new Date().getFullYear()} TMT-EGREEN. All rights reserved.</span>
            <span>Thiết kế & phát triển bởi TMT-EGREEN</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default GuestLayout;
