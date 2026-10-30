import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api, API_URL, chargingFinanceService } from '../../services/api';
import { Badge, Button, DataTable, Dialog, FilterBar, Input, Pagination, Select, Toast } from '../../components/ui';
import PageHeader from '../../components/ui/PageHeader';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { CS_PAYMENT_LABELS, CS_STATUS_LABELS, CS_SUB_STATUS_LABELS } from '../../utils/chargingStation';

const PAGE_SIZE = 20;
const TABS = [
  { key: 'need', label: 'Cần thực hiện' },
  { key: 'completed', label: 'Đã hoàn thành' },
  { key: 'all', label: 'Tất cả trạm sạc' }
];
const INVOICE_TYPES = [
  { value: 'DEPOSIT', label: 'Tiền cọc' },
  { value: 'REFUND', label: 'Hoàn cọc' },
  { value: 'PAYMENT', label: 'Thanh toán' }
];
const INVOICE_LABELS = Object.fromEntries(INVOICE_TYPES.map(({ value, label }) => [value, label]));
const PAYMENT_VARIANTS = { NOT: 'ghost', DOING: 'warning', DONE: 'success' };
const FLOW_LABELS = { NOT: 'Chưa làm', DOING: 'Đang làm', DONE: 'Hoàn thành' };
const EMPTY_INVOICE_FORM = { invoice_type: 'DEPOSIT', amount: '', content: '' };
const EMPTY_TOAST = { message: '', type: 'success' };

const formatMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const getDeadlineLabel = (value, completed) => {
  if (completed) return 'Đã hoàn thành';
  if (!value) return '—';
  const deadline = new Date(String(value).replace(' ', 'T')).getTime();
  if (Number.isNaN(deadline)) return '—';
  const remaining = deadline - Date.now();
  if (remaining <= 0) return 'Quá hạn';
  const totalHours = Math.ceil(remaining / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `Còn ${days} ngày ${hours} giờ` : `Còn ${totalHours} giờ`;
};

const AdminFinancePage = () => {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'need';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(EMPTY_TOAST);
  const [invoiceStation, setInvoiceStation] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePagination, setInvoicePagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [addingInvoice, setAddingInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(EMPTY_INVOICE_FORM);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [statusReason, setStatusReason] = useState('');

  const closeToast = useCallback(() => setToast(EMPTY_TOAST), []);

  const load = useCallback(async (targetPage = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, page: String(targetPage), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const response = await chargingFinanceService.getStations(params.toString(), token);
      if (!response?.success) throw new Error(response?.message || 'Không tải được danh sách trạm');
      setItems(response.data || []);
      setPagination(response.pagination || { page: targetPage, limit: PAGE_SIZE, total: 0, totalPages: 0 });
    } catch (error) {
      setItems([]);
      setToast({ message: error?.message || 'Không tải được danh sách tài chính', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, tab, debouncedSearch]);

  const loadInvoices = useCallback(async (stationId, targetPage = 1) => {
    if (!token || !stationId) return;
    setInvoiceLoading(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), limit: '20' });
      const response = await chargingFinanceService.getInvoices(stationId, params.toString(), token);
      if (!response?.success) throw new Error(response?.message || 'Không tải được hóa đơn');
      setInvoices(response.data || []);
      setInvoicePagination(response.pagination || { page: targetPage, limit: 20, total: 0, totalPages: 0 });
    } catch (error) {
      setInvoices([]);
      setToast({ message: error?.message || 'Không tải được lịch sử hóa đơn', type: 'error' });
    } finally {
      setInvoiceLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  const selectTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'need') next.delete('tab');
    else next.set('tab', nextTab);
    setSearchParams(next);
  };

  const openInvoices = (station) => {
    setInvoiceStation(station);
    setInvoicePage(1);
    setInvoices([]);
    setAddingInvoice(false);
    setInvoiceForm(EMPTY_INVOICE_FORM);
    setEvidenceFile(null);
    loadInvoices(station.id, 1);
  };

  const closeInvoices = () => {
    setInvoiceStation(null);
    setAddingInvoice(false);
    setEvidenceFile(null);
  };

  const submitInvoice = async (event) => {
    event.preventDefault();
    if (!invoiceStation || !Number.isFinite(Number(invoiceForm.amount)) || Number(invoiceForm.amount) <= 0) {
      setToast({ message: 'Số tiền phải lớn hơn 0', type: 'error' });
      return;
    }
    if (evidenceFile && (!evidenceFile.type.startsWith('image/') && evidenceFile.type !== 'application/pdf')) {
      setToast({ message: 'Bằng chứng phải là ảnh hoặc PDF', type: 'error' });
      return;
    }
    if (evidenceFile && evidenceFile.size > 10 * 1024 * 1024) {
      setToast({ message: 'Ảnh bằng chứng không được vượt quá 10 MB', type: 'error' });
      return;
    }

    setBusy(true);
    try {
      let evidenceFileId = null;
      if (evidenceFile) {
        const formData = new FormData();
        formData.append('file', evidenceFile);
        formData.append('originalName', evidenceFile.name);
        const upload = await api.uploadWithAuth('/files/upload', formData, token);
        if (!upload?.success || !upload.data?.id) {
          throw new Error(upload?.message || 'Tải ảnh bằng chứng thất bại');
        }
        evidenceFileId = upload.data.id;
      }

      const response = await chargingFinanceService.createInvoice(invoiceStation.id, {
        invoice_type: invoiceForm.invoice_type,
        amount: Number(invoiceForm.amount),
        content: invoiceForm.content.trim() || null,
        evidence_file_id: evidenceFileId
      }, token);
      if (!response?.success) throw new Error(response?.message || 'Không ghi nhận được hóa đơn');
      setToast({ message: response.message || 'Đã ghi nhận hóa đơn', type: 'success' });
      setInvoiceForm(EMPTY_INVOICE_FORM);
      setEvidenceFile(null);
      setAddingInvoice(false);
      setInvoicePage(1);
      await Promise.all([loadInvoices(invoiceStation.id, 1), load(page)]);
    } catch (error) {
      setToast({ message: error?.message || 'Không ghi nhận được hóa đơn', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const openStatusChange = (station, targetStatus) => {
    setStatusChange({ station, targetStatus });
    setStatusReason('');
  };

  const saveStatusChange = async (event) => {
    event.preventDefault();
    if (!statusChange || !statusReason.trim()) {
      setToast({ message: 'Vui lòng nhập lý do cập nhật trạng thái tài chính', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const response = await chargingFinanceService.updatePaymentStatus(statusChange.station.id, {
        payment_status: statusChange.targetStatus,
        reason: statusReason.trim()
      }, token);
      if (!response?.success) throw new Error(response?.message || 'Không cập nhật được trạng thái tài chính');
      setToast({ message: response.message || 'Đã cập nhật trạng thái tài chính', type: 'success' });
      setStatusChange(null);
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không cập nhật được trạng thái tài chính', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'ma_tram',
      label: 'Mã trạm',
      render: (value, row) => (
        <Link to={`/admin/on-tram/thong-tin-chung/${row.id}`} className="link link-primary font-mono text-xs font-semibold">
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
    {
      key: 'status',
      label: 'Giai đoạn ON trạm',
      render: (value, row) => (
        <div className="space-y-1">
          <div className="text-sm">{CS_STATUS_LABELS[value] || value}</div>
          {row.sub_status && <div className="text-xs text-base-content/60">{CS_SUB_STATUS_LABELS[row.sub_status] || row.sub_status}</div>}
        </div>
      )
    },
    {
      key: 'contract_status',
      label: 'Hợp đồng',
      render: (value) => <Badge variant={value === 'DONE' ? 'success' : value === 'DOING' ? 'warning' : 'ghost'} size="sm">{FLOW_LABELS[value] || value || '—'}</Badge>
    },
    {
      key: 'infra_power_status',
      label: 'Hạ tầng',
      render: (_, row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="text-xs">Điện: {FLOW_LABELS[row.infra_power_status] || row.infra_power_status || '—'}</span>
          <span className="text-xs">Mặt bằng: {FLOW_LABELS[row.infra_site_status] || row.infra_site_status || '—'}</span>
        </div>
      )
    },
    {
      key: 'payment_status',
      label: 'Tài chính',
      render: (value) => <Badge variant={PAYMENT_VARIANTS[value] || 'ghost'} outline>{CS_PAYMENT_LABELS[value] || value || '—'}</Badge>
    },
    {
      key: 'finance_deadline_at',
      label: 'Mốc 15 ngày',
      render: (value, row) => (
        <span className={row.payment_status === 'DONE' ? 'text-success text-xs' : 'text-xs'} title={formatDateTime(value)}>
          {getDeadlineLabel(value, row.payment_status === 'DONE')}
        </span>
      )
    }
  ], []);

  const invoiceColumns = useMemo(() => [
    { key: 'invoice_type', label: 'Loại', render: (value) => <Badge variant="info" size="sm">{INVOICE_LABELS[value] || value}</Badge> },
    { key: 'amount', label: 'Số tiền', render: formatMoney },
    { key: 'content', label: 'Nội dung', render: (value) => value || '—' },
    {
      key: 'evidence_file_name',
      label: 'Bằng chứng',
      render: (value, row) => row.evidence_file_id
        ? <a className="link link-primary text-xs" href={`${API_URL}/files/${row.evidence_file_id}/download?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer">{value || 'Xem file'}</a>
        : '—'
    },
    { key: 'creator_name', label: 'Người ghi nhận', render: (value) => value || '—' },
    { key: 'created_at', label: 'Ngày ghi nhận', render: formatDateTime }
  ], [token]);

  const renderActions = (station) => (
    <div className="flex flex-wrap justify-center gap-1">
      <Button size="xs" variant="outline" onClick={() => openInvoices(station)}>Hóa đơn</Button>
      {station.payment_status === 'NOT' && (
        <Button size="xs" disabled={busy} onClick={() => openStatusChange(station, 'DOING')}>Bắt đầu</Button>
      )}
      {station.payment_status === 'DOING' && (
        <Button size="xs" disabled={busy} onClick={() => openStatusChange(station, 'DONE')}>Hoàn tất</Button>
      )}
      {station.payment_status === 'DONE' && (
        <Button size="xs" variant="outline-warning" disabled={busy} onClick={() => openStatusChange(station, 'DOING')}>Mở lại</Button>
      )}
    </div>
  );

  const statusTargetLabel = statusChange?.targetStatus === 'DONE'
    ? 'Hoàn thành tài chính'
    : statusChange?.station.payment_status === 'DONE'
      ? 'Mở lại xử lý tài chính'
      : 'Bắt đầu xử lý tài chính';

  return (
    <div className="space-y-4">
      <PageHeader title="Quản lý tài chính ON trạm" subtitle="Theo dõi tiền cọc, hoàn cọc, thanh toán và trạng thái tài chính trong quy trình ON trạm" />

      <div role="tablist" className="tabs tabs-boxed w-fit">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            className={`tab ${tab === item.key ? 'tab-active' : ''}`}
            onClick={() => selectTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Toast message={toast.message} type={toast.type} onClose={closeToast} />

      <FilterBar>
        <Input placeholder="Tìm mã trạm, mã đề xuất, chủ trạm, địa chỉ..." value={search} onChange={(event) => setSearch(event.target.value)} className="!mb-0 flex-1" />
      </FilterBar>

      <div className="flex items-center justify-between text-sm text-base-content/60">
        <span>Tổng số trạm trong tab: <strong>{pagination.total}</strong></span>
        <span>Hạn xử lý: 15 ngày từ khi tạo ON trạm</span>
      </div>

      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage="Không có trạm sạc thuộc danh sách tài chính này"
        startIndex={(page - 1) * PAGE_SIZE}
        actions={renderActions}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={(nextPage) => { setPage(nextPage); load(nextPage); }}
      />

      <Dialog
        isOpen={!!invoiceStation}
        onClose={closeInvoices}
        title={invoiceStation ? `Hóa đơn tài chính · ${invoiceStation.ma_tram || `#${invoiceStation.id}`}` : ''}
        size="full"
      >
        {invoiceStation && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-base-200 p-3 text-sm">
              <span>Đề xuất: <Link to={`/admin/proposals/chi-tiet/${invoiceStation.proposal_id}`} className="link link-primary">{invoiceStation.ma_de_xuat || `#${invoiceStation.proposal_id}`}</Link></span>
              <Badge variant={PAYMENT_VARIANTS[invoiceStation.payment_status] || 'ghost'} outline>{CS_PAYMENT_LABELS[invoiceStation.payment_status] || invoiceStation.payment_status}</Badge>
            </div>

            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">Lịch sử hóa đơn</h4>
              <Button size="sm" onClick={() => setAddingInvoice((value) => !value)}>
                {addingInvoice ? 'Đóng biểu mẫu' : 'Ghi nhận hóa đơn'}
              </Button>
            </div>

            {addingInvoice && (
              <form className="grid gap-3 rounded-lg border border-base-300 p-4 md:grid-cols-2" onSubmit={submitInvoice}>
                <Select
                  label="Loại hóa đơn"
                  options={INVOICE_TYPES}
                  value={invoiceForm.invoice_type}
                  onChange={(event) => setInvoiceForm((form) => ({ ...form, invoice_type: event.target.value }))}
                  placeholder={null}
                />
                <Input
                  label="Số tiền (₫)"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={invoiceForm.amount}
                  onChange={(event) => setInvoiceForm((form) => ({ ...form, amount: event.target.value }))}
                />
                <label className="form-control w-full md:col-span-2">
                  <span className="label-text font-medium mb-2">Nội dung</span>
                  <textarea
                    className="textarea textarea-bordered w-full"
                    rows={2}
                    value={invoiceForm.content}
                    onChange={(event) => setInvoiceForm((form) => ({ ...form, content: event.target.value }))}
                  />
                </label>
                <Input
                  label="Ảnh bằng chứng (ảnh hoặc PDF, tối đa 10 MB)"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)}
                  className="md:col-span-2"
                />
                {evidenceFile && <span className="text-xs text-base-content/60 md:col-span-2">{evidenceFile.name}</span>}
                <div className="flex justify-end gap-2 md:col-span-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setAddingInvoice(false)}>Hủy</Button>
                  <Button type="submit" loading={busy}>Lưu hóa đơn</Button>
                </div>
              </form>
            )}

            <DataTable
              columns={invoiceColumns}
              data={invoices}
              loading={invoiceLoading}
              emptyMessage="Chưa ghi nhận hóa đơn nào"
            />
            <Pagination
              page={invoicePagination.page}
              totalPages={invoicePagination.totalPages}
              total={invoicePagination.total}
              onPageChange={(nextPage) => {
                setInvoicePage(nextPage);
                loadInvoices(invoiceStation.id, nextPage);
              }}
            />
          </div>
        )}
      </Dialog>

      <Dialog
        isOpen={!!statusChange}
        onClose={() => setStatusChange(null)}
        title={statusTargetLabel}
        size="md"
      >
        <form className="space-y-3" onSubmit={saveStatusChange}>
          <div className="rounded-lg bg-base-200 p-3 text-sm">
            {statusChange?.station.ma_tram || `Trạm #${statusChange?.station.id}`}:
            {' '}{CS_PAYMENT_LABELS[statusChange?.station.payment_status] || statusChange?.station.payment_status}
            {' → '}{CS_PAYMENT_LABELS[statusChange?.targetStatus] || statusChange?.targetStatus}
          </div>
          {statusChange?.targetStatus === 'DONE' && (
            <p className="text-sm text-warning">
              Chỉ xác nhận hoàn thành sau khi đã ghi nhận hóa đơn tiền cọc hoặc thanh toán.
            </p>
          )}
          <label className="form-control w-full">
            <span className="label-text font-medium mb-2">Lý do cập nhật (bắt buộc)</span>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={3}
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setStatusChange(null)}>Hủy</Button>
            <Button type="submit" loading={busy} disabled={!statusReason.trim()}>{statusTargetLabel}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default AdminFinancePage;
