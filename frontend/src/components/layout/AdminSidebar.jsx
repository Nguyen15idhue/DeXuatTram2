import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useState, useEffect } from "react";
import {
  proposalApprovalService,
  proposalGradingService,
  proposalLayoutService,
  proposalReportService,
  proposalRequestService,
  proposalReviewService,
  proposalSignatureService,
  chargingStationService,
} from "../../services/api";
import {
  resolveGradingRole,
} from "../../utils/proposalGrading";
import { PROPOSAL_TASK_COUNTS_CHANGED_EVENT } from "../../utils/proposalTaskCounts";
import { CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT } from "../../utils/chargingStationTaskCounts";
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
  BatteryCharging,
  Wallet,
  Warehouse,
  FileSpreadsheet,
} from "lucide-react";
import NotificationBell from "./NotificationBell";
import {
  canSeeApprovalPage,
  canSeeFinancePage,
  canSeeLayoutPage,
  canSeeReviewRequestsPage,
} from "../../utils/proposalAccess";

const mainItems = [
  {
    path: "/admin",
    label: "Dashboard",
    icon: BarChart3,
    group: "Tổng quan",
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/proposals",
    label: "Quản lý Đề xuất",
    group: "Quy trình đề xuất",
    icon: ClipboardList,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
    children: [
      {
        path: "/admin/proposals",
        label: "Thông tin chung",
        icon: FileText,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
      },
      {
        path: "/admin/proposals/danh-gia-quy-hoach",
        label: "Chấm điểm Quy hoạch và Pháp lý",
        icon: Scale,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
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
        roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
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
    path: "/admin/on-tram",
    label: "Quản lý ON trạm",
    group: "Quy trình đề xuất",
    icon: BatteryCharging,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
    children: [
      {
        path: "/admin/on-tram/thong-tin-chung",
        label: "Thông tin chung",
        icon: FileText,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
      },
      {
        path: "/admin/on-tram/khoi-tao-hop-dong",
        label: "Khởi tạo hợp đồng",
        icon: PenSquare,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
      },
      {
        path: "/admin/on-tram/xay-dung-ha-tang",
        label: "Xây dựng hạ tầng",
        icon: Scale,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
      },
      {
        path: "/admin/on-tram/giao-tru",
        label: "Giao trụ",
        icon: Zap,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
      },
      {
        path: "/admin/on-tram/lap-tru",
        label: "Lắp trụ",
        icon: PenTool,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
      },
      {
        path: "/admin/on-tram/nghiem-thu",
        label: "Nghiệm thu",
        icon: FileCheck,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
      },
      {
        path: "/admin/on-tram/on-tram",
        label: "On trạm",
        icon: MapPin,
        roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
      },
    ],
  },
  {
    path: "/admin/e-sign",
    label: "Quản lý Chữ ký số",
    group: "Quy trình đề xuất",
    icon: File,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"],
  },
  {
    path: "/admin/tai-chinh",
    label: "Quản lý tài chính",
    group: "Vận hành",
    icon: Wallet,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
    access: canSeeFinancePage,
  },
  {
    path: "/admin/kho",
    label: "Quản lý kho",
    group: "Vận hành",
    icon: Warehouse,
    roles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    path: "/admin/stations",
    label: "Quản lý Trạm",
    group: "Vận hành",
    icon: Zap,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/ev-reports",
    label: "Quản lý Nhu cầu sạc",
    group: "Khách hàng",
    icon: MapPin,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/excel-export",
    label: "Xuất Excel",
    icon: FileSpreadsheet,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/leads",
    label: "Quản lý Leads",
    group: "Khách hàng",
    icon: Target,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "MKT"],
  },
  {
    path: "/admin/users",
    label: "Quản lý Users",
    group: "Quản trị",
    icon: Users,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES"],
  },
  {
    path: "/admin/reports",
    label: "Báo cáo",
    group: "Báo cáo & nhật ký",
    icon: PieChart,
    roles: ["SUPER_ADMIN", "ADMIN", "SALES", "MKT"],
  },
  {
    path: "/admin/audit-log",
    label: "Audit Log",
    group: "Báo cáo & nhật ký",
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

const proposalTaskKeyByPath = {
  "/admin/proposals": "requests",
  "/admin/proposals/danh-gia-quy-hoach": "grading",
  "/admin/proposals/yeu-cau-cham-diem-lai": "review",
  "/admin/proposals/danh-gia-layout": "layout",
  "/admin/proposals/lap-to-trinh": "reports",
  "/admin/proposals/duyet-bcdx": "approval",
  "/admin/proposals/trinh-ky": "signatures",
};

const chargingStationTaskKeyByPath = {
  "/admin/on-tram/khoi-tao-hop-dong": "contract",
  "/admin/on-tram/xay-dung-ha-tang": "infrastructure",
  "/admin/on-tram/giao-tru": "delivery",
  "/admin/on-tram/lap-tru": "installation",
  "/admin/on-tram/nghiem-thu": "acceptance",
  "/admin/on-tram/on-tram": "on_station",
};

const chargingStationTaskTitleByKey = {
  contract: "công việc Khởi tạo hợp đồng",
  infrastructure: "công việc Xây dựng hạ tầng",
  delivery: "công việc Giao trụ",
  installation: "công việc Lắp trụ",
  acceptance: "công việc Nghiệm thu",
  on_station: "công việc On trạm",
};

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
  pathname === path || (path !== "/admin" && pathname.startsWith(`${path}/`));

const isItemActiveExact = (pathname, path) => pathname === path;

const getActivePath = (pathname, items) =>
  items
    .filter((item) => isItemActive(pathname, item.path))
    .reduce((activePath, item) => (
      !activePath || item.path.length > activePath.length ? item.path : activePath
    ), null);

const filterItemsByRole = (items, user) =>
  items.filter((item) => (!item.roles || item.roles.includes(user?.role))
    && (!item.access || item.access(user)));

const AdminSidebar = ({ onNavClick, showBell = true }) => {
  const { user, token, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [mainCollapsed, setMainCollapsed] = useState({});
  const [proposalTaskCounts, setProposalTaskCounts] = useState(null);
  const [chargingStationTaskCounts, setChargingStationTaskCounts] = useState(null);
  const gradingRole = resolveGradingRole(user?.department);
  const canSeeProposalMenu = ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"].includes(user?.role);
  const canSeeChargingStationMenu = ["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"].includes(user?.role);
  const canSeeGradingTaskCount = user?.role === "SUPER_ADMIN"
    || (user?.role === "ADMIN" && ["QH", "PL"].includes(gradingRole));
  const proposalTaskTotal = proposalTaskCounts
    ? Object.values(proposalTaskCounts).every(Number.isFinite)
      ? Object.values(proposalTaskCounts).reduce((total, count) => total + count, 0)
      : null
    : null;
  const formatTaskCount = (count) => count > 99 ? "99+" : count;

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

  useEffect(() => {
    const proposalItem = mainItems.find((item) => item.path === "/admin/proposals");
    const activeChildPath = getActivePath(
      location.pathname,
      filterItemsByRole(proposalItem?.children || [], user),
    );
    if (!activeChildPath) return;

    setMainCollapsed((current) => (
      current[proposalItem.path]
        ? current
        : { ...current, [proposalItem.path]: true }
    ));
  }, [location.pathname, user]);

  useEffect(() => {
    let cancelled = false;
    let loadSequence = 0;

    const loadProposalTaskCounts = async () => {
      const currentSequence = ++loadSequence;
      if (!token || !canSeeProposalMenu) {
        setProposalTaskCounts(null);
        return;
      }

      const sources = [{
        key: "requests",
        load: () => proposalRequestService.getAll(
          "status=OPEN&work_scope=mine&page=1&limit=1",
          token,
        ),
      }];

      if (canSeeGradingTaskCount) {
        sources.push({
          key: "grading",
          load: () => proposalGradingService.getAll(
            "tab=pending&page=1&limit=1",
            token,
          ),
        });
      }
      if (canSeeReviewRequestsPage(user)) {
        sources.push({
          key: "review",
          load: () => proposalReviewService.getAll(
            "tab=pending&page=1&limit=1",
            token,
          ),
        });
      }
      if (canSeeLayoutPage(user)) {
        sources.push({
          key: "layout",
          load: () => proposalLayoutService.getAll(
            "tab=pending&page=1&limit=1",
            token,
          ),
        });
      }
      if (["SUPER_ADMIN", "ADMIN", "SALES", "CTV"].includes(user.role)) {
        sources.push({
          key: "reports",
          load: () => proposalReportService.getAll(
            "tab=pending&page=1&limit=1",
            token,
          ),
        });
      }
      if (canSeeApprovalPage(user)) {
        sources.push({
          key: "approval",
          load: () => proposalApprovalService.getAll(
            "tab=pending&page=1&limit=1",
            token,
          ),
        });
      }
      if (["SUPER_ADMIN", "ADMIN", "SALES", "CTV"].includes(user.role)) {
        sources.push({
          key: "signatures",
          load: () => proposalSignatureService.getAll(
            "tab=pending&my_status=my_pending&page=1&limit=1",
            token,
          ),
        });
      }

      const results = await Promise.all(sources.map(async ({ key, load }) => {
        try {
          const response = await load();
          const total = Number(response?.pagination?.total);
          if (!Number.isFinite(total) || total < 0) {
            throw new Error(`Invalid task count response for ${key}`);
          }
          return [key, total];
        } catch (error) {
          console.error(`Load proposal ${key} task count error:`, error);
          return [key, null];
        }
      }));

      if (!cancelled && currentSequence === loadSequence) {
        setProposalTaskCounts(Object.fromEntries(results));
      }
    };

    loadProposalTaskCounts();
    window.addEventListener("focus", loadProposalTaskCounts);
    window.addEventListener(PROPOSAL_TASK_COUNTS_CHANGED_EVENT, loadProposalTaskCounts);
    const intervalId = window.setInterval(loadProposalTaskCounts, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadProposalTaskCounts);
      window.removeEventListener(PROPOSAL_TASK_COUNTS_CHANGED_EVENT, loadProposalTaskCounts);
      window.clearInterval(intervalId);
    };
  }, [canSeeGradingTaskCount, canSeeProposalMenu, location.pathname, token, user]);

  useEffect(() => {
    let cancelled = false;
    let loadSequence = 0;

    const loadChargingStationTaskCounts = async () => {
      const currentSequence = ++loadSequence;
      if (!token || !canSeeChargingStationMenu) {
        setChargingStationTaskCounts(null);
        return;
      }

      try {
        const response = await chargingStationService.getTaskCounts(token);
        const counts = response?.data?.counts;
        const taskKeys = [
          "contract",
          "infrastructure",
          "delivery",
          "installation",
          "acceptance",
          "on_station",
          "finance",
        ];
        const onStationTaskKeys = taskKeys.filter((key) => key !== "finance");
        if (
          response?.success !== true
          || !counts
          || taskKeys.some((key) => !Number.isFinite(Number(counts[key])) || Number(counts[key]) < 0)
        ) {
          throw new Error("Invalid ON-station task count response");
        }

        const normalizedCounts = Object.fromEntries(
          taskKeys.map((key) => [key, Number(counts[key])]),
        );
        const total = onStationTaskKeys.reduce((sum, key) => sum + normalizedCounts[key], 0);
        if (Number(response.data.total) !== total) {
          throw new Error("ON-station task total does not match stage counts");
        }

        if (!cancelled && currentSequence === loadSequence) {
          setChargingStationTaskCounts({ total, counts: normalizedCounts });
        }
      } catch (error) {
        console.error("Load ON-station task counts error:", error);
        if (!cancelled && currentSequence === loadSequence) {
          setChargingStationTaskCounts(null);
        }
      }
    };

    loadChargingStationTaskCounts();
    window.addEventListener("focus", loadChargingStationTaskCounts);
    window.addEventListener(CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT, loadChargingStationTaskCounts);
    const intervalId = window.setInterval(loadChargingStationTaskCounts, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadChargingStationTaskCounts);
      window.removeEventListener(CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT, loadChargingStationTaskCounts);
      window.clearInterval(intervalId);
    };
  }, [canSeeChargingStationMenu, location.pathname, token]);

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
        : "text-base-content/70 hover:bg-base-300 hover:text-base-content"
    }`;

  const renderLink = (item, activePath = null) => {
    const isActive = activePath
      ? activePath === item.path
      : isItemActiveExact(location.pathname, item.path);
    const taskKey = proposalTaskKeyByPath[item.path];
    const chargingStationTaskKey = chargingStationTaskKeyByPath[item.path];
    const taskCount = taskKey
      ? proposalTaskCounts?.[taskKey]
      : chargingStationTaskKey
        ? chargingStationTaskCounts?.counts[chargingStationTaskKey]
      : item.path === "/admin/tai-chinh"
        ? chargingStationTaskCounts?.counts.finance
        : null;
    const taskTitle = item.path === "/admin/tai-chinh"
      ? "công việc Tài chính ON trạm"
      : chargingStationTaskKey
        ? chargingStationTaskTitleByKey[chargingStationTaskKey]
      : "công việc cần thực hiện";
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
        {Number.isFinite(taskCount) && taskCount > 0 && (
          <span
            className="badge badge-error badge-sm ml-auto h-5 min-w-5 flex-shrink-0 rounded-full px-1 text-white"
            title={`${taskCount} ${taskTitle}`}
            aria-label={`${taskCount} ${taskTitle}`}
          >
            {formatTaskCount(taskCount)}
          </span>
        )}
      </Link>
    );
  };

  const renderMainItem = (item) => {
    const isActiveExact = isItemActiveExact(location.pathname, item.path);
    const hasChildren = item.children && item.children.length > 0;
    const visibleChildren = filterItemsByRole(item.children || [], user);

    // Parent active if exact match OR any child matches
    let isActive = isActiveExact;
    let activeChildPath = null;
    if (hasChildren) {
      activeChildPath = getActivePath(location.pathname, visibleChildren);
      isActive = !!activeChildPath || isActiveExact;
    }
    const isOpen = mainCollapsed[item.path] ?? !!activeChildPath;
    const taskCount = item.path === "/admin/proposals"
      ? proposalTaskTotal
      : item.path === "/admin/on-tram"
        ? chargingStationTaskCounts?.total
        : null;
    const taskTitle = item.path === "/admin/proposals"
      ? "công việc cần thực hiện trong Quản lý Đề xuất"
      : "công việc cần thực hiện trong Quản lý ON trạm";

    if (hasChildren) {
      return (
        <div key={item.path} className="mb-1">
          <button
            type="button"
            onClick={() => toggleMainItem(item.path)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 ${isActive ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-300 hover:text-base-content"}`}
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
            <span className="flex items-center gap-2">
              {Number.isFinite(taskCount) && taskCount > 0 && (
                <span
                  className="badge badge-error badge-sm h-5 min-w-5 rounded-full px-1 text-white"
                  title={`${taskCount} ${taskTitle}`}
                  aria-label={`${taskCount} ${taskTitle}`}
                >
                  {formatTaskCount(taskCount)}
                </span>
              )}
              <ChevronDown
                size={14}
                className={`transition-transform ${isOpen ? "" : "-rotate-90"}`}
              />
            </span>
          </button>
          {isOpen && (
            <div className="ml-2 border-b mt-1 space-y-1 border-l border-base-300 rounded-bl-xl pl-2">
              {visibleChildren.map((child) => renderLink(child, activeChildPath))}
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
        {(() => {
          const grouped = [];
          visibleMain.forEach((item) => {
            const label = item.group || 'Khác';
            const last = grouped[grouped.length - 1];
            if (!last || last.label !== label) grouped.push({ label, items: [item] });
            else last.items.push(item);
          });
          return grouped.map((group, groupIndex) => (
            <div key={`${group.label}-${groupIndex}`} className="mb-2">
              <div className="px-2 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-primary">
                {group.label}
              </div>
              {group.items.map(renderMainItem)}
            </div>
          ));
        })()}
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
                className="w-full flex items-center justify-between px-2 pt-3 pb-2 text-xs font-semibold text-base-content/50 uppercase tracking-wider hover:bg-base-200 hover:text-base-content rounded-lg transition-colors"
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-base-content/70 hover:bg-base-300 hover:text-base-content transition-all duration-150 hl-dash"
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
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${location.pathname === "/admin/huong-dan" ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-300 hover:text-base-content"}`}
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
