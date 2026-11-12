import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { AlertTriangle, MoreVertical } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Dialog, FilterBar, Input, Pagination, Toast } from '../ui';
import ChargingStationTable from './ChargingStationTable';
import ChargingStationCareModal from './ChargingStationCareModal';
import ChargingStationNeedBadge from './ChargingStationNeedBadge';
import { formatChotTruRows } from '../../utils/proposalSignature';
import { notifyBellRefresh } from '../layout/NotificationBell';
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

const PAGE_SIZE = 20;
const EMPTY_TOAST = { message: '', type: 'success' };
const getLocalDateInput = () => {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const TABS = [
  { key: 'all', label: 'Tất cả trạm sạc' },
  { key: 'need', label: 'Cần theo dõi tiến độ' },
  { key: 'completed', label: 'Trạm sạc đã ON' }
];

const ChargingStationTab = ({ stage }) => {
  const { token, user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'all';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [careStation, setCareStation] = useState(null);
  const [menu, setMenu] = useState(null);
  const [editStation, setEditStation] = useState(null);
  const [changeStation, setChangeStation] = useState(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [statusDialog, setStatusDialog] = useState({ open: false, action: '', row: null });
  const [onStationDialog, setOnStationDialog] = useState({ open: false, row: null, cms_station_code: '', on_date: '', reason: '', acknowledged: false });
  const [statusSaving, setStatusSaving] = useState(false);
  const [onStationSaving, setOnStationSaving] = useState(false);
  const statusSavingRef = useRef(false);
  const [toast, setToast] = useState(EMPTY_TOAST);
  const closeToast = useCallback(() => setToast(EMPTY_TOAST), []);

  const load = useCallback(async (targetPage) => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ stage, tab, page: targetPage, limit: PAGE_SIZE });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await chargingStationService.getAll(params.toString(), token);
      if (res?.success === false) throw new Error(res.message || 'Không tải được danh sách ON trạm');
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (error) {
      setLoadError(error?.message || 'Không tải được danh sách ON trạm');
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

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const reposition = () => {
      if (!menu.anchor.isConnected) { close(); return; }
      const bounds = menu.anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(bounds.right - 220, window.innerWidth - 228));
      const top = Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 300));
      setMenu(current => current && (current.left !== left || current.top !== top) ? { ...current, left, top } : current);
    };
    const keydown = event => { if (event.key === 'Escape') close(); };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('keydown', keydown);
    };
  }, [menu]);

  const saveOverview = async (kind) => {
    if (mutationBusy) return;
    setMutationBusy(true);
    try {
      if (kind === 'edit') await chargingStationService.update(editStation.id, {
        description: editStation.description, note: editStation.note,
        ...(editStation.on_date !== editStation.original_on_date ? { on_date: editStation.on_date || null } : {})
      }, token);
      else {
        if (!changeStation.reason.trim()) throw new Error('Bắt buộc nhập lý do đổi trạng thái');
        await chargingStationService.changeStatus(changeStation.row.id, {
          to_status: changeStation.to_status, reason: changeStation.reason.trim()
        }, token);
      }
      setEditStation(null);
      setChangeStation(null);
      setToast({ message: 'Đã cập nhật ON trạm', type: 'success' });
      await load(page);
    } catch (error) { setToast({ message: error.message || 'Không thể cập nhật ON trạm', type: 'error' }); }
    finally { setMutationBusy(false); }
  };

  useEffect(() => {
    if (!deleteTarget) {
      setDeletePreview(null);
      setDeletePreviewLoading(false);
      setDeleteError('');
      setDeleteReason('');
      return undefined;
    }

    let active = true;
    setDeletePreview(null);
    setDeletePreviewLoading(true);
    setDeleteError('');
    chargingStationService.getDeletePreview(deleteTarget.id, token)
      .then((response) => {
        if (!response?.success) throw new Error(response?.message || 'Không thể tải thông tin xóa ON trạm');
        if (active) setDeletePreview(response.data);
      })
      .catch((error) => {
        if (active) setDeleteError(error?.message || 'Không thể tải thông tin xóa ON trạm');
      })
      .finally(() => {
        if (active) setDeletePreviewLoading(false);
      });

    return () => { active = false; };
  }, [deleteTarget, token]);

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

  const openOnStationDialog = (row) => {
    setOnStationDialog({
      open: true,
      row,
      cms_station_code: row.cms_station_code || '',
      on_date: getLocalDateInput(),
      reason: '',
      acknowledged: false
    });
  };

  const confirmMarkOnStation = async () => {
    if (!onStationDialog.row || !onStationDialog.cms_station_code.trim()
      || !onStationDialog.on_date || onStationDialog.reason.trim().length < 3
      || !onStationDialog.acknowledged || onStationSaving) return;
    setOnStationSaving(true);
    try {
      const res = await chargingStationService.markOnStationActive(onStationDialog.row.id, {
        cms_station_code: onStationDialog.cms_station_code.trim(),
        on_date: onStationDialog.on_date,
        reason: onStationDialog.reason.trim()
      }, token);
      if (!res?.success) throw new Error(res?.message || 'Không thể đánh dấu ON trạm');
      setOnStationDialog({ open: false, row: null, cms_station_code: '', on_date: '', reason: '', acknowledged: false });
      setToast({ message: res.message || 'Đã đánh dấu ON trạm; đề xuất đã chuyển sang Hoạt động', type: 'success' });
      notifyBellRefresh();
      await load(page);
    } catch (error) {
      setToast({ message: error?.message || 'Không thể đánh dấu ON trạm', type: 'error' });
    } finally {
      setOnStationSaving(false);
    }
  };

  const removeOnStation = async () => {
    if (!deleteTarget || !deletePreview || deleteReason.trim().length < 3 || deleteSaving) return;
    setDeleteSaving(true);
    setDeleteError('');
    try {
      const response = await chargingStationService.deleteOnStation(deleteTarget.id, {
        reason: deleteReason.trim(),
        preview_token: deletePreview.preview_token
      }, token);
      if (!response?.success) throw new Error(response?.message || 'Không thể xóa ON trạm');
      setDeleteTarget(null);
      setToast({ message: response.message || 'Đã xóa ON trạm và rollback tồn kho', type: 'success' });
      await load(page);
    } catch (error) {
      setDeleteError(error?.message || 'Không thể xóa ON trạm');
    } finally {
      setDeleteSaving(false);
    }
  };

  const formatMoney = (value) => Number(value || 0).toLocaleString('vi-VN');

  const columns = useMemo(() => [
    {
      key: 'ma_tram',
      label: 'Mã trạm',
      render: (value, row) => (
        <Link
          to={`/admin/on-tram/thong-tin-chung/${row.id}`}
          state={{ returnTo: `${location.pathname}${location.search}` }}
          className="link link-primary underline text-left"
        >
          {value || `#${row.id}`}
        </Link>
      )
    },
    {
      key: 'progress',
      label: 'Cập nhật tiến độ',
      render: (_, row) => <Button variant="outline" size="xs"
        onClick={() => setCareStation({ id: row.id, code: row.ma_tram })}>Cập nhật tiến độ</Button>
    },
    { key: 'owner_name', label: 'Chủ trạm', render: (value) => value || '—' },
    { key: 'owner_phone', label: 'SĐT', render: (value) => value || '—' },
    { key: 'chot_so_luong_tru', label: 'Số lượng trụ chốt',
      render: (value) => <span className="whitespace-normal">{formatChotTruRows(value)}</span> },
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
      render: (value, row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={CS_CONTRACT_VARIANT[value]} size="sm" outline className="whitespace-normal h-auto py-1">{CS_CONTRACT_LABELS[value] || '—'}</Badge>
          {value !== 'DONE' && !isCsDeadlineStopped(row) && row.contract_deadline_at && (
            <span className={`text-xs ${new Date(String(row.contract_deadline_at).replace(' ', 'T')).getTime() <= Date.now() ? 'text-error font-semibold' : 'text-base-content/60'}`}>
              {getCsDeadlineLabel(row.contract_deadline_at, false, false)}
            </span>
          )}
        </div>
      )
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

  const renderActions = row => (isSuperAdmin || (user?.role !== 'ADMIN'
    && (row.can_cancel_on_station || row.can_restore_on_station))) ? (
    <button type="button" className="btn btn-ghost btn-xs btn-square" aria-label={`Thao tác khác ${row.ma_tram || row.id}`}
      aria-haspopup="menu" onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setMenu({ row, anchor: event.currentTarget, left: Math.max(8, Math.min(bounds.right - 220, window.innerWidth - 228)),
          top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 300)) });
      }}><MoreVertical size={16} /></button>
  ) : <span className="text-xs text-base-content/50">Chỉ xem</span>;

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      {menu && createPortal(<>
        <div className="fixed inset-0 z-[9998]" onClick={() => setMenu(null)} />
        <div role="menu" className="fixed z-[9999] w-[220px] rounded-lg border border-base-300 bg-base-100 p-1 shadow-xl"
          style={{ left: menu.left, top: menu.top }}>
          {isSuperAdmin && <>
            <button role="menuitem" className="btn btn-ghost btn-sm w-full justify-start" onClick={() => {
              setEditStation({ id: menu.row.id, description: menu.row.description || '', note: menu.row.note || '',
                on_date: menu.row.on_date || '', original_on_date: menu.row.on_date || '' }); setMenu(null);
            }}>Sửa</button>
            <button role="menuitem" className="btn btn-ghost btn-sm w-full justify-start" onClick={() => {
              setChangeStation({ row: menu.row, to_status: '', reason: '' }); setMenu(null);
            }}>Đổi trạng thái</button>
          </>}
          {user?.role !== 'ADMIN' && menu.row.can_cancel_on_station && <button role="menuitem"
            className="btn btn-ghost btn-sm w-full justify-start text-error" onClick={() => {
              setStatusDialog({ open: true, action: 'cancel', row: menu.row }); setMenu(null);
            }}>Hủy ON trạm</button>}
          {user?.role !== 'ADMIN' && menu.row.can_restore_on_station && <button role="menuitem"
            className="btn btn-ghost btn-sm w-full justify-start" onClick={() => {
              setStatusDialog({ open: true, action: 'restore', row: menu.row }); setMenu(null);
            }}>Khôi phục</button>}
          {isSuperAdmin && menu.row.can_mark_on_station_active && !menu.row.fulfillment?.items?.length && !menu.row.deployments?.length
            && <button role="menuitem" className="btn btn-ghost btn-sm w-full justify-start text-success" onClick={() => {
              openOnStationDialog(menu.row); setMenu(null);
            }}>Đã ON Trạm</button>}
          {isSuperAdmin && <button role="menuitem" className="btn btn-ghost btn-sm w-full justify-start text-error"
            onClick={() => { setDeleteTarget(menu.row); setMenu(null); }}>Xóa ON trạm</button>}
        </div>
      </>, document.body)}
      <Dialog isOpen={!!editStation} title="Sửa thông tin ON trạm" size="md"
        onClose={() => { if (!mutationBusy) setEditStation(null); }}>
        {editStation && <div className="space-y-3">
          <Input type="date" label="Ngày ON thực tế" aria-label="Ngày ON thực tế" value={editStation.on_date}
            disabled={mutationBusy} onChange={event => setEditStation({ ...editStation, on_date: event.target.value })} />
          <p className="text-xs text-base-content/60">Ngày ON đã ghi nhận theo phần trụ được bảo vệ, không thể sửa qua thông tin chung.</p>
          {['description', 'note'].map(key => <label key={key} className="block text-sm">
            {key === 'description' ? 'Mô tả' : 'Ghi chú nội bộ'}
            <textarea className="textarea textarea-bordered mt-1 w-full" rows={3} value={editStation[key]}
              disabled={mutationBusy} onChange={event => setEditStation({ ...editStation, [key]: event.target.value })} />
          </label>)}
          <div className="flex justify-end gap-2"><Button variant="ghost" disabled={mutationBusy} onClick={() => setEditStation(null)}>Hủy</Button>
            <Button loading={mutationBusy} onClick={() => saveOverview('edit')}>Lưu</Button></div>
        </div>}
      </Dialog>
      <Dialog isOpen={!!changeStation} title="Đổi trạng thái ON trạm" size="md"
        onClose={() => { if (!mutationBusy) setChangeStation(null); }}>
        {changeStation && <div className="space-y-3">
          <p className="text-sm">Trạng thái hiện tại: {CS_STATUS_LABELS[changeStation.row.status]}</p>
          <p className="text-sm text-warning">Chỉ hỗ trợ chuyển hợp lệ cho hồ sơ legacy. Trạm có dữ liệu triển khai từng phần phải cập nhật tại từng bước nghiệp vụ.</p>
          <label className="block text-sm">Trạng thái đích
            <select className="select select-bordered mt-1 w-full" value={changeStation.to_status}
              disabled={mutationBusy} onChange={event => setChangeStation({ ...changeStation, to_status: event.target.value })}>
              <option value="">Chọn trạng thái</option>
              {changeStation.row.status === 'ONBOARDING' && changeStation.row.delivery_ready && !changeStation.row.fulfillment?.items?.length
                && <option value="DELIVERING">{CS_STATUS_LABELS.DELIVERING}</option>}
              {changeStation.row.status === 'ACCEPTANCE' && !changeStation.row.fulfillment?.items?.length && !changeStation.row.deployments?.length
                && <option value="INSTALLING">{CS_STATUS_LABELS.INSTALLING}</option>}
            </select>
          </label>
          <label className="block text-sm">Lý do *
            <textarea className="textarea textarea-bordered mt-1 w-full" rows={3} value={changeStation.reason} disabled={mutationBusy}
              onChange={event => setChangeStation({ ...changeStation, reason: event.target.value })} />
          </label>
          <div className="flex justify-end gap-2"><Button variant="ghost" disabled={mutationBusy} onClick={() => setChangeStation(null)}>Hủy</Button>
            <Button loading={mutationBusy} disabled={mutationBusy || !changeStation.to_status || !changeStation.reason.trim()} onClick={() => saveOverview('status')}>Xác nhận</Button></div>
        </div>}
      </Dialog>
      {loadError && <div role="alert" className="alert alert-error">{loadError}</div>}

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

      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => { if (!deleteSaving) setDeleteTarget(null); }}
        title={`Xóa ON trạm · ${deleteTarget?.ma_tram || `#${deleteTarget?.id || ''}`}`}
      >
        <div className="space-y-4">
          <div className="alert alert-warning items-start">
            <AlertTriangle size={20} className="mt-0.5 shrink-0" />
            <div className="text-sm">
              Thao tác xóa vĩnh viễn ON trạm, phiếu xuất kho và phiếu cọc/thanh toán/hoàn cọc liên quan.
              Đề xuất được giữ nguyên trạng thái. Phiếu nhập kho vẫn giữ, nhưng sẽ bỏ liên kết với ON trạm.
              Tồn kho hệ thống sẽ được cộng lại theo số xuất ròng; việc này không thu hồi trụ vật lý.
              Tệp minh chứng không bị xóa khỏi kho tệp.
            </div>
          </div>
          {deletePreviewLoading && <div className="flex justify-center py-4"><span className="loading loading-spinner loading-md" /></div>}
          {deletePreview && <>
            <div className="rounded-lg border border-base-300 p-3 text-sm space-y-1">
              <div><strong>Mã đề xuất:</strong> {deletePreview.proposal_code || `#${deletePreview.proposal_id}`}</div>
              <div><strong>Trạng thái đề xuất sẽ giữ nguyên:</strong> {deletePreview.proposal_status}</div>
              <div><strong>Phiếu xuất sẽ xóa:</strong> {deletePreview.export_count} phiếu ({deletePreview.export_item_count} dòng trụ)</div>
              <div><strong>Phiếu tài chính sẽ xóa:</strong> {deletePreview.invoice_summary.count} phiếu — cọc {formatMoney(deletePreview.invoice_summary.DEPOSIT.amount)}, thanh toán {formatMoney(deletePreview.invoice_summary.PAYMENT.amount)}, hoàn cọc {formatMoney(deletePreview.invoice_summary.REFUND.amount)} đồng</div>
              <div><strong>Phiếu nhập được giữ:</strong> {deletePreview.warehouse_import_count} phiếu (bỏ liên kết ON trạm)</div>
              <div><strong>Dữ liệu vận hành sẽ xóa:</strong> {deletePreview.deployment_count} đợt triển khai, {deletePreview.acceptance_image_count} ảnh nghiệm thu, {deletePreview.care_log_count} nhật ký chăm sóc và {deletePreview.activity_log_count} nhật ký ON trạm</div>
            </div>
            <div className="space-y-1">
              <strong className="text-sm">Tồn kho sẽ được cộng lại:</strong>
              {deletePreview.restock_items.length
                ? <ul className="list-disc pl-5 text-sm">{deletePreview.restock_items.map((item) => (
                  <li key={`${item.supplier_id}:${item.pole_id}`}>
                    {item.supplier_name} · {item.pole_name} ({item.power_kw} kW): +{item.quantity} trụ
                  </li>
                ))}</ul>
                : <p className="text-sm text-base-content/60">Không có trụ cần cộng lại.</p>}
            </div>
            <Input
              label="Lý do xóa"
              required
              value={deleteReason}
              maxLength={5000}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="Nhập lý do xóa ON trạm"
            />
          </>}
          {deleteError && <div role="alert" className="alert alert-error flex-col items-start">
            <span>{deleteError}</span>
            {deleteTarget && <Button
              size="xs"
              variant="outline"
              disabled={deleteSaving}
              onClick={() => { setDeleteReason(''); setDeleteTarget({ ...deleteTarget }); }}
            >Tải lại thông tin xóa</Button>}
          </div>}
          <div className="modal-action">
            <Button variant="outline" disabled={deleteSaving} onClick={() => setDeleteTarget(null)}>Đóng</Button>
            <Button
              variant="error"
              loading={deleteSaving}
              disabled={deletePreviewLoading || !deletePreview || deleteReason.trim().length < 3}
              onClick={removeOnStation}
            >
              Xóa ON trạm
            </Button>
          </div>
        </div>
      </Dialog>

      {onStationDialog.open && (
        <dialog className="modal modal-open" onCancel={(event) => event.preventDefault()}>
          <div className="modal-box max-w-lg">
            <h3 className="text-lg font-bold">Xác nhận đã ON trạm</h3>
            <div className="alert alert-warning mt-3 py-2 text-sm">
              <span>Thao tác SUPER_ADMIN bỏ qua các bước vận hành trung gian. Trạng thái hợp đồng, hạ tầng và thanh toán sẽ giữ nguyên; bản ghi đã hủy không thể kích hoạt lại.</span>
            </div>
            <div className="mt-3 rounded-lg bg-base-200 p-3 text-sm">
              <div><b>Mã trạm:</b> {onStationDialog.row?.ma_tram || `#${onStationDialog.row?.id}`}</div>
              <div><b>Mã đề xuất:</b> {onStationDialog.row?.ma_de_xuat || `#${onStationDialog.row?.proposal_id}`}</div>
              <div><b>Trạng thái ON trạm:</b> {CS_STATUS_LABELS[onStationDialog.row?.status] || onStationDialog.row?.status}</div>
            </div>
            <div className="form-control mt-3">
              <label className="label"><span className="label-text">Mã trạm trên CMS *</span></label>
              <input
                className="input input-bordered"
                value={onStationDialog.cms_station_code}
                onChange={(event) => setOnStationDialog((prev) => ({ ...prev, cms_station_code: event.target.value }))}
                disabled={onStationSaving}
              />
            </div>
            <div className="form-control mt-2">
              <label className="label"><span className="label-text">Ngày ON thực tế *</span></label>
              <input
                type="date"
                className="input input-bordered"
                value={onStationDialog.on_date}
                onChange={(event) => setOnStationDialog((prev) => ({ ...prev, on_date: event.target.value }))}
                disabled={onStationSaving}
              />
            </div>
            <div className="form-control mt-2">
              <label className="label"><span className="label-text">Lý do đánh dấu ON trực tiếp *</span></label>
              <textarea
                className="textarea textarea-bordered"
                rows={3}
                value={onStationDialog.reason}
                onChange={(event) => setOnStationDialog((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Nhập lý do SUPER_ADMIN xác nhận trạm đã ON..."
                disabled={onStationSaving}
              />
            </div>
            <label className="label mt-1 cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-warning"
                checked={onStationDialog.acknowledged}
                onChange={(event) => setOnStationDialog((prev) => ({ ...prev, acknowledged: event.target.checked }))}
                disabled={onStationSaving}
              />
              <span className="label-text text-xs">Tôi xác nhận trạm đã ON thực tế và chịu trách nhiệm về thao tác bỏ qua các bước trung gian.</span>
            </label>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOnStationDialog({ open: false, row: null, cms_station_code: '', on_date: '', reason: '', acknowledged: false })}
                disabled={onStationSaving}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={confirmMarkOnStation}
                disabled={!onStationDialog.cms_station_code.trim() || !onStationDialog.on_date
                  || onStationDialog.reason.trim().length < 3 || !onStationDialog.acknowledged || onStationSaving}
              >
                {onStationSaving ? 'Đang cập nhật...' : 'Đã ON Trạm'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/50" />
        </dialog>
      )}

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
            {item.label}{item.key === 'need' && <ChargingStationNeedBadge stage="thong-tin-chung" />}
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

      <ChargingStationTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage={tab === 'need'
          ? 'Không có trạm sạc cần theo dõi tiến độ'
          : tab === 'completed'
            ? 'Chưa có trạm sạc đã ON toàn bộ trụ'
            : 'Chưa có bản ghi ON trạm nào'}
        startIndex={(pagination.page - 1) * PAGE_SIZE}
        actions={renderActions}
        frozenColumns={2}
      />

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={goPage}
      />

      {careStation && (
        <ChargingStationCareModal
          open
          stationId={careStation.id}
          stationCode={careStation.code}
          token={token}
          onClose={() => setCareStation(null)}
          onToast={(message, type = 'success') => setToast({ message, type })}
        />
      )}
    </div>
  );
};

export default ChargingStationTab;
