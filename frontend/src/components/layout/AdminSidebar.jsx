import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useState, useEffect } from "react";
import {
  BarChart3,
  Users,
  Zap,
  ClipboardList,
  Settings,
  Target,
  PieChart,
  FileText,
  File,
  LayoutGrid,
  List,
  Map,
  MapPin,
  LogOut,
  ShieldCheck,
  History,
  BookOpen,
  ChevronDown,
  PenTool,
  Gavel,
  FileCheck,
  PenSquare,
  Scale,
  RotateCcw,
} from "lucide-react";
import NotificationBell from "./NotificationBell";
import {
  canSeeApprovalPage,
  canSeeLayoutPage,
  canSeeReviewRequestsPage,
} from "../../utils/proposalAccess";

const mainItems = [
  {
    path: "/admin",
    label: "Dashboard",
    icon: BarChart3,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/users",
    label: "Quản lý Users",
    icon: Users,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/stations",
    label: "Quản lý Trạm",
    icon: Zap,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/proposals",
    label: "Quản lý Đề xuất",
    icon: ClipboardList,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV"],
    children: [
      {
        path: "/admin/proposals",
        label: "Thông tin chung",
        icon: FileText,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV"],
      },
      {
        path: "/admin/proposals/danh-gia-quy-hoach",
        label: "Đánh giá quy hoạch và Pháp lý",
        icon: Scale,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV"],
      },
      {
        path: "/admin/proposals/yeu-cau-cham-diem-lai",
        label: "Yêu cầu chấm điểm lại",
        icon: RotateCcw,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
        access: canSeeReviewRequestsPage,
      },
      {
        path: "/admin/proposals/danh-gia-layout",
        label: "Đánh giá layout",
        icon: PenTool,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV"],
        access: canSeeLayoutPage,
      },
      {
        path: "/admin/proposals/lap-to-trinh",
        label: "Lập tờ trình BCĐX",
        icon: FileCheck,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV"],
      },
      {
        path: "/admin/proposals/duyet-bcdx",
        label: "Duyệt BCĐX",
        icon: Gavel,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV"],
        access: canSeeApprovalPage,
      },
      {
        path: "/admin/proposals/trinh-ky",
        label: "Trình ký",
        icon: PenSquare,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV"],
      },
    ],
  },
  {
    path: "/admin/e-sign",
    label: "Quản lý Chữ ký số",
    icon: File,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
  },
  {
    path: "/admin/ev-reports",
    label: "Quản lý Nhu cầu sạc",
    icon: MapPin,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/leads",
    label: "Quản lý Leads",
    icon: Target,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "MKT"],
  },
  {
    path: "/admin/reports",
    label: "Báo cáo",
    icon: PieChart,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "MKT"],
  },
  {
    path: "/admin/audit-log",
    label: "Audit Log",
    icon: History,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
];

