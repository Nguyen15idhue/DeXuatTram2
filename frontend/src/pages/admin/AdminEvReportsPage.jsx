import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { evReportService } from "../../services/api";
import DynamicTable from "../../components/dynamic/DynamicTable";
import RecordDetailPopup from "../../components/admin/RecordDetailPopup";
import Toast from "../../components/Toast";
import ConfirmDialog from "../../components/ConfirmDialog";
import ErrorMessage from "../../components/ErrorMessage";
import Pagination from "../../components/Pagination";
import useDefaultViewId from "../../hooks/useDefaultViewId";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import { MapPin, Search, RotateCcw } from "lucide-react";

const EV_REPORTS_VIEW_ID = 17;

const AdminEvReportsPage = () => {
  const { token, isSales } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const evReportsViewId = useDefaultViewId(
    "ev_charging_reports",
    EV_REPORTS_VIEW_ID,
  );
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "success" });
  const [confirmDelete, setConfirmDelete] = useState({
    isOpen: false,
    id: null,
    name: "",
  });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [pagination, setPagination] = useState({ page: 1, limit: 10 });
  const [popup, setPopup] = useState({
    open: false,
    record: null,
    mode: "view",
  });

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await evReportService.adminList(
        { search: debouncedSearch },
        token,
      );
      if (res.success) {
        setReports(res.data || []);
      }
    } catch {
      setError("Lỗi tải danh sách vị trí sạc xe");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, token]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    const match = location.pathname.match(
      /\/admin\/ev-reports\/(view|edit)=(\d+)/,
    );
    if (match) {
      const mode = match[1];
      const id = parseInt(match[2]);
      const existing = reports.find((r) => r.id === id);
      setPopup({ open: true, record: existing || null, mode });
      if (!existing && id) loadReportById(id, mode);
    } else {
      setPopup({ open: false, record: null, mode: "view" });
    }
  }, [location.pathname, reports.length]);

  const loadReportById = async (id, mode) => {
    try {
      const res = await evReportService.adminGetById(id, token);
      if (res.success) {
        setPopup({ open: true, record: res.data, mode });
      }
    } catch {
      /* silent */
    }
  };

  const handleReset = () => {
    setSearch("");
    setPagination({ page: 1, limit: 10 });
    setError("");
  };

  const handleDeleteClick = (id, name) => {
    setConfirmDelete({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id } = confirmDelete;
    setConfirmDelete({ isOpen: false, id: null, name: "" });
    try {
      const res = await evReportService.adminDelete(id, token);
      if (res.success) {
        setToast({ message: "Xóa vị trí sạc thành công", type: "success" });
        loadReports();
      } else {
        setError(res.message || "Xóa thất bại");
      }
    } catch {
      setError("Lỗi kết nối server");
    }
  };

  const pageData = reports.slice(
    (pagination.page - 1) * pagination.limit,
    pagination.page * pagination.limit,
  );
  const totalPages = Math.max(1, Math.ceil(reports.length / pagination.limit));

  const renderActions = (row) => (
    <div className="flex gap-1">
      <button
        className="btn btn-sm btn-primary"
        onClick={() => navigate(`/admin/ev-reports/view=${row.id}`)}
      >
        Xem
      </button>
      {!isSales && (
        <button
          className="btn btn-sm btn-warning"
          onClick={() => navigate(`/admin/ev-reports/edit=${row.id}`)}
        >
          Sửa
        </button>
      )}
      {!isSales && (
        <button
          className="btn btn-sm btn-error"
          onClick={() =>
            handleDeleteClick(row.id, row.full_name || `#${row.id}`)
          }
        >
          Xóa
        </button>
      )}
    </div>
  );

  return (
    <div>
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "success" })}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <MapPin size={24} className="text-primary shrink-0" />
          <h1 className="text-2xl font-bold">Quản lý nhu cầu sạc xe</h1>
        </div>
      </div>

      {error && (
        <ErrorMessage
          message={error}
          onRetry={() => {
            setError("");
            loadReports();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Xóa vị trí sạc"
        message={`Bạn có chắc chắn muốn xóa "${confirmDelete.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, id: null, name: "" })}
        confirmText="Xóa"
        type="danger"
      />

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Tìm theo tên, SĐT, địa chỉ, tỉnh..."
          className="input input-bordered input-sm flex-1 min-w-0"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm gap-1 shrink-0"
          onClick={loadReports}
        >
          <Search size={14} /> <span className="hidden sm:inline">Tìm</span>
        </button>
        {search && (
          <button
            className="btn btn-ghost btn-sm gap-1 shrink-0"
            onClick={handleReset}
          >
            <RotateCcw size={14} />{" "}
            <span className="hidden sm:inline">Xóa lọc</span>
          </button>
        )}
      </div>

      {popup.open && (
        <RecordDetailPopup
          entity="ev_charging_reports"
          record={popup.record}
          recordId={
            popup.record
              ? undefined
              : parseInt(location.pathname.match(/=(\d+)/)?.[1])
          }
          viewId={evReportsViewId}
          mode={isSales ? "view" : popup.mode}
          allowEdit={!isSales}
          updateService={evReportService}
          onClose={() => {
            setPopup({ open: false, record: null, mode: "view" });
            navigate("/admin/ev-reports");
          }}
          onSaved={() => loadReports()}
          onSwitchMode={(newMode) => {
            const id = location.pathname.match(/=(\d+)/)?.[1];
            navigate(`/admin/ev-reports/${newMode}=${id}`, { replace: true });
          }}
        />
      )}

      <DynamicTable
        entity="ev_charging_reports"
        viewId={evReportsViewId}
        data={pageData}
        actions={renderActions}
        startIndex={(pagination.page - 1) * pagination.limit}
      />

      <Pagination
        page={pagination.page}
        totalPages={totalPages}
        total={reports.length}
        onPageChange={(page) => setPagination((p) => ({ ...p, page }))}
        pageSize={pagination.limit}
        onPageSizeChange={(limit) => setPagination({ page: 1, limit })}
      />
      {loading && (
        <div className="text-sm text-base-content/60 mt-2">Đang tải...</div>
      )}
    </div>
  );
};

export default AdminEvReportsPage;
