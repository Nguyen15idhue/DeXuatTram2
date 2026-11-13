import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [busyAction, setBusyAction] = useState(null);
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState('NOT');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
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
      render: (value, row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={CS_CONTRACT_VARIANT[value] || 'ghost'} size="sm" outline className="h-auto whitespace-normal py-1">
            {CS_CONTRACT_LABELS[value] || '—'}
          </Badge>
          {value !== 'DONE' && !isCsDeadlineStopped(row) && row.contract_deadline_at && (
            <span className={`text-xs ${new Date(String(row.contract_deadline_at).replace(' ', 'T')).getTime() <= Date.now() ? 'text-error font-semibold' : 'text-base-content/60'}`}>
              {getCsDeadlineLabel(row.contract_deadline_at, false, false)}
            </span>
          )}
        </div>
      )
    },
    ...INFRASTRUCTURE_ITEMS.map((item) => ({
      key: item.field,
      label: item.columnLabel,
      render: (value, row) => {
        const editable = row.status !== 'CANCELLED' && canOperateStation(user, row, 'back_office')
          && (user?.role === 'SUPER_ADMIN' || value !== 'DONE');
        return editable ? (
          <button type="button" aria-label={`${item.columnLabel}: ${CS_FLOW_LABELS[value] || 'Chưa làm'}`}
            aria-haspopup="dialog" disabled={busyAction !== null}
            className={`inline-flex w-full items-center justify-between gap-2 rounded-full border px-3 py-1 text-xs font-medium
              ${value === 'DONE' ? 'border-success/30 bg-success/15 text-success' : value === 'DOING'
                ? 'border-info/30 bg-info/15 text-info' : 'border-base-300 bg-base-200 text-base-content'}
              hover:brightness-95 disabled:opacity-50`}
            onClick={() => {
              const current = value || 'NOT';
              setEditing({ station: row, item, expectedStatus: current });
              setStatus(user?.role === 'SUPER_ADMIN' ? current : current === 'NOT' ? 'DOING' : 'DONE');
              setDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
              setNote('');
            }}>
            {CS_FLOW_LABELS[value] || 'Chưa làm'}<ChevronDown size={14} />
          </button>
        ) : (
        <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>
          {CS_FLOW_LABELS[value] || '—'}
        </Badge>
        );
      }
    })),
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
    { key: 'on_date', label: 'Ngày ON', render: (value) => formatCsDate(value) },

  ], [location.pathname, location.search, user, busyAction]);

  const selectTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next);
  };

  const updateInfrastructure = async () => {
    if (!editing) return;
    if (!date) {
      setToast({ message: 'Vui lòng nhập ngày thực hiện', type: 'error' });
      return;
    }
    const { station, item, expectedStatus } = editing;
    const actionKey = `${station.id}:${item.type}`;
    setBusyAction(actionKey);
    try {
      const response = await chargingStationService.updateInfrastructure(station.id, item.type, {
        status, expected_status: expectedStatus, date, note: note.trim()
      }, token);
      if (!response?.success) throw new Error(response?.message || 'Không cập nhật được hạ tầng');
      setToast({ message: response.message || 'Đã cập nhật trạng thái hạ tầng', type: 'success' });
      setEditing(null);
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không cập nhật được hạ tầng', type: 'error' });
    } finally {
      setBusyAction(null);
    }
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
            {item.label}{item.key === 'need' && <ChargingStationNeedBadge stage="xay-dung-ha-tang" />}
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
        emptyMessage={tab === 'need' ? 'Không có trạm sạc cần hoàn thiện hạ tầng' : 'Không có trạm sạc'}
        startIndex={(pagination.page - 1) * PAGE_SIZE}
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
      <Dialog isOpen={!!editing} title={editing?.item.columnLabel || 'Hạ tầng'}
        onClose={() => { if (!busyAction) setEditing(null); }} size="md">
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            {editing?.item.type === 'power' ? 'Trạng thái điện' : 'Trạng thái mặt bằng'}
            <select className="select select-bordered mt-2 w-full" value={status}
              aria-label={editing?.item.type === 'power' ? 'Trạng thái điện' : 'Trạng thái mặt bằng'}
              disabled={!!busyAction} onChange={event => setStatus(event.target.value)}>
              {['NOT', 'DOING', 'DONE'].map(value => (
                <option key={value} value={value}
                  disabled={user?.role !== 'SUPER_ADMIN' && value !== (editing?.expectedStatus === 'NOT' ? 'DOING' : 'DONE')}>
                  {CS_FLOW_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <Input type="date" label="Ngày" aria-label="Ngày" required value={date}
            disabled={!!busyAction} onChange={event => setDate(event.target.value)} />
          <label className="block text-sm font-medium">Ghi chú
            <textarea className="textarea textarea-bordered mt-2 w-full" rows={3}
              value={note} disabled={!!busyAction} onChange={event => setNote(event.target.value)} />
          </label>
          {user?.role === 'SUPER_ADMIN' && <p className="text-xs text-base-content/60">
            SUPER_ADMIN được chọn trạng thái tùy ý. Lùi trạng thái không tự lùi tiến độ giao trụ đã thực hiện.
          </p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={!!busyAction} onClick={() => setEditing(null)}>Hủy</Button>
            <Button variant="primary" loading={!!busyAction} disabled={!!busyAction} onClick={updateInfrastructure}>Xác nhận</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default ChargingStationInfrastructureTabs;
