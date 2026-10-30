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
import {
  Clock3,
  ExternalLink,
  MapPin,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";

const AdminEvReportsPage = () => {
  const { token, isSales } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const evReportsViewId = useDefaultViewId("ev_charging_reports", null);
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
  const [sheetStatus, setSheetStatus] = useState({
    loading: true,
    data: null,
    error: "",
  });
  const [sheetSyncing, setSheetSyncing] = useState(false);

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

  const loadSheetStatus = useCallback(async () => {
    try {
      const res = await evReportService.adminSheetStatus(token);
      if (!res.success)
        throw new Error(res.message || "Không tải được trạng thái");
      setSheetStatus({ loading: false, data: res.data, error: "" });
    } catch (err) {
      setSheetStatus({
        loading: false,
        data: null,
        error: err.message || "Không kết nối được với server",
      });
    }
  }, [token]);

  useEffect(() => {
    loadSheetStatus();
  }, [loadSheetStatus]);

  const handleSheetSync = async () => {
    setSheetSyncing(true);
    try {
      const res = await evReportService.adminSheetSync(token);
      if (!res.success) throw new Error(res.message || "Đồng bộ thất bại");
      setToast({ message: res.message, type: "success" });
      await loadSheetStatus();
    } catch (err) {
      setToast({
        message: err.message || "Không kết nối được với server",
        type: "error",
      });
      await loadSheetStatus();
    } finally {
      setSheetSyncing(false);
    }
  };

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
        <a
          href="/nhu-cau-sac-xe"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm gap-1 self-start sm:self-auto"
        >
          <PlusCircle size={16} /> Thêm nhu cầu sạc xe
        </a>
      </div>

      <section className="rounded-lg border border-base-300 bg-base-100 p-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Đồng bộ Google Sheet</h2>
            <p className="text-sm text-base-content/70 mt-1">
              Chỉ thêm khách mới có nhu cầu hợp tác; các cột chăm sóc hiện có
              không bị ghi đè.
            </p>
            {sheetStatus.loading ? (
              <p className="text-sm text-base-content/60 mt-2">
                Đang kiểm tra cấu hình...
              </p>
            ) : sheetStatus.error ? (
              <p className="text-sm text-error mt-2">{sheetStatus.error}</p>
            ) : (
              <>
                {/* <p className="text-sm text-base-content/70 mt-2">
                  {sheetStatus.data.configured
                    ? `Tab: ${sheetStatus.data.tabName} · Lịch: ${sheetStatus.data.cron}`
                    : sheetStatus.data.message || "Chưa cấu hình Google Sheet"}
                </p> */}
                {sheetStatus.data.lastRun && (
                  <p className="text-sm text-base-content/70 mt-1">
                    <Clock3 size={14} className="inline mr-1" />
                    Lần gần nhất: {sheetStatus.data.lastRun.status}
                    {sheetStatus.data.lastRun.completed_at
                      ? ` · ${new Date(
                          sheetStatus.data.lastRun.completed_at,
                        ).toLocaleString("vi-VN")}`
                      : ""}
                    {sheetStatus.data.lastRun.status === "SUCCESS"
                      ? ` · thêm ${sheetStatus.data.lastRun.inserted_count} bản ghi`
                      : ""}
                    {sheetStatus.data.lastRun.error_message
                      ? ` · ${sheetStatus.data.lastRun.error_message}`
                      : ""}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {sheetStatus.data?.spreadsheetUrl && (
              <a
                href={sheetStatus.data.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm gap-2"
              >
                <ExternalLink size={15} /> Mở Google Sheet
              </a>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm gap-2"
              onClick={handleSheetSync}
              disabled={
                sheetSyncing ||
                sheetStatus.loading ||
                !sheetStatus.data?.configured
              }
            >
              <RefreshCw
                size={15}
                className={sheetSyncing ? "animate-spin" : ""}
              />
              {sheetSyncing ? "Đang đồng bộ..." : "Đồng bộ ngay"}
            </button>
          </div>
        </div>
      </section>

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
