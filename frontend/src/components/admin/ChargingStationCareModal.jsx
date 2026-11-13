import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api, chargingStationCareService } from '../../services/api';
import { Button, ConfirmDialog, DataTable, Dialog, Input, Loading } from '../ui';

const nowLocal = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).replace(' ', 'T').slice(0, 16);
const ChargingStationCareModal = ({ open, stationId, stationCode, token, onClose, onToast }) => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [rights, setRights] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [profile, setProfile] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await chargingStationCareService.list(stationId, token);
      setLogs((response.data || []).map((row, index) => ({ ...row, stt: index + 1 })));
      setRights(response.permissions || {});
    } catch (cause) {
      setError(cause.message || 'Không tải được tiến độ');
      setRights({});
    } finally { setLoading(false); }
  }, [stationId, token]);
  useEffect(() => { if (open) { setForm(null); load(); } }, [open, load]);
  const save = async () => {
    if (busy || !form?.content.trim() || !form.contact_time) return;
    setBusy(true);
    setError('');
    try {
      const data = { content: form.content.trim(), contact_time: form.contact_time };
      if (form.id) await chargingStationCareService.update(form.id, data, token);
      else await chargingStationCareService.create(stationId, data, token);
      setForm(null);
      onToast?.('Đã lưu tiến độ ON trạm', 'success');
      await load();
    } catch (cause) { setError(cause.message || 'Không lưu được tiến độ'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await chargingStationCareService.remove(deleteId, token);
      setDeleteId(null);
      onToast?.('Đã xóa dòng tiến độ', 'success');
      await load();
    } catch (cause) { setError(cause.message || 'Không xóa được tiến độ'); setDeleteId(null); }
    finally { setBusy(false); }
  };
  const showUpdater = async (row) => {
    try {
      const response = await api.getWithAuth(`/admin/charging-stations/care-logs/${row.id}/updater`, token);
      setProfile(response.data);
    } catch (cause) { setError(cause.message || 'Không tải được hồ sơ người cập nhật'); }
  };
  return <>
    <Dialog isOpen={open} onClose={() => { if (!busy) onClose(); }}
      title={`Cập nhật tiến độ — ${stationCode || `#${stationId}`}`} size="full">
      <div className="space-y-4">
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {rights.create && !form && <Button onClick={() => setForm({ contact_time: nowLocal(), content: '' })}>Thêm dòng</Button>}
        {form && <div className="space-y-3 rounded-lg border border-base-300 p-4">
          <p className="text-sm">Người cập nhật: {form.id ? form.updater_name || 'Không còn thông tin tài khoản' : user?.full_name}</p>
          <Input type="datetime-local" label="Thời gian cập nhật" aria-label="Thời gian cập nhật" required
            value={form.contact_time} disabled={busy} onChange={event => setForm({ ...form, contact_time: event.target.value })} />
          <label className="block text-sm font-medium">Nội dung chăm sóc *
            <textarea aria-label="Nội dung chăm sóc" className="textarea textarea-bordered mt-2 w-full" rows={3}
              value={form.content} disabled={busy} onChange={event => setForm({ ...form, content: event.target.value })} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setForm(null)}>Hủy</Button>
            <Button loading={busy} disabled={busy || !form.contact_time || !form.content.trim()} onClick={save}>Lưu</Button>
          </div>
        </div>}
        {loading ? <Loading message="Đang tải tiến độ..." /> : <DataTable data={logs} columns={[
          { key: 'updater_name', label: 'Người cập nhật', render: (value, row) => row.created_by
            ? <button className="link link-primary underline" onClick={() => showUpdater(row)}>{value || `Tài khoản #${row.created_by}`}</button>
            : <span>Không còn thông tin tài khoản</span> },
          { key: 'contact_time', label: 'Thời gian cập nhật', render: value => value ? String(value).replace('T', ' ') : '—' },
          { key: 'content', label: 'Nội dung chăm sóc', render: value => <span className="whitespace-pre-wrap break-words">{value}</span> }
        ]} emptyMessage="Chưa có cập nhật tiến độ"
          actions={rights.manage ? row => <div className="flex gap-2">
            <Button size="xs" disabled={busy} onClick={() => setForm({ ...row, contact_time: row.contact_time?.slice(0, 16) || nowLocal() })}>Sửa</Button>
            <Button size="xs" variant="outline-error" disabled={busy} onClick={() => setDeleteId(row.id)}>Xóa</Button>
          </div> : undefined} />}
      </div>
    </Dialog>
    <ConfirmDialog isOpen={!!deleteId} title="Xóa dòng tiến độ" message="Bạn có chắc muốn xóa dòng tiến độ này?"
      type="danger" confirmText="Xóa" onConfirm={() => { if (!busy) remove(); }} onCancel={() => { if (!busy) setDeleteId(null); }} />
    <Dialog isOpen={!!profile} title="Thông tin người cập nhật" onClose={() => setProfile(null)} size="sm">
      {profile && <dl className="space-y-2 text-sm">
        <div><dt className="font-medium">Họ tên</dt><dd>{profile.full_name}</dd></div>
        <div><dt className="font-medium">Vai trò</dt><dd>{profile.role}</dd></div>
        <div><dt className="font-medium">Phòng ban</dt><dd>{profile.department || '—'}</dd></div>
        <div><dt className="font-medium">Chức vụ</dt><dd>{profile.chuc_vu || '—'}</dd></div>
      </dl>}
    </Dialog>
  </>;
};
export default ChargingStationCareModal;
