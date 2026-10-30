import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api, chargingStationService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { isBackOfficeDept } from '../../utils/proposalAccess';
import {
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  CS_SUB_STATUS_LABELS,
  formatCsDate
} from '../../utils/chargingStation';
import { Badge, Button, DataTable, Dialog, FilterBar, Input, Pagination, Toast } from '../ui';

const PAGE_SIZE = 20;
const TABS = [
  { key: 'need', label: 'Trạm sạc cần thực hiện' },
  { key: 'completed', label: 'Trạm sạc đã hoàn thành' },
  { key: 'all', label: 'Tất cả trạm sạc' }
];
const EMPTY_TOAST = { message: '', type: 'success' };
const EMPTY_CONFIGURATION = { cms_station_code: '', on_date: '' };
const FILE_MAX_SIZE = 10 * 1024 * 1024;

const isSetupOperationsDept = (user) => {
  const department = String(user?.department || user?.custom_data?.department || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
  return department.includes('setup') && department.includes('van hanh');
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const ChargingStationProcessTabs = ({ stage = 'lap-tru' }) => {
  const { token, user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'need';
  const canManageInstallation = user?.role === 'SUPER_ADMIN'
    || user?.role === 'ADMIN'
    || (!isBackOfficeDept(user) && isSetupOperationsDept(user));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [busy, setBusy] = useState(false);
  const [configurationStation, setConfigurationStation] = useState(null);
  const [configurationForm, setConfigurationForm] = useState(EMPTY_CONFIGURATION);
  const [toast, setToast] = useState(EMPTY_TOAST);

  const load = useCallback(async (targetPage) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        stage,
        tab,
        page: String(targetPage),
        limit: String(PAGE_SIZE)
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const response = await chargingStationService.getAll(params.toString(), token);
      setItems(response?.data || []);
      setPagination(response?.pagination || { page: targetPage, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (error) {
      setItems([]);
      setToast({ message: error?.message || 'Không tải được danh sách trạm sạc', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, tab, debouncedSearch, stage]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  const selectTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next);
  };

  const run = async (action, successMessage) => {
    setBusy(true);
    try {
      const response = await action();
      if (!response?.success) throw new Error(response?.message || 'Thao tác thất bại');
      setToast({ message: response.message || successMessage, type: 'success' });
      setConfigurationStation(null);
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Thao tác thất bại', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const uploadAcceptanceFile = async (station, file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > FILE_MAX_SIZE) {
      setToast({ message: 'Biên bản nghiệm thu phải là file PDF và không vượt quá 10 MB', type: 'error' });
      return;
    }
    return run(async () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('originalName', file.name);
      const uploaded = await api.uploadWithAuth('/files/upload', formData, token);
      if (!uploaded?.success || !uploaded.data?.id) {
        throw new Error(uploaded?.message || 'Tải biên bản nghiệm thu thất bại');
      }
      const response = await chargingStationService.setAcceptanceFile(station.id, uploaded.data.id, token);
      return response;
    }, 'Đã lưu biên bản nghiệm thu');
  };

  const submitConfiguration = () => {
    if (!configurationForm.cms_station_code.trim() || !configurationForm.on_date) {
      setToast({ message: 'Vui lòng nhập mã trạm trên CMS và ngày ON chính thức', type: 'error' });
      return;
    }
    return run(
      () => chargingStationService.completeConfiguration(configurationStation.id, configurationForm, token),
      'Đã hoàn tất cấu hình và chuyển trạm sang hoạt động'
    );
  };

  const confirmInstallation = (station) => run(
    () => chargingStationService.completeInstallation(station.id, token),
    'Đã xác nhận lắp đặt xong'
  );

  const columns = useMemo(() => [
    {
      key: 'ma_tram',
      label: 'Mã trạm',
      render: (value, row) => (
        <Link
          to={`/admin/on-tram/${stage}/${row.id}`}
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
      label: 'Trạng thái',
      render: (value, row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={CS_STATUS_VARIANT[value]} size="sm" className="h-auto whitespace-normal py-1">
            {CS_STATUS_LABELS[value] || value}
          </Badge>
          {row.sub_status && <span className="text-[11px] text-base-content/60">{CS_SUB_STATUS_LABELS[row.sub_status] || row.sub_status}</span>}
        </div>
      )
    },
    { key: 'acceptance_file_name', label: 'Biên bản nghiệm thu', render: (value) => value || '—' },
    { key: 'cms_station_code', label: 'Mã trạm CMS', render: (value) => value || '—' },
    { key: 'on_date', label: 'Ngày ON chính thức', render: formatCsDate },
    { key: 'updated_at', label: 'Cập nhật', render: formatDateTime }
  ], [location.pathname, location.search, stage]);

  const renderActions = (row) => {
    if (!canManageInstallation) return <span className="text-xs text-base-content/50">Chỉ xem</span>;
    if (stage === 'lap-tru') {
      if (row.status === 'INSTALLING' && row.sub_status === 'NOT_INSTALLED') {
        return <Button size="xs" disabled={busy} onClick={() => run(
          () => chargingStationService.startInstallation(row.id, token),
          'Đã bắt đầu lắp đặt'
        )}>Bắt đầu lắp đặt</Button>;
      }
      if (row.status === 'INSTALLING' && row.sub_status === 'INSTALLING') {
        return <Button variant="primary" size="xs" disabled={busy} onClick={() => confirmInstallation(row)}>Đã lắp đặt xong</Button>;
      }
      if (['ACCEPTANCE', 'OPERATING'].includes(row.status)) {
        return <Badge variant="success" size="sm">Đã lắp đặt</Badge>;
      }
    }
    if (stage === 'nghiem-thu' && row.status === 'ACCEPTANCE') {
      return (
        <div className="flex min-w-44 flex-col gap-2">
          {row.acceptance_file_id
            ? <span className="text-xs text-success">Đã có biên bản nghiệm thu</span>
            : (
              <label className={`btn btn-outline btn-xs ${busy ? 'btn-disabled' : ''}`}>
                Tải biên bản PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    uploadAcceptanceFile(row, file);
                  }}
                />
              </label>
            )}
          <Button variant="outline-error" size="xs" disabled={busy} onClick={() => run(
            () => chargingStationService.updateAcceptanceResult(row.id, 'ACCEPT_FAILED', token),
            'Đã ghi nhận nghiệm thu không đạt'
          )}>Nghiệm thu không đạt</Button>
          <Button size="xs" disabled={busy || !row.acceptance_file_id} onClick={() => run(
            () => chargingStationService.updateAcceptanceResult(row.id, 'ACCEPT_PASSED', token),
            'Đã xác nhận nghiệm thu đạt'
          )}>Nghiệm thu đạt</Button>
        </div>
      );
    }
    if (stage === 'nghiem-thu' && row.status === 'OPERATING') {
      return <Badge variant="success" size="sm">Đã nghiệm thu đạt</Badge>;
    }
    if (stage === 'on-tram' && row.status === 'OPERATING' && row.sub_status === 'CONFIGURING') {
      return <Button size="xs" disabled={busy} onClick={() => {
        setConfigurationForm({ cms_station_code: row.cms_station_code || '', on_date: row.on_date || '' });
        setConfigurationStation(row);
      }}>Đã cấu hình xong</Button>;
    }
    if (stage === 'on-tram' && row.status === 'OPERATING' && row.sub_status === 'ACTIVE') {
      return <Badge variant="success" size="sm">Đã hoạt động</Badge>;
    }
    return <span className="text-xs text-base-content/50">—</span>;
  };

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast(EMPTY_TOAST)} />

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
        emptyMessage={tab === 'need'
          ? {
            'lap-tru': 'Không có trạm sạc cần lắp đặt',
            'nghiem-thu': 'Không có trạm sạc cần nghiệm thu',
            'on-tram': 'Không có trạm sạc cần cấu hình ON'
          }[stage]
          : 'Không có trạm sạc'}
        startIndex={(pagination.page - 1) * PAGE_SIZE}
        actions={renderActions}
      />
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={(nextPage) => { setPage(nextPage); load(nextPage); }}
      />

      <Dialog
        isOpen={stage === 'on-tram' && !!configurationStation}
        onClose={() => { if (!busy) setConfigurationStation(null); }}
        title={configurationStation ? `Xác nhận ON trạm — ${configurationStation.ma_tram || `#${configurationStation.id}`}` : 'Xác nhận ON trạm'}
        size="md"
      >
        {configurationStation && (
          <div className="space-y-4">
            <p className="text-sm text-base-content/70">
              Nhập mã trạm trên CMS và ngày ON chính thức. Sau khi xác nhận, trạng thái trạm và đề xuất sẽ chuyển sang Hoạt động.
            </p>
            <Input
              label="Mã trạm sạc trên CMS"
              required
              value={configurationForm.cms_station_code}
              disabled={busy}
              onChange={(event) => setConfigurationForm({ ...configurationForm, cms_station_code: event.target.value })}
            />
            <Input
              label="Ngày ON chính thức"
              type="date"
              required
              value={configurationForm.on_date}
              disabled={busy}
              onChange={(event) => setConfigurationForm({ ...configurationForm, on_date: event.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setConfigurationStation(null)}>Hủy</Button>
              <Button variant="primary" loading={busy} disabled={!configurationForm.cms_station_code.trim() || !configurationForm.on_date}
                onClick={submitConfiguration}>
                Xác nhận ON trạm
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default ChargingStationProcessTabs;
