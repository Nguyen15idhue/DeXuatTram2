import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalGradingService } from '../../services/api';
import useFieldOptions from '../../hooks/useFieldOptions';
import useMediaQuery from '../../hooks/useMediaQuery';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import ProposalAdvancedFilters from './ProposalAdvancedFilters';
import { FilterBody, FilterToggle } from '../ui/FilterPanel';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import {
  PROPOSAL_CONTEXT_COLUMNS,
  ProposalAddressCell,
  ProposalManagerCell,
  ProposalProvinceCell,
  ProposalRegionCell
} from './ProposalTableCells';
import {
  formatScore,
  formatProposalMoney,
  getProposalCostRows,
  getProposalNumber,
  getProposalPoleGroups,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone,
  getMissingLegalDocs,
  isLegalDocsComplete,
  getPartialGradingProgress
} from '../../utils/proposalGrading';
import { ProposalModelBadge, ProposalStatusBadge } from './ProposalTableBadges';
import { Pencil, RotateCcw, Search, X } from 'lucide-react';

const GRADING_COLUMNS = [
  { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', width: 120, sortable: true, filterable: false, visible: true },
  { key: 'legal_name', field_key: 'legal_name', label: 'Tên pháp nhân', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'phone', field_key: 'phone', label: 'SĐT liên hệ', width: 120, sortable: false, filterable: false, visible: true },
  { key: 'mo_hinh_dau_tu', field_key: 'mo_hinh_dau_tu', label: 'Mô hình đầu tư', width: 140, sortable: false, filterable: false, visible: true },
  ...PROPOSAL_CONTEXT_COLUMNS,
  { key: 'scale', field_key: 'scale', label: 'Loại trụ đề xuất', width: 300, sortable: false, filterable: false, visible: true },
  { key: 'cost_breakdown', field_key: 'cost_breakdown', label: 'Chi phí liên kết', width: 220, sortable: false, filterable: false, visible: true },
  { key: 'user_name', field_key: 'user_name', label: 'Người đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'status', field_key: 'status', label: 'Trạng thái Quy trình', width: 170, sortable: false, filterable: false, visible: true },
  { key: 'quy_hoach_status', field_key: 'quy_hoach_status', label: 'Trạng thái Quy hoạch', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'phap_ly_status', field_key: 'phap_ly_status', label: 'Trạng thái Pháp lý', width: 190, sortable: false, filterable: false, visible: true },
  { key: 'grading_result', field_key: 'grading_result', label: 'Trạng thái chấm điểm', width: 150, sortable: false, filterable: false, visible: true }
];

const QuyHoachStatusCell = ({ row, onShowScore }) => {
  const done = row.quy_hoach_score !== null && row.quy_hoach_score !== undefined;
  if (row.quy_hoach_regrade_pending) {
    return done ? (
      <button type="button" className="link link-warning underline" onClick={() => onShowScore({ open: true, dept: 'QH', title: 'Quy hoạch', row })}>
        Đang chờ Quy hoạch chấm lại
      </button>
    ) : <span className="badge badge-warning badge-sm">Đang chờ Quy hoạch chấm lại</span>;
  }
  if (done) {
    return (
      <button
        type="button"
        className="link link-success underline cursor-pointer"
        title="Xem điểm và đánh giá của Quy hoạch"
        onClick={() => onShowScore({ open: true, dept: 'QH', title: 'Quy hoạch', row })}
      >
        Quy hoạch đã chấm xong
      </button>
    );
  }
  return <span className="text-base-content/60">Quy hoạch chưa chấm xong</span>;
};

const PhapLyStatusCell = ({ row, onShowScore }) => {
  const complete = isLegalDocsComplete(row);
  const done = row.phap_ly_score !== null && row.phap_ly_score !== undefined;
  if (row.phap_ly_regrade_pending) {
    return done ? (
      <button type="button" className="link link-warning underline" onClick={() => onShowScore({ open: true, dept: 'PL', title: 'Pháp lý', row })}>
        Đang chờ Pháp lý chấm lại
      </button>
    ) : <span className="badge badge-warning badge-sm">Đang chờ Pháp lý chấm lại</span>;
  }
  if (done) {
    return (
      <button
        type="button"
        className="link link-success underline cursor-pointer"
        title="Xem điểm và đánh giá của Pháp lý"
        onClick={() => onShowScore({ open: true, dept: 'PL', title: 'Pháp lý', row })}
      >
        Pháp lý đã chấm xong
      </button>
    );
  }
  if (!complete) {
    const missing = getMissingLegalDocs(row);
    return (
      <span className="badge badge-warning badge-sm" title={`Thiếu: ${missing.join(', ')}`}>
        Pháp lý chờ bổ sung thông tin
      </span>
    );
  }
  return <span className="text-base-content/60">Pháp lý chưa chấm xong</span>;
};

const ScoreDetailDialog = ({ detail, onClose }) => {
  if (!detail?.open) return null;
  const missing = getMissingLegalDocs(detail.row);
  const score = detail.dept === 'QH' ? detail.row?.quy_hoach_score : detail.row?.phap_ly_score;
  const note = detail.dept === 'QH' ? detail.row?.quy_hoach_note : detail.row?.phap_ly_note;
  return (
    <dialog className="modal modal-open" style={{ zIndex: 60 }}>
      <div className="modal-box max-w-md">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold">Điểm {detail.title}</h3>
            <p className="text-sm text-base-content/70">
              {detail.row?.ma_de_xuat || `#${detail.row?.id}`}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-base-content/70">Điểm:</span>
            <span className="badge badge-primary">{formatScore(score)}</span>
          </div>
          <div>
            <span className="text-sm text-base-content/70">Đánh giá:</span>
            <p className="text-sm whitespace-pre-wrap">{note || '(không có)'}</p>
          </div>
          {detail.dept === 'PL' && missing.length > 0 && (
            <p className="text-xs text-warning">Thiếu hồ sơ pháp lý: {missing.join(', ')}</p>
          )}
        </div>
        <div className="modal-action">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

const ProposalGradingTab = ({ tab, canGradeQH, canGradePL }) => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { getSelectOptions } = useFieldOptions('station_proposals', ['status', 'mo_hinh_dau_tu']);
  const statusOptions = getSelectOptions('status');
  const modelOptions = getSelectOptions('mo_hinh_dau_tu');

  const isPending = tab === 'pending';
  const isAll = tab === 'all';
  const canGrade = canGradeQH || canGradePL;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState({});
  const [appliedFilters, setAppliedFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  const [filterOptionsError, setFilterOptionsError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const [scoreDetail, setScoreDetail] = useState({ open: false, dept: null, title: '', row: null });

  const loadItems = useCallback(async (targetPage = 1, targetSize = pageSize, targetSearch = search, targetFilters = appliedFilters) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (targetSearch) params.set('search', targetSearch);
      const filterKeys = {
        proposalStatus: 'proposal_status',
        model: 'model',
        province: 'province',
        region: 'region',
        ownerUserId: 'owner_user_id',
        managerUserId: 'manager_user_id',
        dateFrom: 'date_from',
        dateTo: 'date_to'
      };
      Object.entries(filterKeys).forEach(([key, queryKey]) => {
        if (targetFilters[key]) params.set(queryKey, targetFilters[key]);
      });
      params.set('page', targetPage);
      params.set('limit', targetSize);
      const res = await proposalGradingService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: targetSize, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách đề xuất');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab, pageSize, search, appliedFilters]);

  useEffect(() => {
    let cancelled = false;
    proposalGradingService.getFilterOptions(token)
      .then((response) => {
        if (!cancelled) {
          setFilterOptions(response?.data || {});
          setFilterOptionsError('');
        }
      })
      .catch((optionsError) => {
        if (!cancelled) setFilterOptionsError(optionsError?.message || 'Không tải được tùy chọn bộ lọc');
      });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    setPage(1);
    loadItems(1);
  }, [loadItems]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleResetFilters = () => {
    setSearch('');
    setSearchInput('');
    setFilters({});
    setAppliedFilters({});
    setPage(1);
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
    setShowFilter(false);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const cellRenderers = {
    ma_de_xuat: (row, value) => (
      <ProposalCodeLink
        id={row.id}
        code={value || `#${row.id}`}
        to={`/admin/proposals/danh-gia-quy-hoach/${row.id}`}
      />
    ),
    legal_name: (row) => getProposalLegalName(row),
    phone: (row) => getProposalPhone(row),
    mo_hinh_dau_tu: (row, value) => <ProposalModelBadge value={value} options={modelOptions} />,
    manager_name: (row) => <ProposalManagerCell row={row} />,
    vung_mien: (row, value) => <ProposalRegionCell value={value || row.vung_mien} />,
    province: (row, value) => <ProposalProvinceCell value={value || row.province} />,
    address: (row, value) => <ProposalAddressCell row={row} value={value || getProposalAddress(row)} />,
    scale: (row) => {
      const groups = getProposalPoleGroups(row);
      if (groups.length === 0) return <span className="text-base-content/50">—</span>;
      return (
        <div className="min-w-64 space-y-1 py-1">
          {groups.flatMap((group) => group.rows.map((pole, index) => {
            const quantity = getProposalNumber(pole.so_luong);
            const unitPrice = getProposalNumber(pole.don_gia);
            const total = getProposalNumber(pole.thanh_tien)
              ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : null);
            return (
              <div key={`${group.key}-${index}`} className="whitespace-normal text-xs">
                <span className="font-medium">{group.label}:</span>{' '}
                {quantity ?? '—'} × {pole.loai_tru || '—'}
                <span className="block text-base-content/60">
                  Đơn giá {unitPrice === null ? '—' : formatProposalMoney(unitPrice)}
                  {' · '}Thành tiền {total === null ? '—' : formatProposalMoney(total)}
                </span>
              </div>
            );
          }))}
        </div>
      );
    },
    cost_breakdown: (row) => {
      const rows = getProposalCostRows(row);
      if (rows.length === 0) return <span className="text-base-content/50">—</span>;
      return (
        <div className="space-y-1 py-1">
          {rows.map((cost, index) => (
            <div key={`${cost.loai_chi_phi || 'cost'}-${index}`} className="whitespace-normal text-xs">
              <span className="font-medium">{cost.loai_chi_phi || 'Chi phí khác'}:</span>{' '}
              {formatProposalMoney(cost.so_tien)}
            </div>
          ))}
        </div>
      );
    },
    user_name: (row, value) => <ProposalPersonLink id={row.user_id} name={value} />,
    status: (row, value) => <ProposalStatusBadge value={value || row.status} optionMap={statusOptions} />,
    quy_hoach_status: (row) => <QuyHoachStatusCell row={row} onShowScore={setScoreDetail} />,
    phap_ly_status: (row) => <PhapLyStatusCell row={row} onShowScore={setScoreDetail} />,
    grading_result: (row) => {
      const cancelled = row.status === 'CANCELLED' || row.quy_hoach_score === 0 || row.phap_ly_score === 0;
      const progress = getPartialGradingProgress(row);
      if (progress) {
        const bothScored = row.quy_hoach_score !== null && row.quy_hoach_score !== undefined
          && row.phap_ly_score !== null && row.phap_ly_score !== undefined;
        return (
          <div className="min-w-40 space-y-1">
            <span className="badge badge-warning badge-sm">
              {bothScored ? 'Chờ GĐTTKD xem xét' : 'Chờ phòng còn lại chấm'}
            </span>
            <p className="text-xs text-base-content/70">{progress}</p>
          </div>
        );
      }
      const complete = row.quy_hoach_score !== null && row.quy_hoach_score !== undefined
        && row.phap_ly_score !== null && row.phap_ly_score !== undefined
        && !row.quy_hoach_regrade_pending && !row.phap_ly_regrade_pending;
      const label = cancelled ? 'Đã hủy' : complete ? 'Đã hoàn thành' : 'Đang làm';
      return <span className={`badge badge-sm ${cancelled ? 'badge-error' : complete ? 'badge-success' : 'badge-warning'}`}>{label}</span>;
    }
  };

  const renderActions = (row) => {
    const active = ['GRADING', 'GDTTKD_EVALUATING', 'RE_GRADING'].includes(row.status);
    const qhMissing = row.quy_hoach_score === null || row.quy_hoach_score === undefined;
    const plMissing = row.phap_ly_score === null || row.phap_ly_score === undefined;
    const qhCanGrade = row.status === 'RE_GRADING'
      ? qhMissing || row.quy_hoach_regrade_pending
      : qhMissing;
    const plCanGrade = row.status === 'RE_GRADING'
      ? plMissing || row.phap_ly_regrade_pending
      : plMissing;
    const rowCanGrade = (canGradeQH && qhCanGrade) || (canGradePL && plCanGrade);
    const bothScored = row.quy_hoach_score !== null && row.quy_hoach_score !== undefined
      && row.phap_ly_score !== null && row.phap_ly_score !== undefined;
    const rowCanAct = !row.supplement_pending && rowCanGrade;
    const showAction = active && canGrade && (
      isPending ? rowCanGrade : isAll ? (!bothScored || row.status === 'RE_GRADING') && rowCanAct : rowCanAct
    );
    if (!showAction) return null;
    return (
      <button
        type="button"
        className={`btn btn-xs gap-1 ${isPending ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => navigate(`/admin/proposals/danh-gia-quy-hoach/${row.id}`)}
      >
        <Pencil size={14} />
        {isPending ? 'Xem và chấm điểm' : 'Cập nhật'}
      </button>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
          <input
            type="search"
            className="input input-bordered input-sm flex-1 min-w-0"
            placeholder="Tìm mã, tên, SĐT, địa chỉ..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
          />
        <button type="button" className="btn btn-primary btn-sm gap-1 shrink-0" onClick={handleSearch}>
          <Search size={14} /> <span className="hidden sm:inline">Tìm</span>
        </button>
        <FilterToggle open={showFilter} onToggle={() => setShowFilter((value) => !value)} count={activeFilterCount} />
      </div>
      <FilterBody
        open={showFilter}
        isDesktop={isDesktop}
        onClose={() => setShowFilter(false)}
        onApply={applyFilters}
        onReset={handleResetFilters}
        title="Bộ lọc đề xuất"
      >
        <ProposalAdvancedFilters
          values={filters}
          onChange={setFilters}
          options={filterOptions}
        />
        {isDesktop && (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm gap-1" onClick={handleResetFilters}>
              <RotateCcw size={14} /> Xóa lọc
            </button>
            <button type="button" className="btn btn-primary btn-sm gap-1" onClick={applyFilters}>
              <Search size={14} /> Áp dụng
            </button>
          </div>
        )}
      </FilterBody>
      {filterOptionsError && <div className="alert alert-warning py-2 text-sm">{filterOptionsError}</div>}

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
            columns={GRADING_COLUMNS}
            data={items}
            startIndex={(page - 1) * pageSize}
            cellRenderers={cellRenderers}
            actions={renderActions}
            frozenColumns={3}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={(p) => { setPage(p); loadItems(p); }}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); loadItems(1, s); }}
          />
        </>
      )}

      <ScoreDetailDialog
        detail={scoreDetail}
        onClose={() => setScoreDetail({ open: false, dept: null, title: '', row: null })}
      />

    </div>
  );
};

export default ProposalGradingTab;
