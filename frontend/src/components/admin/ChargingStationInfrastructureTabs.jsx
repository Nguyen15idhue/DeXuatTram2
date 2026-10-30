import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
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
import { Badge, Button, DataTable, FilterBar, Input, Pagination, Toast } from '../ui';

const PAGE_SIZE = 20;
const TABS = [
  { key: 'need', label: 'Trạm sạc cần thực hiện' },
  { key: 'completed', label: 'Trạm sạc đã hoàn thành' },
  { key: 'all', label: 'Tất cả trạm sạc' }
];
const INFRASTRUCTURE_ITEMS = [
  { type: 'power', field: 'infra_power_status', label: 'hạ tầng điện', columnLabel: 'Hạ tầng điện' },
  { type: 'site', field: 'infra_site_status', label: 'mặt bằng', columnLabel: 'Hạ tầng mặt bằng' }
];

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const ChargingStationInfrastructureTabs = () => {
  const { token, user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'need';
  const canManageInfrastructure = user?.role === 'SUPER_ADMIN' || isBackOfficeDept(user);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [busyAction, setBusyAction] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const load = useCallback(async (targetPage) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        stage: 'xay-dung-ha-tang',
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
          to={`/admin/on-tram/xay-dung-ha-tang/${row.id}`}
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
    ...INFRASTRUCTURE_ITEMS.map(({ field, columnLabel }) => ({
      key: field,
      label: columnLabel,
      render: (value) => (
        <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>
          {CS_FLOW_LABELS[value] || '—'}
        </Badge>
      )
    })),
    {
      key: 'payment_status',
      label: 'Thanh toán',
      render: (value) => (
        <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>
          {CS_PAYMENT_LABELS[value] || '—'}
        </Badge>
      )
    },
    { key: 'on_date', label: 'Ngày ON', render: (value) => formatCsDate(value) },
    { key: 'updated_at', label: 'Cập nhật', render: formatDateTime }
  ], [location.pathname, location.search]);

  const selectTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next);
  };

  const updateInfrastructure = async (station, item, action) => {
    const actionKey = `${station.id}:${item.type}`;
    setBusyAction(actionKey);
    try {
      const response = action === 'start'
        ? await chargingStationService.startInfrastructure(station.id, item.type, token)
        : await chargingStationService.completeInfrastructure(station.id, item.type, token);
      if (!response?.success) throw new Error(response?.message || 'Không cập nhật được hạ tầng');
      setToast({ message: response.message || 'Đã cập nhật trạng thái hạ tầng', type: 'success' });
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không cập nhật được hạ tầng', type: 'error' });
    } finally {
      setBusyAction(null);
    }
  };

  const renderActions = (row) => {
    if (!['ONBOARDING', 'DELIVERING'].includes(row.status)) {
      return <span className="text-xs text-base-content/60">Không còn ở bước cập nhật hạ tầng</span>;
    }
    return (
      <div className="flex min-w-48 flex-col gap-2">
        {INFRASTRUCTURE_ITEMS.map((item) => {
          const value = row[item.field] || 'NOT';
          const action = value === 'NOT' ? 'start' : value === 'DOING' ? 'complete' : null;
          if (!action) {
            return (
              <span key={item.type} className="text-xs text-success">
                {item.columnLabel}: Đã làm
              </span>
            );
          }
          const label = action === 'start'
            ? `Đang hoàn thiện ${item.label}`
            : `Đã hoàn thiện ${item.label}`;
          return (
            <Button
              key={item.type}
              variant={action === 'complete' ? 'primary' : 'outline'}
              size="xs"
              loading={busyAction === `${row.id}:${item.type}`}
              disabled={busyAction !== null}
              onClick={() => updateInfrastructure(row, item, action)}
            >
              {label}
            </Button>
          );
        })}
      </div>
    );
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
        emptyMessage={tab === 'need' ? 'Không có trạm sạc cần hoàn thiện hạ tầng' : 'Không có trạm sạc'}
        startIndex={(pagination.page - 1) * PAGE_SIZE}
        actions={canManageInfrastructure ? renderActions : undefined}
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
    </div>
  );
};

export default ChargingStationInfrastructureTabs;
