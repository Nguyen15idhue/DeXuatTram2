import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, chargingStationCareService } from '../../services/api';
import { Button, ConfirmDialog, DataTable, Dialog, Input, Loading, Select, Toast } from '../ui';
import { formatCsDate } from '../../utils/chargingStation';

const EMPTY_TOAST = { message: '', type: 'success' };
const EMPTY_FORM = { employee_user_id: '', contact_time: '', content: '' };

const toDateTimeLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const ChargingStationCareModal = ({ open, stationId, stationCode, token, canEdit, onClose, onToast }) => {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(EMPTY_TOAST);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState({ open: false, id: null });

  const closeToast = useCallback(() => setToast(EMPTY_TOAST), []);

  const load = useCallback(async () => {
    if (!open || !stationId || !token) return;
    setLoading(true);
    try {
      const res = await chargingStationCareService.list(stationId, token);
      setLogs((res?.data || []).map((row, index) => ({ ...row, stt: index + 1 })));
    } catch (error) {
      setToast({ message: error?.message || 'Không tải được lịch sử chăm sóc', type: 'error' });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [open, stationId, token]);

  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !canEdit || !token) return;
    (async () => {
      try {
        const res = await api.getWithAuth('/admin/users/options/all', token);
        setUsers(res?.data || []);
      } catch { /* silent */ }
    })();
  }, [open, canEdit, token]);

  const userOptions = users.map((u) => ({ value: String(u.id), label: u.full_name }));

  const startCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, contact_time: new Date().toISOString().slice(0, 16) });
  };

  const startEdit = (log) => {
    setEditingId(log.id);
    setForm({
      employee_user_id: log.employee_user_id ? String(log.employee_user_id) : '',
      contact_time: toDateTimeLocal(log.contact_time),
      content: log.content || ''
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        employee_user_id: form.employee_user_id ? Number(form.employee_user_id) : null,
        contact_time: form.contact_time,
        content: form.content
      };
      if (editingId) {
        await chargingStationCareService.update(editingId, payload, token);
        onToast?.('Đã cập nhật lịch sử chăm sóc', 'success');
      } else {
        await chargingStationCareService.create(stationId, payload, token);
        onToast?.('Đã thêm lịch sử chăm sóc', 'success');
      }
      cancelForm();
      await load();
    } catch (error) {
      setToast({ message: error?.message || 'Lưu thất bại', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (id) => setConfirm({ open: true, id });

  const remove = async () => {
    const id = confirm.id;
    setConfirm({ open: false, id: null });
    setBusy(true);
    try {
      await chargingStationCareService.remove(id, token);
      onToast?.('Đã xóa lịch sử chăm sóc', 'success');
      await load();
    } catch (error) {
      setToast({ message: error?.message || 'Xóa thất bại', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'stt', label: 'STT' },
    { key: 'ma_tram', label: 'Mã trạm sạc', render: (value) => value || stationCode || '—' },
    { key: 'employee_name', label: 'Nhân viên', render: (value) => value || '—' },
    { key: 'contact_time', label: 'Thời gian', render: (value) => (value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '—') },
    { key: 'content', label: 'Nội dung liên hệ', render: (value) => <span className="whitespace-pre-wrap break-words">{value || '—'}</span> }
  ];

  return (
    <>
      <Dialog isOpen={open} onClose={onClose} title={`Lịch sử chăm sóc khách hàng - ${stationCode || `#${stationId}`}`} size="full">
        <div className="space-y-4">
          <Toast message={toast.message} type={toast.type} onClose={closeToast} />

          {canEdit && (
            <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-primary">{editingId ? 'Sửa lịch sử chăm sóc' : 'Thêm lịch sử chăm sóc'}</h3>
                {editingId && <Button variant="ghost" size="xs" onClick={cancelForm}>Hủy sửa</Button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Nhân viên"
                  options={userOptions}
                  placeholder="— Chọn nhân viên —"
                  value={form.employee_user_id}
                  onChange={(e) => setForm({ ...form, employee_user_id: e.target.value })}
                />
                <Input
                  type="datetime-local"
                  label="Thời gian liên hệ"
                  value={form.contact_time}
                  onChange={(e) => setForm({ ...form, contact_time: e.target.value })}
                  required
                />
              </div>
              <div className="form-control w-full">
                <span className="label-text font-medium mb-1">Nội dung liên hệ với chủ đầu tư</span>
                <textarea className="textarea textarea-bordered w-full" rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button loading={busy} onClick={submit} disabled={!form.contact_time || !form.content.trim()}>
                  {editingId ? 'Cập nhật' : 'Thêm mới'}
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <Loading message="Đang tải lịch sử chăm sóc..." />
          ) : (
            <DataTable
              columns={columns}
              data={logs}
              emptyMessage="Chưa có lịch sử chăm sóc khách hàng"
              actions={canEdit ? (row) => (
                <div className="flex gap-1">
                  <Button variant="outline" size="xs" onClick={() => startEdit(row)}>Sửa</Button>
                  <Button variant="outline-error" size="xs" onClick={() => confirmDelete(row.id)}>Xóa</Button>
                </div>
              ) : undefined}
            />
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        isOpen={confirm.open}
        title="Xóa lịch sử chăm sóc"
        message="Bạn có chắc muốn xóa bản ghi này?"
        type="danger"
        confirmText="Xóa"
        onConfirm={remove}
        onCancel={() => setConfirm({ open: false, id: null })}
      />
    </>
  );
};

export default ChargingStationCareModal;
