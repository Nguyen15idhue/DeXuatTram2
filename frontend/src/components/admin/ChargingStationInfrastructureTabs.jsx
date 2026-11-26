import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { canOperateStation } from '../../utils/chargingFulfillment';
import ChargingStationNeedBadge from './ChargingStationNeedBadge';
import ChargingStationStepHistory from './ChargingStationStepHistory';
import ChargingStationTable from './ChargingStationTable';
import ChargingStationExportButton from './ChargingStationExportButton';
import {
  CS_CONTRACT_LABELS,
  CS_CONTRACT_VARIANT,
  CS_FLOW_LABELS,
  CS_FLOW_VARIANT,
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  CS_SUB_STATUS_LABELS,
  formatCsDate
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
const CONFIRMATION_LABELS = {
  NOT_CONFIRMED: 'Chưa xác nhận',
  CONFIRMED: 'Đủ điều kiện đi trụ'
};

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
  const [confirmationEditing, setConfirmationEditing] = useState(null);
  const [confirmationStatus, setConfirmationStatus] = useState('NOT_CONFIRMED');
  const [confirmationNote, setConfirmationNote] = useState('');
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
      render: (value) => (
          <Badge variant={CS_CONTRACT_VARIANT[value] || 'ghost'} size="sm" outline className="h-auto whitespace-normal py-1">
            {CS_CONTRACT_LABELS[value] || '—'}
          </Badge>
      )
    },
    ...INFRASTRUCTURE_ITEMS.map((item) => ({
      key: item.field,
      label: item.columnLabel,
      render: (value, row) => {
        const editable = row.status !== 'CANCELLED' && canOperateStation(user, row, 'infrastructure');
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
              setStatus(current);
              setDate(row[`infra_${item.type}_date`] || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
              setNote(row[`infra_${item.type}_note`] || '');
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
      key: 'infra_delivery_confirmation',
      label: 'Xác nhận điều kiện đi trụ',
      width: 200,
      render: (value, row) => {
        const isNq = String(row.mo_hinh_dau_tu || '').trim().toUpperCase() === 'NQ';
        const exempt = isNq || row.infra_delivery_confirmation_exempt === true
          || row.infra_delivery_confirmation_exempt === 1 || row.infra_delivery_confirmation_exempt === '1';
        const current = value || 'NOT_CONFIRMED';
        const label = exempt ? (isNq ? 'Không cần xác nhận' : 'Áp dụng quy định cũ')
          : (CONFIRMATION_LABELS[current] || current);
        const editable = !exempt && row.status !== 'CANCELLED'
          && (user?.role === 'SUPER_ADMIN' || row.permissions?.setup === true || row.permissions?.setup === 1);
        return editable ? (
          <button type="button" aria-label={`Xác nhận điều kiện đi trụ: ${label}`}
            aria-haspopup="dialog" disabled={busyAction !== null}
            title={row.infra_delivery_confirmation_note || ''}
            className="inline-flex w-full items-center justify-between gap-2 rounded-full border border-base-300 bg-base-200 px-3 py-1 text-xs font-medium hover:brightness-95 disabled:opacity-50"
            onClick={() => {
              setConfirmationEditing({ station: row, expectedStatus: current });
              setConfirmationStatus(current);
              setConfirmationNote(row.infra_delivery_confirmation_note || '');
            }}>
            {label}<ChevronDown size={14} />
          </button>
        ) : (
          <span title={row.infra_delivery_confirmation_note || ''}>
            <Badge variant={current === 'CONFIRMED' && !exempt ? 'success' : 'ghost'} size="sm" outline>{label}</Badge>
          </span>
        );
      }
    },
    { key: 'ngay_du_kien_on', label: 'Ngày ON dự kiến', render: (value) => formatCsDate(value) },

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

  const updateConfirmation = async () => {
    if (!confirmationEditing) return;
    const { station, expectedStatus } = confirmationEditing;
    setBusyAction(`${station.id}:confirmation`);
    try {
      const response = await chargingStationService.updateInfrastructureConfirmation(station.id, {
        status: confirmationStatus, expected_status: expectedStatus, note: confirmationNote.trim()
      }, token);
      if (!response?.success) {
        setConfirmationEditing(null);
        await load(page);
        throw new Error(response?.message || 'Không cập nhật được xác nhận điều kiện đi trụ');
      }
      setToast({ message: response.message || 'Đã cập nhật xác nhận điều kiện đi trụ', type: 'success' });
      setConfirmationEditing(null);
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không cập nhật được xác nhận điều kiện đi trụ', type: 'error' });
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
        <ChargingStationExportButton stage="xay-dung-ha-tang" tab={tab} search={debouncedSearch}
          disabled={debouncedSearch !== search} token={token} />
      </FilterBar>

      <ChargingStationTable
        showProposalColumns
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
                <option key={value} value={value}>
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
          <p className="text-xs text-base-content/60">Lùi trạng thái giữ ngày, ghi chú cũ và không tự lùi các bước khác.</p>
          <ChargingStationStepHistory stationId={editing?.station.id} step="xay-dung-ha-tang" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={!!busyAction} onClick={() => setEditing(null)}>Hủy</Button>
            <Button variant="primary" loading={!!busyAction} disabled={!!busyAction} onClick={updateInfrastructure}>Xác nhận</Button>
          </div>
        </div>
      </Dialog>
      <Dialog isOpen={!!confirmationEditing} title="Xác nhận điều kiện đi trụ"
        onClose={() => { if (!busyAction) setConfirmationEditing(null); }} size="md">
        <div className="space-y-4">
          <label className="block text-sm font-medium">Trạng thái xác nhận
            <select className="select select-bordered mt-2 w-full" value={confirmationStatus}
              disabled={!!busyAction} onChange={event => setConfirmationStatus(event.target.value)}>
              {Object.entries(CONFIRMATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">Ghi chú (không bắt buộc)
            <textarea className="textarea textarea-bordered mt-2 w-full" rows={3}
              value={confirmationNote} disabled={!!busyAction} onChange={event => setConfirmationNote(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={!!busyAction} onClick={() => setConfirmationEditing(null)}>Hủy</Button>
            <Button variant="primary" loading={!!busyAction} disabled={!!busyAction} onClick={updateConfirmation}>Xác nhận</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default ChargingStationInfrastructureTabs;
