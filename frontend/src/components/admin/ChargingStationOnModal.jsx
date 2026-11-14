import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog, Input } from '../ui';
import { canOperateStation, missingOnPrerequisites, requestKeyForIntent } from '../../utils/chargingFulfillment';

export const ON_STATION_LABELS = { NOT: 'Chưa ON trạm', DOING: 'Đã ON một phần', DONE: 'Đã ON trạm' };
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const ChargingStationOnModal = ({ station, onClose, onChanged }) => {
  const { token, user } = useAuth();
  const [record, setRecord] = useState(null);
  const [rows, setRows] = useState([]);
  const [cms, setCms] = useState('');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const request = useRef(null);
  useEffect(() => {
    let active = true;
    Promise.all([chargingStationService.getDetail(station.id, token), chargingStationService.getDeployments(station.id, token)])
      .then(([detail, deployments]) => {
        if (!active) return;
        if (!detail.success || !deployments.success) throw new Error(detail.message || deployments.message || 'Không tải được các phần trụ');
        setRecord(detail.data);
        setCms(detail.data.cms_station_code || '');
        setRows(deployments.data.map(row => ({ ...row, selected: false, date: row.on_date || today(), note: row.on_note || '' })));
      }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [station.id, token]);
  const canEdit = record && record.status !== 'CANCELLED' && !record.workflow_override?.completed
    && canOperateStation(user, record, 'setup');
  const missing = record ? missingOnPrerequisites(record) : [];
  const patch = (id, values) => setRows(current => current.map(row => row.id === id ? { ...row, ...values } : row));
  const save = async event => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const items = rows.filter(row => row.selected).map(row => ({
        id: row.id, expected_version: row.workflow_version, on_date: row.date, note: row.note || null
      }));
      if (!items.length) throw new Error('Chọn ít nhất một phần trụ đã lắp xong để ON');
      if (!cms.trim() || items.some(item => !item.on_date)) throw new Error('Nhập mã trạm trên CMS và ngày ON cho từng phần được chọn');
      if (missing.length && (!acknowledged || !reason.trim())) throw new Error('Thiếu điều kiện: cần nhập lý do và xác nhận rủi ro');
      const payload = { items, cms_station_code: cms.trim(), reason: reason.trim() || null, accept_missing: acknowledged };
      request.current = requestKeyForIntent(request.current, payload);
      const response = await chargingStationService.updateOnStation(station.id, { ...payload, request_id: request.current.request_id }, token);
      if (!response.success) throw new Error(response.message || 'Không xác nhận ON được');
      await onChanged?.();
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Dialog isOpen title="Cập nhật ON trạm" size="xl" portal onClose={() => !busy && onClose()}>
    <form onSubmit={save} className="space-y-4">
      {loading && <span className="loading loading-spinner" />}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {record && <>
        <Input label="Mã trạm trên CMS" required maxLength={100} readOnly={!!record.cms_station_code}
          disabled={busy || !canEdit} value={cms} onChange={event => setCms(event.target.value)} />
        <p className="text-sm text-base-content/60">ON được thực hiện song song với nghiệm thu, không đóng việc nghiệm thu còn thiếu.
          {record.on_date ? ` Ngày ON chung giữ nguyên: ${record.on_date}.` : ' Lần đầu chọn nhiều phần: ngày ON chung lấy theo phần có ID nhỏ nhất.'}</p>
        {record.workflow_override?.completed && <div className="alert alert-info">Hoàn tất bằng ghi đè. Điều chỉnh tại Thông tin chung; không tự tạo số liệu giao/ON trụ.</div>}
      </>}
      <div className="flex flex-col gap-3 md:flex-row md:overflow-x-auto md:pb-2">
        {rows.map(row => {
          const eligible = canEdit && row.installation_status === 'DONE' && row.stage !== 'OPERATING';
          return <section key={row.id} className="w-full space-y-3 rounded-lg border border-base-300 p-3 md:w-72 md:shrink-0">
            <h3 className="font-semibold">Phiếu #{row.export_id} · Phần #{row.id}</h3>
            <p>{row.pole_name} · {row.supplier_name || '—'} · {row.quantity} trụ</p>
            {row.stage === 'OPERATING' ? <p className="text-success">Đã ON — chỉ xem</p>
              : row.installation_status !== 'DONE' ? <p className="text-warning">Chưa lắp xong — chưa được ON</p>
                : <label className="flex items-center gap-2"><input type="checkbox" className="checkbox checkbox-sm"
                  disabled={!eligible || busy} checked={row.selected}
                  onChange={event => patch(row.id, { selected: event.target.checked })} /> Xác nhận ON phần trụ</label>}
            <Input label="Ngày ON" type="date" required={row.selected} value={row.date}
              disabled={!eligible || !row.selected || busy} onChange={event => patch(row.id, { date: event.target.value })} />
            <label className="block text-sm">Ghi chú<textarea className="textarea textarea-bordered mt-1 w-full"
              maxLength={5000} value={row.note} disabled={!eligible || !row.selected || busy}
              onChange={event => patch(row.id, { note: event.target.value })} /></label>
          </section>;
        })}
      </div>
      {!loading && !rows.length && <p>Chưa có phần trụ đã nhận.</p>}
      {canEdit && missing.length > 0 && <div className="rounded-lg border border-warning p-3 space-y-3">
        <p className="text-warning">Chưa hoàn thành: {missing.join(', ')}. ON thiếu điều kiện có rủi ro; các công việc còn thiếu vẫn phải thực hiện.</p>
        <Input label="Lý do ON khi thiếu điều kiện" required maxLength={5000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} />
        <label className="flex items-center gap-2"><input type="checkbox" className="checkbox checkbox-sm" checked={acknowledged}
          disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /> Tôi xác nhận chấp nhận và chịu trách nhiệm</label>
      </div>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button>
        {canEdit && <Button type="submit" loading={busy} disabled={busy || loading || !rows.some(row => row.selected)}>Xác nhận</Button>}
      </div>
    </form>
  </Dialog>;
};

export default ChargingStationOnModal;
