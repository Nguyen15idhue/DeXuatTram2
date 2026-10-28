import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { proposalRequestService, proposalReviewService } from "../../services/api";
import useFieldOptions from "../../hooks/useFieldOptions";
import useMediaQuery from "../../hooks/useMediaQuery";
import DynamicTable from "../dynamic/DynamicTable";
import Pagination from "../Pagination";
import ReviewActionDialog from "./ReviewActionDialog";
import { ProposalCodeLink, ProposalPersonLink } from "./ProposalLinkCells";
import {
  PROPOSAL_CONTEXT_COLUMNS,
  PROPOSAL_HIDDEN_COLUMN_KEYS,
  PROPOSAL_HIDDEN_COLUMN_LABELS,
  ProposalAddressCell,
  ProposalManagerCell,
  ProposalProvinceCell,
  ProposalRegionCell
} from "./ProposalTableCells";
import Toast from "../Toast";
import {
  formatScore,
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone,
  getPartialGradingProgress,
} from "../../utils/proposalGrading";
import {
  ProposalModelBadge,
  ProposalStatusBadge,
} from "./ProposalTableBadges";
import ProposalAdvancedFilters from "./ProposalAdvancedFilters";
import { FilterBody, FilterToggle } from "../ui/FilterPanel";
import {
  Check,
  RotateCcw,
  Search,
  Send,
  X,
  XCircle,
} from "lucide-react";

const REVIEW_COLUMNS = [
  { key: "ma_de_xuat", field_key: "ma_de_xuat", label: "Mã đề xuất", width: 140, sortable: true, filterable: false, visible: true },
  { key: "legal_name", field_key: "legal_name", label: "Tên pháp nhân", width: 180, sortable: false, filterable: false, visible: true },
  { key: "phone", field_key: "phone", label: "SĐT liên hệ", width: 120, sortable: false, filterable: false, visible: true },
  { key: "mo_hinh_dau_tu", field_key: "mo_hinh_dau_tu", label: "Mô hình đầu tư", width: 140, sortable: false, filterable: false, visible: true },
  { key: "scale", field_key: "scale", label: "Quy mô trụ đề xuất", width: 160, sortable: false, filterable: false, visible: true },
  { key: "user_name", field_key: "user_name", label: "Người đề xuất", width: 160, sortable: false, filterable: false, visible: true },
  ...PROPOSAL_CONTEXT_COLUMNS,
  { key: "status", field_key: "status", label: "Trạng thái Quy trình", width: 160, sortable: true, filterable: false, visible: true },
  { key: "review_level", field_key: "review_level", label: "Mức độ xem xét", width: 160, sortable: false, filterable: false, visible: true },
  { key: "quy_hoach_score", field_key: "quy_hoach_score", label: "Điểm Quy hoạch", width: 130, sortable: false, filterable: false, visible: true },
  { key: "phap_ly_score", field_key: "phap_ly_score", label: "Điểm Pháp lý", width: 130, sortable: false, filterable: false, visible: true },
];

const ACTION_CONFIG = {
  regrade: {
    title: "Yêu cầu đánh giá lại",
    description:
      "Chọn phòng cần chấm lại. Điểm hiện tại sẽ được giữ nguyên cho đến khi phòng được chọn nhập điểm mới.",
    confirmText: "Gửi yêu cầu",
    confirmClass: "btn-warning",
    reasonLabel: "Lý do yêu cầu đánh giá lại",
    reasonPlaceholder:
      "Ví dụ: Điểm Quy hoạch chưa phù hợp với thực tế, đề nghị xem xét lại...",
    api: proposalReviewService.requestRegrade,
  },
  toTgd: {
    title: "Trình Tổng giám đốc xem xét",
    description:
      "Đề xuất sẽ chuyển sang trạng thái Trình Tổng giám đốc xem xét.",
    confirmText: "Trình TGĐ",
    confirmClass: "btn-primary",
    reasonLabel: "Lý do trình Tổng giám đốc",
    reasonPlaceholder: "Nhập lý do trình Tổng giám đốc...",
    api: proposalReviewService.toTgd,
  },
  cancel: {
    title: "Đồng ý hủy đề xuất",
    description:
      "Đề xuất sẽ bị hủy và không tiếp tục quy trình. Vui lòng nhập lý do cụ thể.",
    confirmText: "Đồng ý hủy",
    confirmClass: "btn-error",
    reasonLabel: "Lý do hủy đề xuất",
    reasonPlaceholder: "Nhập lý do hủy đề xuất...",
    api: proposalReviewService.cancel,
  },
  approve: {
    title: "Duyệt đề xuất",
    description: "Đề xuất sẽ chuyển sang trạng thái Đang vẽ Layout.",
    confirmText: "Duyệt đề xuất",
    confirmClass: "btn-success",
    reasonLabel: "Lý do duyệt đề xuất",
    reasonPlaceholder: "Nhập lý do duyệt đề xuất...",
    api: proposalReviewService.approve,
  },
  reject: {
    title: "Đồng ý hủy đề xuất",
    description: "Đề xuất sẽ bị hủy. Vui lòng nhập lý do cụ thể.",
    confirmText: "Đồng ý hủy",
    confirmClass: "btn-error",
    reasonLabel: "Lý do hủy đề xuất",
    reasonPlaceholder: "Nhập lý do hủy đề xuất...",
    api: proposalReviewService.reject,
  },
};

