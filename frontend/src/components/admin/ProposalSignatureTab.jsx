import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import DynamicTable from '../dynamic/DynamicTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import FilterBar from '../ui/FilterBar';
import ProposalSignedFileModal from './ProposalSignedFileModal';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import { ProposalColorBadge, ProposalModelBadge, ProposalStatusBadge } from './ProposalTableBadges';
import {
  formatProposalCost,
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import {
  getSignStatusColor,
  getSignStatusLabel,
  SIGN_STATUS,
  SIGN_STATUS_LABELS,
  SIGN_STATUS_HINTS
} from '../../utils/proposalSignature';
import { Download, Eye, FileUp, PenSquare, Search, X } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;

const SIGN_STATUS_FILTER_OPTIONS = Object.values(SIGN_STATUS);

const signColumns = (tab) => ([
  { key: 'ma_de_xuat', field_key: 'ma_de_xuat', label: 'Mã đề xuất', width: 120, sortable: true, filterable: false, visible: true },
  { key: 'legal_name', field_key: 'legal_name', label: 'Tên pháp nhân', width: 180, sortable: false, filterable: false, visible: true },
  { key: 'phone', field_key: 'phone', label: 'SĐT liên hệ', width: 120, sortable: false, filterable: false, visible: true },
  { key: 'mo_hinh_dau_tu', field_key: 'mo_hinh_dau_tu', label: 'Mô hình đầu tư', width: 140, sortable: false, filterable: false, visible: true },
  { key: 'address', field_key: 'address', label: 'Địa chỉ chi tiết', width: 240, sortable: false, filterable: false, visible: true },
  { key: 'scale', field_key: 'scale', label: 'Quy mô trụ đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'cost', field_key: 'cost', label: 'Tổng chi phí dự kiến', width: 150, sortable: false, filterable: false, visible: true },
  { key: 'user_name', field_key: 'user_name', label: 'Người đề xuất', width: 160, sortable: false, filterable: false, visible: true },
  { key: 'status', field_key: 'status', label: 'Trạng thái', width: 150, sortable: true, filterable: false, visible: true },
  ...(tab === 'chairman'
    ? []
    : [{ key: 'sign_status', field_key: 'sign_status', label: 'Trạng thái ký duyệt', width: 150, sortable: false, filterable: false, visible: true }])
]);

const SignStatusBadge = ({ code }) => {
  return (
    <ProposalColorBadge
      label={getSignStatusLabel(code)}
      color={getSignStatusColor(code)}
      title={SIGN_STATUS_HINTS[code] || ''}
    />
  );
};

const ProposalSignatureTab = ({ tab, onMeta }) => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const viewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu', 'status']);

  const modelOptions = getSelectOptions('mo_hinh_dau_tu');
  const statusOptions = getSelectOptions('status');
  const statusOptionMap = useMemo(() => {
    const map = {};
    (statusOptions || []).forEach((option) => { map[option.value] = option; });
    return map;
  }, [statusOptions]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [filters, setFilters] = useState({ signStatus: '', myStatus: '', moHinh: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const [signedModal, setSignedModal] = useState({ open: false, record: null });
  const [meta, setMeta] = useState({ isAdmin: false, isBackOffice: false, isTgd: false, isManager: false });

  const columns = useMemo(() => signColumns(tab), [tab]);

  const loadItems = useCallback(async (targetPage = 1, targetSize = pageSize) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.signStatus) params.set('sign_status', filters.signStatus);
      if (filters.myStatus) params.set('my_status', filters.myStatus);
      if (filters.moHinh) params.set('mo_hinh', filters.moHinh);
      params.set('page', targetPage);
      params.set('limit', targetSize);
      const res = await proposalSignatureService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: targetSize, total: 0, totalPages: 0 });
      if (onMeta && res?.meta) {
        const nextMeta = {
          isAdmin: !!res.meta.isAdmin,
          isBackOffice: !!res.meta.isBackOffice,
          isTgd: !!res.meta.isTgd,
          isManager: !!res.meta.isManager
        };
        setMeta(nextMeta);
        onMeta(nextMeta);
      }
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách đề xuất');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab, pageSize, debouncedSearch, filters, onMeta]);

  useEffect(() => {
    setPage(1);
    loadItems(1, pageSize);
  }, [tab, debouncedSearch, filters, pageSize]);

  const goDetail = (record) => navigate(`/admin/proposals/trinh-ky/${record.id}`);

  const handleExport = async (record) => {
    try {
      const { blob, filename } = await proposalSignatureService.downloadSignedDocument(record.id, token);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setToastType('error');
      setToastMessage(err?.message || 'Không xuất được file');
    }
  };

  const handleSignedFileUploaded = () => {
    setSignedModal({ open: false, record: null });
    setToastType('success');
    setToastMessage('Đã tải lên file BCĐX đã ký — đề xuất hoàn thành');
    loadItems(page, pageSize);
  };

  const cellRenderers = {
    ma_de_xuat: (row, value) => (
      <ProposalCodeLink
        id={row.id}
        code={value || `#${row.id}`}
        to={`/admin/proposals/trinh-ky/${row.id}`}
      />
    ),
    legal_name: (row) => getProposalLegalName(row),
    phone: (row) => getProposalPhone(row),
    mo_hinh_dau_tu: (row, value) => <ProposalModelBadge value={value} options={modelOptions} />,
    address: (row) => <span className="block min-w-[220px]">{getProposalAddress(row)}</span>,
    scale: (row) => formatProposalScale(row),
    cost: (row) => formatProposalCost(row),
    user_name: (row, value) => <ProposalPersonLink id={row.user_id} name={value} />,
    status: (row, value) => <ProposalStatusBadge value={value} optionMap={statusOptionMap} />,
    sign_status: (row) => <SignStatusBadge code={row.sign_status} />
  };

  const renderActions = (row) => {
    const canSignRow = row.can_sign && row.status === 'SIGNATURE_PENDING';

    if (tab === 'completed') return null;

    const buttons = [];

    if (tab === 'all' && canSignRow) {
      buttons.push(
        <button
          key="view-sign"
          type="button"
          className="btn btn-xs btn-primary gap-1"
          title="Xem chi tiết và ký duyệt BCĐX"
          onClick={() => goDetail(row)}
        >
          <Eye size={14} />
          Xem &amp; ký duyệt
        </button>
      );
    }

    if (tab === 'pending' && canSignRow) {
      buttons.push(
        <button
          key="sign"
          type="button"
          className="btn btn-xs btn-primary gap-1"
          title="Ký duyệt BCĐX"
          onClick={() => goDetail(row)}
        >
          <PenSquare size={14} />
          Ký duyệt
        </button>
      );
    }

    if (tab === 'chairman') {
      buttons.push(
        <button
          key="export"
          type="button"
          className="btn btn-ghost btn-xs gap-1"
          title="Xuất file PDF đã ký"
          onClick={() => handleExport(row)}
        >
          <Download size={14} />
          Xuất file PDF
        </button>,
        <button
          key="upload"
          type="button"
          className="btn btn-xs btn-primary gap-1"
          title="Tải lên file BCĐX chủ tịch đã ký"
          onClick={() => setSignedModal({ open: true, record: row })}
        >
          <FileUp size={14} />
          Upload file đã ký
        </button>
      );
    }

    if (buttons.length === 0) return null;

    return <div className="flex flex-wrap gap-1">{buttons}</div>;
  };

  const hasActiveFilters = filters.signStatus || filters.myStatus || filters.moHinh || search;

  return (
    <div className="space-y-2">
      <FilterBar>
        <label className="input input-bordered flex items-center gap-2 input-sm w-72">
          <Search size={14} />
          <input
            className="grow"
            placeholder="Tìm mã, pháp nhân, SĐT, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </label>
        <select
          className="select select-bordered select-sm w-44"
          value={filters.signStatus}
          onChange={(e) => setFilters((current) => ({ ...current, signStatus: e.target.value }))}
        >
          <option value="">Kết quả ký: Tất cả</option>
          {SIGN_STATUS_FILTER_OPTIONS.map((code) => (
            <option key={code} value={code}>{SIGN_STATUS_LABELS[code]}</option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm w-40"
          value={filters.myStatus}
          onChange={(e) => setFilters((current) => ({ ...current, myStatus: e.target.value }))}
        >
          <option value="">Của tôi: Tất cả</option>
          <option value="my_pending">Tôi cần ký</option>
          <option value="my_signed">Tôi đã ký</option>
        </select>
        <select
          className="select select-bordered select-sm w-44"
          value={filters.moHinh}
          onChange={(e) => setFilters((current) => ({ ...current, moHinh: e.target.value }))}
        >
          <option value="">Mô hình: Tất cả</option>
          {(modelOptions || []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1"
            onClick={() => {
              setSearch('');
              setFilters({ signStatus: '', myStatus: '', moHinh: '' });
            }}
          >
            <X size={14} />
            Xóa bộ lọc
          </button>
        )}
      </FilterBar>

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
            columns={columns}
            data={items}
            startIndex={(page - 1) * pageSize}
            cellRenderers={cellRenderers}
            actions={tab === 'completed' ? undefined : renderActions}
            showActions={tab !== 'completed'}
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

      <ProposalSignedFileModal
        open={signedModal.open}
        record={signedModal.record}
        onClose={() => setSignedModal({ open: false, record: null })}
        onSaved={handleSignedFileUploaded}
      />

      <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
    </div>
  );
};

export default ProposalSignatureTab;
