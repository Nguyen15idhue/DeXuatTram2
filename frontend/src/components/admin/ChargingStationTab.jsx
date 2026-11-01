import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { Badge, Button, ConfirmDialog, DataTable, FilterBar, Input, Pagination, Toast } from '../ui';
import ChargingStationDetailModal from './ChargingStationDetailModal';
import ChargingStationCareModal from './ChargingStationCareModal';
import { notifyBellRefresh } from '../layout/NotificationBell';
import {
  CS_CONTRACT_LABELS,
  CS_CONTRACT_VARIANT,
  CS_EDITOR_ROLES,
  CS_FLOW_LABELS,
  CS_FLOW_VARIANT,
  CS_DEPOSIT_LABELS,
  CS_DEPOSIT_VARIANT,
  CS_PAYMENT_LABELS,
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  CS_SUB_STATUS_LABELS,
  formatCsDate
} from '../../utils/chargingStation';

const PAGE_SIZE = 20;
const EMPTY_TOAST = { message: '', type: 'success' };
const TABS = [
  { key: 'all', label: 'Tất cả trạm sạc' },
  { key: 'need', label: 'Trạm sạc cần thực hiện' },
  { key: 'completed', label: 'Trạm sạc đã hoàn thành' }
];

const ChargingStationTab = ({ stage }) => {
  const { token, user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'all';
  const canEdit = CS_EDITOR_ROLES.includes(user?.role);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [selectedId, setSelectedId] = useState(null);
  const [careStation, setCareStation] = useState(null);
  const [statusDialog, setStatusDialog] = useState({ open: false, action: '', row: null });
  const [statusSaving, setStatusSaving] = useState(false);
  const statusSavingRef = useRef(false);
  const [toast, setToast] = useState(EMPTY_TOAST);
  const closeToast = useCallback(() => setToast(EMPTY_TOAST), []);

  const load = useCallback(async (targetPage) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ stage, tab, page: targetPage, limit: PAGE_SIZE });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await chargingStationService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (error) {
      setToast({ message: error?.message || 'Không tải được danh sách ON trạm', type: 'error' });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, stage, tab, debouncedSearch]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  const goPage = (next) => {
    setPage(next);
    load(next);
  };

  const selectTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next);
  };

  const confirmStatusChange = async () => {
    if (statusSavingRef.current || !statusDialog.row) return;
    statusSavingRef.current = true;
    setStatusSaving(true);
    try {
      const mutate = statusDialog.action === 'cancel'
        ? chargingStationService.cancelOnStation
        : chargingStationService.restoreOnStation;
      const res = await mutate(statusDialog.row.id, token);
      if (res?.success === false) throw new Error(res.message || 'Không thể cập nhật trạng thái ON trạm');
      setToast({
        message: res?.message || (statusDialog.action === 'cancel'
          ? 'Đã hủy ON trạm và lưu trữ đề xuất'
          : 'Đã khôi phục ON trạm và đề xuất'),
        type: 'success'
      });
      setStatusDialog({ open: false, action: '', row: null });
      notifyBellRefresh();
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không thể cập nhật trạng thái ON trạm', type: 'error' });
    } finally {
      statusSavingRef.current = false;
      setStatusSaving(false);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'ma_tram',
      label: 'Mã trạm',
      render: (value, row) => (
        <Link
          to={`/admin/on-tram/thong-tin-chung/${row.id}`}
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
        <div className="flex flex-col gap-1 items-start">
          <Badge variant={CS_STATUS_VARIANT[value]} size="sm" className="whitespace-normal h-auto py-1">{CS_STATUS_LABELS[value] || value}</Badge>
          {row.sub_status && (
            <span className="text-[11px] text-base-content/60">{CS_SUB_STATUS_LABELS[row.sub_status]}</span>
          )}
        </div>
      )
    },
    {
      key: 'contract_status',
      label: 'Hợp đồng',
      render: (value) => <Badge variant={CS_CONTRACT_VARIANT[value]} size="sm" outline className="whitespace-normal h-auto py-1">{CS_CONTRACT_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'infra_power_status',
      label: 'Hạ tầng điện',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value]} size="sm" outline className="whitespace-normal h-auto py-1">{CS_FLOW_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'infra_site_status',
      label: 'Hạ tầng mặt bằng',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value]} size="sm" outline className="whitespace-normal h-auto py-1">{CS_FLOW_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'deposit_status',
      label: 'Tiền cọc',
      render: (value) => <Badge variant={CS_DEPOSIT_VARIANT[value] || 'ghost'} size="sm" outline className="whitespace-normal h-auto py-1">{CS_DEPOSIT_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'payment_status',
      label: 'Thanh toán',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value]} size="sm" outline className="whitespace-normal h-auto py-1">{CS_PAYMENT_LABELS[value] || '—'}</Badge>
    },
    { key: 'on_date', label: 'Ngày ON', render: (value) => <span className="whitespace-nowrap">{formatCsDate(value)}</span> }
  ], [location.pathname, location.search]);

  const renderActions = (row) => (
    <div className="flex items-center justify-center gap-1">
      <Link
        to={`/admin/on-tram/thong-tin-chung/${row.id}`}
        state={{ returnTo: `${location.pathname}${location.search}` }}
        className="btn btn-outline btn-xs"
      >
        Chi tiết
      </Link>
      {canEdit && (
        <Button variant="ghost" size="xs" onClick={() => setSelectedId(row.id)}>
          Sửa
        </Button>
      )}
      <Button variant="outline" size="xs" onClick={() => setCareStation({ id: row.id, code: row.ma_tram })}>
        CSKH
      </Button>
      {stage === 'thong-tin-chung' && row.can_cancel_on_station && (
        <Button
          variant="outline-error"
          size="xs"
          onClick={() => setStatusDialog({ open: true, action: 'cancel', row })}
        >
          Hủy ON trạm
        </Button>
      )}
      {stage === 'thong-tin-chung' && row.can_restore_on_station && (
        <Button
          variant="outline-warning"
          size="xs"
          onClick={() => setStatusDialog({ open: true, action: 'restore', row })}
        >
          Khôi phục
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onClose={closeToast} />

      <ConfirmDialog
        isOpen={statusDialog.open}
        title={statusDialog.action === 'cancel' ? 'Hủy ON trạm' : 'Khôi phục ON trạm'}
        message={statusDialog.action === 'cancel'
          ? `Bạn có chắc muốn hủy ON trạm ${statusDialog.row?.ma_tram || `#${statusDialog.row?.id}`}? Đề xuất ${statusDialog.row?.ma_de_xuat || ''} sẽ chuyển sang Đã lưu trữ. Bạn có thể khôi phục sau.`
          : `Bạn có chắc muốn khôi phục ON trạm ${statusDialog.row?.ma_tram || `#${statusDialog.row?.id}`}? ON trạm và đề xuất sẽ trở về trạng thái trước khi hủy.`}
        confirmText={statusSaving ? 'Đang xử lý...' : statusDialog.action === 'cancel' ? 'Hủy ON trạm' : 'Khôi phục'}
        cancelText="Quay lại"
        type={statusDialog.action === 'cancel' ? 'danger' : 'warning'}
        onConfirm={confirmStatusChange}
        onCancel={() => {
          if (!statusSavingRef.current) setStatusDialog({ open: false, action: '', row: null });
        }}
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
        <div className="flex-1 min-w-0">
          <Input
            placeholder="Tìm mã trạm, mã đề xuất, chủ trạm, SĐT, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!mb-0"
          />
        </div>
        <span className="text-sm text-base-content/60 whitespace-nowrap">
          Tổng: <strong className="text-base-content">{pagination.total}</strong> bản ghi
        </span>
      </FilterBar>

      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage={tab === 'need'
          ? 'Không có trạm sạc cần thực hiện'
          : tab === 'completed'
            ? 'Chưa có trạm sạc ON hoàn tất'
            : 'Chưa có bản ghi ON trạm nào'}
        startIndex={(pagination.page - 1) * PAGE_SIZE}
        actions={renderActions}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={goPage}
      />

      {selectedId && (
        <ChargingStationDetailModal
          id={selectedId}
          token={token}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
          onChanged={() => load(page)}
          onToast={(message, type = 'success') => setToast({ message, type })}
        />
      )}

      {careStation && (
        <ChargingStationCareModal
          open
          stationId={careStation.id}
          stationCode={careStation.code}
          token={token}
          canEdit={canEdit}
          onClose={() => setCareStation(null)}
          onToast={(message, type = 'success') => setToast({ message, type })}
        />
      )}
    </div>
  );
};

export default ChargingStationTab;
