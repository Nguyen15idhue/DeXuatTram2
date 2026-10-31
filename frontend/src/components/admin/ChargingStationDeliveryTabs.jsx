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
  CS_SUB_STATUS_LABELS
} from '../../utils/chargingStation';
import { Badge, Button, DataTable, Dialog, FilterBar, Input, Pagination, Select, Toast } from '../ui';

const PAGE_SIZE = 20;
const TABS = [
  { key: 'need', label: 'Trạm sạc cần thực hiện' },
  { key: 'completed', label: 'Trạm sạc đã hoàn thành' },
  { key: 'all', label: 'Tất cả trạm sạc' }
];
const EMPTY_TOAST = { message: '', type: 'success' };
const EMPTY_EXPORT = { carrier: '', transport_code: '', transport_status: 'SHIPPING', total_amount: '' };

const parseRows = (value) => {
  let parsed = value;
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  return Array.isArray(parsed) ? parsed : [];
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const formatMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN')} đ` : '—';
};

const getMissingItems = (station) => [
  station.contract_status !== 'DONE' ? 'Hợp đồng' : null,
  !['DOING', 'DONE'].includes(station.payment_status) ? 'Tài chính / tiền cọc' : null,
  station.infra_site_status !== 'DONE' ? 'Hạ tầng mặt bằng' : null
].filter(Boolean);