const configGroups = [
  {
    id: "fields",
    label: "Trường thông tin",
    roles: ["SUPER_ADMIN"],
    items: [
      {
        path: "/admin/fields",
        label: "Định nghĩa trường",
        icon: FileText,
        roles: ["SUPER_ADMIN"],
      },
      {
        path: "/admin/forms",
        label: "Biểu mẫu nhập liệu",
        icon: File,
        roles: ["SUPER_ADMIN"],
      },
      {
        path: "/admin/views",
        label: "Cấu hình bảng",
        icon: LayoutGrid,
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    id: "data",
    label: "Dữ liệu",
    roles: ["SUPER_ADMIN"],
    items: [
      {
        path: "/admin/data-lists",
        label: "Danh mục dữ liệu",
        icon: List,
        roles: ["SUPER_ADMIN"],
      },
      {
        path: "/admin/map-config",
        label: "Cấu hình bản đồ",
        icon: Map,
        roles: ["SUPER_ADMIN"],
      },
      {
        path: "/admin/help",
        label: "Quản lý hướng dẫn",
        icon: BookOpen,
        roles: ["SUPER_ADMIN"],
      },
      {
        path: "/admin/api-configs",
        label: "Kết nối API",
        icon: Settings,
        roles: ["SUPER_ADMIN"],
      },
      {
        path: "/admin/documents",
        label: "Quản lý tài liệu",
        icon: FileText,
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    id: "perms",
    label: "Phân quyền",
    roles: ["SUPER_ADMIN"],
    items: [
      {
        path: "/admin/roles",
        label: "Phân quyền",
        icon: ShieldCheck,
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
];

const STORAGE_KEY = "admin-sidebar-groups";

const loadCollapsed = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const saveCollapsed = (arr) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {}
};

const isItemActive = (pathname, path) =>
  pathname === path || (path !== "/admin" && pathname.startsWith(path));

const isItemActiveExact = (pathname, path) => pathname === path;

const filterItemsByRole = (items, user) =>
  items.filter((item) => (!item.roles || item.roles.includes(user?.role))
    && (!item.access || item.access(user)));

const AdminSidebar = ({ onNavClick, showBell = true }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [mainCollapsed, setMainCollapsed] = useState({});

  useEffect(() => {
    setCollapsed((prev) => {
      const next = prev.filter((id) => {
        const g = configGroups.find((x) => x.id === id);
        if (!g) return false;
        return !g.items.some((it) => isItemActive(location.pathname, it.path));
      });
      if (next.length !== prev.length) {
        saveCollapsed(next);
        return next;
      }
      return prev;
    });
  }, [location.pathname]);

  const toggleGroup = (id) => {
    setCollapsed((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      saveCollapsed(next);
      return next;
    });
  };

  const toggleMainItem = (itemPath) => {
    setMainCollapsed((prev) => ({
      ...prev,
      [itemPath]: !prev[itemPath],
    }));
  };

  const visibleMain = filterItemsByRole(mainItems, user);
  const visibleGroups = configGroups
    .filter((g) => !g.roles || g.roles.includes(user?.role))
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.roles || it.roles.includes(user?.role)),
    }))
    .filter((g) => g.items.length > 0);

  const linkClass = (isActive) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 ${
      isActive
        ? "bg-primary text-primary-content shadow-sm"
        : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
    }`;

  const renderLink = (item) => {
    const isActive = isItemActiveExact(location.pathname, item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        className={linkClass(isActive)}
        onClick={onNavClick}
        title={item.label}
      >
        <item.icon
          size={18}
          className={isActive ? "text-primary-content" : ""}
        />
        <span className="truncate" title={item.label}>
          {item.label}
        </span>
      </Link>
    );
  };

  const renderMainItem = (item) => {
    const isActiveExact = isItemActiveExact(location.pathname, item.path);
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = mainCollapsed[item.path];

    // Parent active if exact match OR any child matches
    let isActive = isActiveExact;
    if (hasChildren) {
      const visibleChildren = filterItemsByRole(item.children, user);
      isActive =
        visibleChildren.some((c) =>
          isItemActiveExact(location.pathname, c.path),
        ) || isActiveExact;
    }

    if (hasChildren) {
      const visibleChildren = filterItemsByRole(item.children, user);
      return (
        <div key={item.path} className="mb-1">
          <button
            type="button"
            onClick={() => toggleMainItem(item.path)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 ${isActive ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-200 hover:text-base-content"}`}
            title={item.label}
          >
            <span className="flex items-center gap-3">
              <item.icon
                size={18}
                className={isActive ? "text-primary-content" : ""}
              />
              <span className="truncate" title={item.label}>
                {item.label}
              </span>
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform ${isOpen ? "" : "-rotate-90"}`}
            />
          </button>
          {isOpen && (
            <div className="ml-2 border-b mt-1 space-y-1 border-l border-base-300 rounded-bl-xl pl-2">
              {visibleChildren.map(renderLink)}
            </div>
          )}
        </div>
      );
    }
    return renderLink(item);
  };

  return (
    <aside className="w-64 h-full flex flex-col bg-base-100 border-r border-base-300">
      {/* Header */}
      <div className="px-5 py-4 border-b border-base-300 flex-shrink-0 flex items-center justify-between">
        <Link
          to="/admin"
          className="text-lg font-bold text-primary"
          onClick={onNavClick}
        >
          Admin Panel
        </Link>
        {showBell && <NotificationBell mode="admin" />}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        {visibleMain.map(renderMainItem)}
        {visibleGroups.length > 0 && (
          <div className="border-t border-base-300 my-3 mx-1" />
        )}
        {visibleGroups.map((g) => {
          const isCollapsed = collapsed.includes(g.id);
          return (
            <div key={g.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                className="w-full flex items-center justify-between px-2 pt-3 pb-2 text-xs font-semibold text-base-content/50 uppercase tracking-wider hover:text-base-content"
                title={g.label}
              >
                <span title={g.label}>{g.label}</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                />
              </button>
              {!isCollapsed && g.items.map(renderLink)}
            </div>
          );
        })}
        <div className="border-t border-base-300 my-3 mx-1" />
        <Link
          to="/map"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-base-content/70 hover:bg-base-200 hover:text-base-content transition-all duration-150 hl-dash"
          onClick={onNavClick}
          title="Xem bản đồ"
        >
          <MapPin size={18} />
          <span className="truncate" title="Xem bản đồ">
            Xem bản đồ
          </span>
        </Link>
        <Link
          to="/admin/huong-dan"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${location.pathname === "/admin/huong-dan" ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-200 hover:text-base-content"}`}
          onClick={onNavClick}
          title="Hướng dẫn"
        >
          <BookOpen size={18} />
          <span className="truncate" title="Hướng dẫn">
            Hướng dẫn
          </span>
        </Link>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-base-300 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
            {user?.full_name?.charAt(0)?.toUpperCase() || "A"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-base-content truncate">
              {user?.full_name}
            </div>
            <div className="text-xs text-base-content/50 uppercase">
              {user?.role}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="btn btn-sm btn-ghost text-base-content/60 hover:text-error hover:bg-error/10 w-full gap-2 justify-start"
        >
          <LogOut size={14} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