const ScoreCell = ({ score, note }) => {
  if (score === null || score === undefined) {
    return (
      <div className="min-w-24">
        <span className="text-base-content/60">Chưa chấm</span>
        {note && <p className="mt-1 whitespace-pre-wrap text-xs text-base-content/70">{note}</p>}
      </div>
    );
  }
  const scoreNum = Number(score);
  if (Number.isNaN(scoreNum)) {
    return <span className="text-base-content/60">Chưa chấm</span>;
  }
  return (
    <div className="min-w-24">
      <span
        className={
          "badge badge-sm " +
          (scoreNum === 0
            ? "badge-soft"
            : scoreNum === 1
              ? "badge-error"
              : scoreNum === 2
                ? "badge-warning"
                : "badge-success")
        }
      >
        {formatScore(scoreNum)}
      </span>
      {note && <p className="mt-1 whitespace-pre-wrap text-xs text-base-content/70">{note}</p>}
    </div>
  );
};

const ProposalReviewTab = ({ tab, roleKey, isSuperAdmin = false }) => {
  const { token } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { getSelectOptions } = useFieldOptions("station_proposals", [
    "mo_hinh_dau_tu",
    "status",
  ]);
  const modelOptions = getSelectOptions("mo_hinh_dau_tu");

  const canActAsGdttkd = roleKey === "GDTTKD" || isSuperAdmin;
  const canActAsTgd = roleKey === "TGD" || isSuperAdmin;
  const isCompleted = tab === "completed";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({});
  const [appliedFilters, setAppliedFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  const [filterOptionsError, setFilterOptionsError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");

  const [actionDialog, setActionDialog] = useState({
    open: false,
    type: null,
    row: null,
    error: "",
    saving: false,
  });

  const loadItems = useCallback(
    async (
      targetPage = 1,
      targetSize = pageSize,
      targetSearch = search,
      targetFilters = appliedFilters,
    ) => {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("tab", tab);
        if (targetSearch) params.set("search", targetSearch);
        const filterKeys = {
          proposalStatus: "proposal_status",
          model: "model",
          province: "province",
          region: "region",
          ownerUserId: "owner_user_id",
          managerUserId: "manager_user_id",
          dateFrom: "date_from",
          dateTo: "date_to",
        };
        Object.entries(filterKeys).forEach(([key, queryKey]) => {
          if (targetFilters[key]) params.set(queryKey, targetFilters[key]);
        });
        params.set("page", targetPage);
        params.set("limit", targetSize);
        const res = await proposalReviewService.getAll(
          params.toString(),
          token,
        );
        setItems(res?.data || []);
        setPagination(
          res?.pagination || {
            page: targetPage,
            limit: targetSize,
            total: 0,
            totalPages: 0,
          },
        );
      } catch (err) {
        setError(err?.message || "Không tải được danh sách đề xuất");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [token, tab, pageSize, search, appliedFilters],
  );

  useEffect(() => {
    setPage(1);
    loadItems(1);
  }, [tab, search, appliedFilters]);

  useEffect(() => {
    let cancelled = false;
    proposalRequestService.getFilterOptions(token)
      .then((response) => {
        if (cancelled) return;
        setFilterOptions(response?.data || {});
        setFilterOptionsError("");
      })
      .catch((optionsError) => {
        if (!cancelled) setFilterOptionsError(optionsError?.message || "Không tải được tùy chọn bộ lọc");
      });
    return () => { cancelled = true; };
  }, [token]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
    setShowFilter(false);
  };

  const resetFilters = () => {
    setSearch("");
    setSearchInput("");
    setFilters({});
    setAppliedFilters({});
    setPage(1);
  };

  const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length;

  const openAction = (row, type) => {
    setActionDialog({ open: true, type, row, error: "", saving: false });
  };

  const closeAction = () => {
    setActionDialog({
      open: false,
      type: null,
      row: null,
      error: "",
      saving: false,
    });
  };

  const runAction = async (reason, options = {}) => {
    const config = ACTION_CONFIG[actionDialog.type];
    if (!config || !actionDialog.row) return;
    setActionDialog((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      const res = await config.api(actionDialog.row.id, { reason, ...options }, token);
      const roundNo = res?.data?.roundNo;
      const suffix =
        actionDialog.type === "regrade" && roundNo
          ? ` (lần chấm lại ${roundNo})`
          : "";
      setToastMessage(`${res?.message || config.confirmText}${suffix}`);
      setToastType("success");
      closeAction();
      loadItems(page, pageSize);
    } catch (err) {
      setActionDialog((prev) => ({
        ...prev,
        saving: false,
        error: err?.message || "Không thực hiện được thao tác",
      }));
    }
  };

  const renderActions = (row) => {
    if (isCompleted) return null;
    const level = Number(row.review_level);
    const isGdttkdReview = canActAsGdttkd
      && row.status === "GDTTKD_EVALUATING" && level === 1;
    const isGdttkdResubmissionReview = canActAsGdttkd
      && row.status === "RE_GDTTKD_EVALUATING" && level === 2;
    const isTgdReview = canActAsTgd
      && row.status === "TGD_REVIEW" && level === 3;

    if (!isGdttkdReview && !isGdttkdResubmissionReview && !isTgdReview) return null;
    return (
      <div className="flex min-w-44 flex-wrap gap-1">
        {isGdttkdReview && (
          <button type="button" className="btn btn-warning btn-xs gap-1" onClick={() => openAction(row, "regrade")}>
            <RotateCcw size={14} /> Yêu cầu đánh giá lại
          </button>
        )}
        {isGdttkdReview && (
          <button type="button" className="btn btn-ghost btn-xs gap-1 text-error" onClick={() => openAction(row, "cancel")}>
            <XCircle size={14} /> Đồng ý hủy
          </button>
        )}
        {isGdttkdResubmissionReview && (
          <button type="button" className="btn btn-primary btn-xs gap-1" onClick={() => openAction(row, "toTgd")}>
            <Send size={14} /> Trình TGĐ xem xét
          </button>
        )}
        {(isGdttkdResubmissionReview || isTgdReview) && (
          <button type="button" className="btn btn-ghost btn-xs gap-1 text-error" onClick={() => openAction(row, isTgdReview ? "reject" : "cancel")}>
            <XCircle size={14} /> Đồng ý hủy
          </button>
        )}
        {isTgdReview && (
          <button type="button" className="btn btn-success btn-xs gap-1" onClick={() => openAction(row, "approve")}>
            <Check size={14} /> Duyệt đề xuất
          </button>
        )}
      </div>
    );
  };

  const cellRenderers = {
    ma_de_xuat: (row, value) => (
      <ProposalCodeLink
        id={row.id}
        code={value || `#${row.id}`}
        to={`/admin/proposals/yeu-cau-cham-diem-lai/${row.id}`}
      />
    ),
    status: (row, value) => {
      const progress = getPartialGradingProgress(row);
      return (
        <div className="min-w-40 space-y-1">
          <ProposalStatusBadge
            value={value || row.status}
            optionMap={getSelectOptions("status")}
          />
          {progress && <p className="text-xs text-base-content/70">{progress}</p>}
        </div>
      );
    },
    legal_name: (row) => getProposalLegalName(row),
    phone: (row) => getProposalPhone(row),
    mo_hinh_dau_tu: (row, value) => (
      <ProposalModelBadge value={value} options={modelOptions} />
    ),
    manager_name: (row) => <ProposalManagerCell row={row} />,
    vung_mien: (row, value) => <ProposalRegionCell value={value || row.vung_mien} />,
    province: (row, value) => <ProposalProvinceCell value={value || row.province} />,
    address: (row, value) => <ProposalAddressCell row={row} value={value || getProposalAddress(row)} />,
    scale: (row) => formatProposalScale(row),
    user_name: (row, value) => (
      <ProposalPersonLink id={row.user_id} name={value} />
    ),
    quy_hoach_score: (row) => (
      <ScoreCell score={row.quy_hoach_score} note={row.quy_hoach_note} />
    ),
    phap_ly_score: (row) => (
      <ScoreCell score={row.phap_ly_score} note={row.phap_ly_note} />
    ),
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="input input-bordered flex items-center gap-2 input-sm w-72">
          <Search size={14} />
          <input
            className="grow"
            placeholder="Tìm mã, pháp nhân, SĐT, địa chỉ..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSearch();
            }}
          />
          {searchInput && (
            <button
              type="button"
              aria-label="Xóa tìm kiếm"
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <button type="button" className="btn btn-primary btn-sm gap-1" onClick={handleSearch}>
          <Search size={14} /> Tìm kiếm
        </button>
        <FilterToggle
          open={showFilter}
          onToggle={() => setShowFilter((value) => !value)}
          count={activeFilterCount}
        />
      </div>

      {filterOptionsError && <div className="alert alert-warning py-2 text-sm">{filterOptionsError}</div>}

      {tab === "pending" && ["QH", "PL"].includes(roleKey) && (
        <div className="alert alert-info py-2 text-sm">
          Đề xuất đang chờ GĐTTKD xem xét sau khi một phòng chấm chưa phải là yêu cầu chấm lại.
          Mở tab “Tất cả đề xuất” để theo dõi; yêu cầu chấm lại sẽ xuất hiện ở đây sau khi GĐTTKD gửi yêu cầu.
        </div>
      )}

      <FilterBody
        open={showFilter}
        isDesktop={isDesktop}
        title="Bộ lọc yêu cầu chấm điểm lại"
        onClose={() => setShowFilter(false)}
        onApply={applyFilters}
        onReset={resetFilters}
      >
        <ProposalAdvancedFilters
          values={filters}
          onChange={setFilters}
          options={filterOptions}
          dateLabel="Ngày tạo đề xuất"
        />
        {isDesktop && (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Xóa lọc</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={applyFilters}>Áp dụng</button>
          </div>
        )}
      </FilterBody>

      {loading ? (
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error text-sm">{error}</div>
      ) : (
        <>
          <DynamicTable
            entity="station_proposals"
            density="compact"
            columns={REVIEW_COLUMNS}
            hiddenColumnKeys={PROPOSAL_HIDDEN_COLUMN_KEYS}
            hiddenColumnLabels={PROPOSAL_HIDDEN_COLUMN_LABELS}
            data={items}
            startIndex={(page - 1) * pageSize}
            cellRenderers={cellRenderers}
            actions={isCompleted ? undefined : renderActions}
            showActions={!isCompleted}
            frozenColumns={3}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={(p) => {
              setPage(p);
              loadItems(p);
            }}
            pageSize={pageSize}
            onPageSizeChange={(s) => {
              setPage(1);
              setPageSize(s);
              loadItems(1, s);
            }}
          />
        </>
      )}

      <ReviewActionDialog
        isOpen={actionDialog.open}
        title={ACTION_CONFIG[actionDialog.type]?.title || ""}
        description={ACTION_CONFIG[actionDialog.type]?.description || ""}
        confirmText={
          ACTION_CONFIG[actionDialog.type]?.confirmText || "Xác nhận"
        }
        confirmClass={
          ACTION_CONFIG[actionDialog.type]?.confirmClass || "btn-primary"
        }
        reasonLabel={ACTION_CONFIG[actionDialog.type]?.reasonLabel || "Lý do"}
        reasonPlaceholder={
          ACTION_CONFIG[actionDialog.type]?.reasonPlaceholder || "Nhập lý do..."
        }
        showDepartmentSelection={actionDialog.type === "regrade"}
        allowQH={actionDialog.row?.quy_hoach_score !== null && actionDialog.row?.quy_hoach_score !== undefined}
        allowPL={actionDialog.row?.phap_ly_score !== null && actionDialog.row?.phap_ly_score !== undefined}
        requireReason
        saving={actionDialog.saving}
        error={actionDialog.error}
        onClose={closeAction}
        onConfirm={runAction}
      />

      <Toast
        message={toastMessage}
        type={toastType}
        onClose={() => setToastMessage("")}
      />
    </div>
  );
};

export default ProposalReviewTab;