const ChargingStationDeliveryTabs = () => {
  const { token, user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'need';
  const canManageDelivery = user?.role === 'SUPER_ADMIN' || isBackOfficeDept(user);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [busy, setBusy] = useState(false);
  const [earlyStation, setEarlyStation] = useState(null);
  const [earlyForm, setEarlyForm] = useState({ desired_delivery_date: '', reason: '' });
  const [exportStation, setExportStation] = useState(null);
  const [exportForm, setExportForm] = useState(EMPTY_EXPORT);
  const [deliveryStation, setDeliveryStation] = useState(null);
  const [toast, setToast] = useState(EMPTY_TOAST);

  const load = useCallback(async (targetPage) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        stage: 'giao-tru',
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
  }, [token, tab, debouncedSearch]);

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
      setEarlyStation(null);
      setExportStation(null);
      setDeliveryStation(null);
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Thao tác thất bại', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const submitEarlyRequest = () => {
    if (!earlyStation || !earlyForm.desired_delivery_date || !earlyForm.reason.trim()) {
      setToast({ message: 'Vui lòng nhập ngày mong muốn và lý do đề xuất giao trụ sớm', type: 'error' });
      return;
    }
    return run(
      () => chargingStationService.requestEarlyDelivery(earlyStation.id, earlyForm, token),
      'Đã gửi đề xuất giao trụ sớm'
    );
  };

  const submitExport = () => {
    if (!exportStation) return;
    return run(
      () => chargingStationService.createDeliveryExport(exportStation.id, {
        ...exportForm,
        total_amount: Number(exportForm.total_amount)
      }, token),
      'Đã tạo phiếu xuất kho và chuyển sang Đang giao trụ'
    );
  };

  const columns = useMemo(() => [
    {
      key: 'ma_tram',
      label: 'Mã trạm',
      render: (value, row) => (
        <Link
          to={`/admin/on-tram/giao-tru/${row.id}`}
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
    {
      key: 'contract_status',
      label: 'Hợp đồng',
      render: (value) => <Badge variant={CS_CONTRACT_VARIANT[value] || 'ghost'} size="sm" outline>{CS_CONTRACT_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'payment_status',
      label: 'Tài chính',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>{CS_PAYMENT_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'infra_site_status',
      label: 'Hạ tầng mặt bằng',
      render: (value) => <Badge variant={CS_FLOW_VARIANT[value] || 'ghost'} size="sm" outline>{CS_FLOW_LABELS[value] || '—'}</Badge>
    },
    {
      key: 'chot_so_luong_tru',
      label: 'Trụ chốt',
      render: (value) => parseRows(value).map((row) => `${row.loai_tru || 'Trụ'} × ${row.so_luong || 0}`).join(', ') || '—'
    },

  ], [location.pathname, location.search]);

  const renderActions = (row) => {
    if (canManageDelivery) {
      if (row.status === 'DELIVERING' && row.sub_status === 'NOT_DELIVERED') {
        return (
          <Button size="xs" onClick={() => {
            setExportForm(EMPTY_EXPORT);
            setExportStation(row);
          }}>
            Xuất trụ
          </Button>
        );
      }
      if (row.status === 'DELIVERING' && row.sub_status === 'DELIVERING') {
        return <Button variant="primary" size="xs" onClick={() => setDeliveryStation(row)}>Đã giao đến nơi</Button>;
      }
    }
    if ((!isBackOfficeDept(user) || user?.role === 'SUPER_ADMIN') && row.status === 'ONBOARDING') {
      return (
        <Button size="xs" onClick={() => {
          setEarlyForm({ desired_delivery_date: '', reason: '' });
          setEarlyStation(row);
        }}>
          Đề xuất giao trụ sớm
        </Button>
      );
    }
    return <span className="text-xs text-base-content/50">—</span>;
  };

  const committedRows = parseRows(exportStation?.chot_so_luong_tru);

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
        emptyMessage={tab === 'need' ? 'Không có trạm sạc cần giao trụ' : 'Không có trạm sạc'}
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
        isOpen={!!earlyStation}
        onClose={() => { if (!busy) setEarlyStation(null); }}
        title={earlyStation ? `Đề xuất giao trụ sớm — ${earlyStation.ma_tram || `#${earlyStation.id}`}` : 'Đề xuất giao trụ sớm'}
        size="md"
      >
        {earlyStation && (
          <div className="space-y-4">
            <div className="alert alert-warning">
              <span>
                Các phần chưa hoàn thiện: <strong>{getMissingItems(earlyStation).join(', ') || 'Không có'}</strong>.
                Đề xuất sớm sẽ được ghi nhận và chuyển cho Back Office xử lý.
              </span>
            </div>
            <Input
              label="Ngày mong muốn nhận hàng"
              type="date"
              required
              value={earlyForm.desired_delivery_date}
              disabled={busy}
              onChange={(event) => setEarlyForm({ ...earlyForm, desired_delivery_date: event.target.value })}
            />
            <div className="form-control w-full">
              <label className="label"><span className="label-text font-medium">Lý do đề xuất giao sớm *</span></label>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                value={earlyForm.reason}
                disabled={busy}
                onChange={(event) => setEarlyForm({ ...earlyForm, reason: event.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setEarlyStation(null)}>Hủy</Button>
              <Button loading={busy} disabled={!earlyForm.desired_delivery_date || !earlyForm.reason.trim()} onClick={submitEarlyRequest}>
                Gửi đề xuất
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        isOpen={!!exportStation}
        onClose={() => { if (!busy) setExportStation(null); }}
        title={exportStation ? `Xuất trụ — ${exportStation.ma_tram || `#${exportStation.id}`}` : 'Xuất trụ'}
        size="lg"
      >
        {exportStation && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Bên vận chuyển" required value={exportForm.carrier} disabled={busy}
                onChange={(event) => setExportForm({ ...exportForm, carrier: event.target.value })} />
              <Input label="Mã vận chuyển" required value={exportForm.transport_code} disabled={busy}
                onChange={(event) => setExportForm({ ...exportForm, transport_code: event.target.value })} />
              <Select
                label="Trạng thái vận chuyển"
                options={[
                  { value: 'SHIPPING', label: 'Đang vận chuyển' },
                  { value: 'PENDING', label: 'Chờ vận chuyển' }
                ]}
                value={exportForm.transport_status}
                disabled={busy}
                onChange={(event) => setExportForm({ ...exportForm, transport_status: event.target.value })}
                placeholder={null}
              />
              <Input label="Tổng số tiền vận chuyển" type="number" min="0" step="1000" required
                value={exportForm.total_amount} disabled={busy}
                onChange={(event) => setExportForm({ ...exportForm, total_amount: event.target.value })} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-base-300">
              <table className="table table-sm">
                <thead><tr><th>Mô hình</th><th>Loại trụ</th><th>Số lượng</th><th>Giá chốt</th><th>Thành tiền</th></tr></thead>
                <tbody>
                  {committedRows.map((row, index) => (
                    <tr key={`${row.mo_hinh}-${row.loai_tru}-${index}`}>
                      <td>{row.mo_hinh || '—'}</td>
                      <td>{row.loai_tru || '—'}</td>
                      <td>{Number(row.so_luong) || 0}</td>
                      <td>{formatMoney(row.gia_chot)}</td>
                      <td>{formatMoney(row.thanh_tien)}</td>
                    </tr>
                  ))}
                  {committedRows.length === 0 && <tr><td colSpan={5} className="text-center">Đề xuất chưa có số lượng trụ chốt</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-base-content/60">
              Hệ thống sẽ ghép tên loại trụ chốt với danh mục kho và kiểm tra tồn trước khi ghi phiếu xuất.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setExportStation(null)}>Hủy</Button>
              <Button loading={busy} disabled={!exportForm.carrier.trim() || !exportForm.transport_code.trim() || exportForm.total_amount === '' || committedRows.length === 0}
                onClick={submitExport}>
                Xác nhận xuất trụ
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        isOpen={!!deliveryStation}
        onClose={() => { if (!busy) setDeliveryStation(null); }}
        title="Xác nhận giao trụ đến nơi"
        size="sm"
      >
        {deliveryStation && (
          <div className="space-y-4">
            <p className="text-sm">
              Xác nhận các trụ của mã trạm <strong>{deliveryStation.ma_tram || `#${deliveryStation.id}`}</strong> đã giao đến khách?
              Trạm sẽ chuyển sang bước lắp đặt và Phòng Setup và Vận hành nhận thông báo.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setDeliveryStation(null)}>Hủy</Button>
              <Button variant="primary" loading={busy} onClick={() => run(
                () => chargingStationService.confirmDelivery(deliveryStation.id, token),
                'Đã xác nhận giao trụ đến nơi'
              )}>
                Xác nhận đã giao
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default ChargingStationDeliveryTabs;
