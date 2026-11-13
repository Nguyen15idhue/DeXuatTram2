import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api, chargingStationService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { canOperateStation } from '../../utils/chargingFulfillment';
import ChargingStationNeedBadge from './ChargingStationNeedBadge';
import ChargingStationTable from './ChargingStationTable';
import {
  CS_CONTRACT_LABELS,
  CS_CONTRACT_VARIANT,
  CS_FLOW_LABELS,
  CS_FLOW_VARIANT,
  CS_DEPOSIT_LABELS,
  CS_DEPOSIT_VARIANT,
  CS_PAYMENT_LABELS,
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  CS_SUB_STATUS_LABELS,
  formatCsDate,
  getCsDeadlineLabel,
  isCsDeadlineStopped
} from '../../utils/chargingStation';
import { Badge, Button, Dialog, FilterBar, Input, Pagination, Toast } from '../ui';

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [busyId, setBusyId] = useState(null);
  const [uploadStation, setUploadStation] = useState(null);
  const [contractFiles, setContractFiles] = useState([]);
  const [uploadedContractIds, setUploadedContractIds] = useState([]);
  const [contractEffectiveDate, setContractEffectiveDate] = useState('');
  const [contractExpiryDate, setContractExpiryDate] = useState('');
  const [contractNote, setContractNote] = useState('');
  const [extendStation, setExtendStation] = useState(null);
  const [extendReason, setExtendReason] = useState('');
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
          className="link link-primary underline text-left"
        >
          {value || `#${row.id}`}
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
      label: 'Trạng thái quy trình',
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
      render: (value, row) => {
        if (value === 'DONE' || isCsDeadlineStopped(row)) {
          return <Badge variant={CS_CONTRACT_VARIANT[value] || 'ghost'} size="sm" outline className="h-auto whitespace-normal py-1">{CS_CONTRACT_LABELS[value] || '—'}</Badge>;
        }
        const expired = row.contract_deadline_at && new Date(String(row.contract_deadline_at).replace(' ', 'T')).getTime() <= Date.now();
        const canExtend = expired && Number(row.deadline_extension_count || 0) < 3;
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={CS_CONTRACT_VARIANT[value] || 'ghost'} size="sm" outline className="h-auto whitespace-normal py-1">{CS_CONTRACT_LABELS[value] || '—'}</Badge>
            <span className={`text-xs ${expired ? 'text-error font-semibold' : 'text-base-content/60'}`}>
              {getCsDeadlineLabel(row.contract_deadline_at, false, false)}
            </span>
            {canExtend && canOperateStation(user, row, 'back_office') && (
              <Button
                variant="outline-warning"
                size="xs"
                disabled={busyId !== null}
                onClick={() => setExtendStation(row)}
              >
                Gia hạn ({3 - Number(row.deadline_extension_count || 0)})
              </Button>
            )}
            {!canExtend && expired && Number(row.deadline_extension_count || 0) >= 3 && (
              <span className="text-[11px] text-error">Hết lượt gia hạn</span>
            )}
          </div>
        );
      }
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
      render: (value, row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={CS_DEPOSIT_VARIANT[row.deposit_status] || 'ghost'} size="sm" outline>{CS_DEPOSIT_LABELS[row.deposit_status] || '—'}</Badge>
          <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>{CS_PAYMENT_LABELS[value] || '—'}</Badge>
        </div>
      )
    },

    { key: 'created_at', label: 'Ngày tạo', render: formatDateTime },

  ], [location.pathname, location.search, user, busyId]);

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
    if (!uploadStation || !contractFiles.length) {
      setToast({ message: 'Vui lòng chọn file hợp đồng', type: 'error' });
      return;
    }
    if (contractFiles.some(file => !CONTRACT_MIME_TYPES.includes(file.type))) {
      setToast({ message: 'File hợp đồng phải có định dạng PDF hoặc DOCX', type: 'error' });
      return;
    }
    if (contractFiles.some(file => file.size > FILE_MAX_SIZE)) {
      setToast({ message: 'File hợp đồng không được vượt quá 10 MB', type: 'error' });
      return;
    }
    if (!contractEffectiveDate || !contractExpiryDate) {
      setToast({ message: 'Vui lòng nhập ngày hiệu lực và ngày hết hạn hợp đồng', type: 'error' });
      return;
    }
    if (contractExpiryDate <= contractEffectiveDate) {
      setToast({ message: 'Ngày hết hạn hợp đồng phải sau ngày hiệu lực hợp đồng', type: 'error' });
      return;
    }

    setUploading(true);
    try {
      const fileIds = [...uploadedContractIds];
      for (let index = fileIds.length; index < contractFiles.length; index++) {
        const file = contractFiles[index];
        const data = new FormData();
        data.append('file', file);
        data.append('originalName', file.name);
        const uploaded = await api.uploadWithAuth('/files/upload', data, token);
        if (!uploaded?.success || !uploaded.data?.id) {
          throw new Error(uploaded?.message || `Tải file ${file.name} thất bại`);
        }
        fileIds.push(uploaded.data.id);
        setUploadedContractIds([...fileIds]);
      }
      const completed = await chargingStationService.completeContract(uploadStation.id, {
        file_ids: fileIds,
        contract_effective_date: contractEffectiveDate,
        contract_expiry_date: contractExpiryDate,
        contract_note: contractNote.trim()
      }, token);
      if (!completed?.success) throw new Error(completed?.message || 'Không thể hoàn tất hợp đồng');
      setUploadStation(null);
      setContractFiles([]);
      setUploadedContractIds([]);
      setToast({ message: completed.message || 'Đã tải hợp đồng và hoàn tất thủ tục', type: 'success' });
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không thể hoàn tất hợp đồng', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const extendDeadline = async () => {
    if (!extendStation || !extendReason.trim()) return;
    setBusyId(extendStation.id);
    try {
      const res = await chargingStationService.extendDeadline(extendStation.id, { reason: extendReason }, token);
      if (!res?.success) throw new Error(res?.message || 'Gia hạn thất bại');
      setExtendStation(null);
      setExtendReason('');
      setToast({ message: res.message || 'Đã gia hạn 3 ngày', type: 'success' });
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Gia hạn thất bại', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (row) => {
    if (row.status === 'CANCELLED' || !canOperateStation(user, row, 'back_office')) return <span className="text-base-content/50">Chỉ xem</span>;
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
          setContractFiles([]);
          setUploadedContractIds([]);
          setContractEffectiveDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
          setContractExpiryDate('');
          setContractNote('');
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
            {item.label}{item.key === 'need' && <ChargingStationNeedBadge stage="khoi-tao-hop-dong" />}
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

      <ChargingStationTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage={tab === 'need' ? 'Không có trạm sạc cần thực hiện' : 'Không có trạm sạc'}
        startIndex={(pagination.page - 1) * PAGE_SIZE}
        actions={renderActions}
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
        onClose={() => { if (!uploading) setUploadStation(null); }}
        title={uploadStation ? `Tải hợp đồng — ${uploadStation.ma_tram || `#${uploadStation.id}`}` : 'Tải hợp đồng'}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            Chọn một hoặc nhiều file PDF/DOCX (tối đa 10 MB mỗi file). Xác nhận sẽ lưu thông tin và chuyển hợp đồng sang Đã ký.
          </p>
          <label htmlFor="contract-files" className="block text-sm font-medium">File hợp đồng <span className="text-error">*</span></label>
          <input
            id="contract-files"
            type="file"
            multiple
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="file-input file-input-bordered w-full"
            disabled={uploading}
            onChange={(event) => {
              setContractFiles(Array.from(event.target.files || []));
              setUploadedContractIds([]);
            }}
          />
          {contractFiles.length > 0 && <ul className="list-disc pl-5 text-sm">{contractFiles.map((file, index) => <li key={index} className="break-all">{file.name}</li>)}</ul>}
          <Input label="Ngày hiệu lực hợp đồng" aria-label="Ngày hiệu lực hợp đồng" type="date" required
            value={contractEffectiveDate} disabled={uploading} onChange={event => setContractEffectiveDate(event.target.value)} />
          <Input label="Ngày hết hạn hợp đồng" aria-label="Ngày hết hạn hợp đồng" type="date" required
            value={contractExpiryDate} disabled={uploading} onChange={event => setContractExpiryDate(event.target.value)} />
          <label className="block text-sm font-medium">
            Ghi chú
            <textarea className="textarea textarea-bordered mt-2 w-full" rows={3} value={contractNote}
              disabled={uploading} onChange={event => setContractNote(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={uploading} onClick={() => setUploadStation(null)}>
              Hủy
            </Button>
            <Button variant="primary" loading={uploading} disabled={!contractFiles.length || uploading} onClick={completeContract}>
              Xác nhận tải lên
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={!!extendStation} onClose={() => { if (busyId === null) { setExtendStation(null); setExtendReason(''); } }} title={extendStation ? `Gia hạn hạn ký - ${extendStation.ma_tram || `#${extendStation.id}`}` : 'Gia hạn'} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">Gia hạn thêm 3 ngày (tối đa 3 lần).</p>
          <div className="form-control w-full">
            <span className="label-text font-medium mb-1">Lý do gia hạn</span>
            <textarea className="textarea textarea-bordered w-full" rows={3} value={extendReason} onChange={(e) => setExtendReason(e.target.value)} disabled={busyId !== null} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busyId !== null} onClick={() => { setExtendStation(null); setExtendReason(''); }}>Hủy</Button>
            <Button variant="warning" loading={busyId !== null} disabled={!extendReason.trim() || busyId !== null} onClick={extendDeadline}>Gia hạn</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default ChargingStationContractTabs;
