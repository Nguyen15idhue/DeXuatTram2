import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api, chargingStationService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { isBackOfficeDept } from '../../utils/proposalAccess';
import {
  CS_CONTRACT_LABELS,
  CS_CONTRACT_VARIANT,
  CS_FLOW_LABELS,
  CS_FLOW_VARIANT,
  CS_PAYMENT_LABELS,
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  CS_SUB_STATUS_LABELS,
  formatCsDate
} from '../../utils/chargingStation';
import { Badge, Button, DataTable, Dialog, FilterBar, Input, Pagination, Toast } from '../ui';

const PAGE_SIZE = 20;
const FILE_MAX_SIZE = 10 * 1024 * 1024;
const CONTRACT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const TABS = [
  { key: 'need', label: 'Trạm sạc cần thực hiện' },
  { key: 'completed', label: 'Trạm sạc đã hoàn thành' },
  { key: 'all', label: 'Tất cả trạm sạc' }
];

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const ChargingStationContractTabs = () => {
  const { token, user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'need';
  const canManageContract = user?.role === 'SUPER_ADMIN' || isBackOfficeDept(user);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [busyId, setBusyId] = useState(null);
  const [uploadStation, setUploadStation] = useState(null);
  const [contractFile, setContractFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const load = useCallback(async (targetPage) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        stage: 'khoi-tao-hop-dong',
        tab,
        page: String(targetPage),
        limit: String(PAGE_SIZE)
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const response = await chargingStationService.getAll(params.toString(), token);
      setItems(response?.data || []);
      setPagination(response?.pagination || {
        page: targetPage,
        limit: PAGE_SIZE,
        total: 0,
        totalPages: 1
      });
    } catch (error) {
      setItems([]);
      setToast({ message: error?.message || 'Không tải được danh sách trạm sạc', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, tab, debouncedSearch]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  const columns = useMemo(() => [
    {
      key: 'ma_tram',
      label: 'Mã trạm',
      render: (value, row) => (
        <Link
          to={`/admin/on-tram/khoi-tao-hop-dong/${row.id}`}
          state={{ returnTo: `${location.pathname}${location.search}` }}
          className="link link-primary font-mono text-xs font-semibold"
        >
          {value || `#${row.id}`}
        </Link>
      )
    },
    {
      key: 'ma_de_xuat',
      label: 'Mã đề xuất',
      render: (value, row) => (
        <Link to={`/admin/proposals/chi-tiet/${row.proposal_id}`} className="link link-primary font-mono text-xs">
          {value || `#${row.proposal_id}`}
        </Link>
      )
    },
    { key: 'owner_name', label: 'Chủ trạm', render: (value) => value || '—' },
    { key: 'owner_phone', label: 'SĐT', render: (value) => value || '—' },
    {
      key: 'address',
      label: 'Địa chỉ',
      render: (value) => <span className="block max-w-[220px] truncate" title={value || ''}>{value || '—'}</span>
    },
    {
      key: 'status',
      label: 'Trạng thái trạm',
      render: (value, row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={CS_STATUS_VARIANT[value]} size="sm" className="h-auto whitespace-normal py-1">
            {CS_STATUS_LABELS[value] || value}
          </Badge>
          {row.sub_status && (
            <span className="text-[11px] text-base-content/60">{CS_SUB_STATUS_LABELS[row.sub_status] || row.sub_status}</span>
          )}
        </div>
      )
    },
    {
      key: 'contract_status',
      label: 'Hợp đồng',
      render: (value) => (
        <Badge variant={CS_CONTRACT_VARIANT[value] || 'ghost'} size="sm" outline className="h-auto whitespace-normal py-1">
          {CS_CONTRACT_LABELS[value] || '—'}
        </Badge>
      )
    },
    {
      key: 'infra_power_status',
      label: 'Hạ tầng điện',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>{CS_FLOW_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'infra_site_status',
      label: 'Hạ tầng mặt bằng',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>{CS_FLOW_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'payment_status',
      label: 'Tài chính',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>{CS_PAYMENT_LABELS[value] || '—'}</Badge>
    },
    { key: 'created_at', label: 'Ngày tạo', render: formatDateTime },

  ], [location.pathname, location.search]);

  const selectTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next);
  };

  const startSigning = async (station) => {
    setBusyId(station.id);
    try {
      const response = await chargingStationService.startContractSigning(station.id, token);
      if (!response?.success) throw new Error(response?.message || 'Không thể bắt đầu ký hợp đồng');
      setToast({ message: response.message || 'Đã chuyển hợp đồng sang trạng thái Đang ký', type: 'success' });
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không thể bắt đầu ký hợp đồng', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const completeContract = async () => {
    if (!uploadStation || !contractFile) {
      setToast({ message: 'Vui lòng chọn file hợp đồng', type: 'error' });
      return;
    }
    if (!CONTRACT_MIME_TYPES.includes(contractFile.type)) {
      setToast({ message: 'File hợp đồng phải có định dạng PDF hoặc DOCX', type: 'error' });
      return;
    }
    if (contractFile.size > FILE_MAX_SIZE) {
      setToast({ message: 'File hợp đồng không được vượt quá 10 MB', type: 'error' });
      return;
    }

    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', contractFile);
      data.append('originalName', contractFile.name);
      const uploaded = await api.uploadWithAuth('/files/upload', data, token);
      if (!uploaded?.success || !uploaded.data?.id) {
        throw new Error(uploaded?.message || 'Tải file hợp đồng thất bại');
      }
      const completed = await chargingStationService.completeContract(uploadStation.id, uploaded.data.id, token);
      if (!completed?.success) throw new Error(completed?.message || 'Không thể hoàn tất hợp đồng');
      setUploadStation(null);
      setContractFile(null);
      setToast({ message: completed.message || 'Đã tải hợp đồng và hoàn tất thủ tục', type: 'success' });
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không thể hoàn tất hợp đồng', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const renderActions = (row) => {
    if (row.status !== 'ONBOARDING') return <span className="text-base-content/50">—</span>;
    if (row.contract_status === 'NOT') {
      return (
        <Button size="xs" loading={busyId === row.id} disabled={busyId !== null} onClick={() => startSigning(row)}>
          Đang ký hợp đồng
        </Button>
      );
    }
    if (row.contract_status === 'DOING') {
      return (
        <Button variant="primary" size="xs" disabled={busyId !== null || uploading} onClick={() => {
          setContractFile(null);
          setUploadStation(row);
        }}>
          Tải file hợp đồng
        </Button>
      );
    }
    return <span className="text-base-content/50">—</span>;
  };

  return (
    <div className="space-y-4">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />

      <div role="tablist" className="tabs tabs-bordered">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`tab ${tab === item.key ? 'tab-active font-semibold' : ''}`}
            onClick={() => selectTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <FilterBar>
        <div className="min-w-0 flex-1">
          <Input
            placeholder="Tìm mã trạm, mã đề xuất, chủ trạm, SĐT, địa chỉ..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="!mb-0"
          />
        </div>
        <span className="whitespace-nowrap text-sm text-base-content/60">
          Tổng: <strong className="text-base-content">{pagination.total}</strong> bản ghi
        </span>
      </FilterBar>

      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage={tab === 'need' ? 'Không có trạm sạc cần thực hiện' : 'Không có trạm sạc'}
        startIndex={(pagination.page - 1) * PAGE_SIZE}
        actions={canManageContract ? renderActions : undefined}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={(nextPage) => {
          setPage(nextPage);
          load(nextPage);
        }}
      />

      <Dialog
        isOpen={!!uploadStation}
        onClose={() => { if (!uploading) { setUploadStation(null); setContractFile(null); } }}
        title={uploadStation ? `Tải hợp đồng — ${uploadStation.ma_tram || `#${uploadStation.id}`}` : 'Tải hợp đồng'}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            Chọn file PDF hoặc DOCX. Xác nhận sẽ lưu hợp đồng, chuyển hợp đồng sang Đã ký và trạng thái thanh toán sang Đã thanh toán 1 phần.
          </p>
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="file-input file-input-bordered w-full"
            disabled={uploading}
            onChange={(event) => setContractFile(event.target.files?.[0] || null)}
          />
          {contractFile && <p className="break-all text-sm">{contractFile.name}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={uploading} onClick={() => { setUploadStation(null); setContractFile(null); }}>
              Hủy
            </Button>
            <Button variant="primary" loading={uploading} disabled={!contractFile || uploading} onClick={completeContract}>
              Xác nhận tải lên
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default ChargingStationContractTabs;
