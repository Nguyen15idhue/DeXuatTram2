import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog, Input } from '../ui';
import ChargingStationTable from './ChargingStationTable';
import ChargingStationStepHistory from './ChargingStationStepHistory';
import { buildOnRows, canOperateStation, missingOnPrerequisites, onQuantityStatus, onRowPayload,
  requestKeyForIntent } from '../../utils/chargingFulfillment';

export const ON_STATION_LABELS = { NOT: 'Chưa ON trạm', DOING: 'Đã ON một phần', DONE: 'Đã ON trạm' };
const ROW_LABELS = { NOT: 'Chưa tích hợp', DOING: 'Đang tích hợp', DONE: 'Đã tích hợp' };

const ChargingStationOnModal = ({ station, onClose, onChanged }) => {
  const { token, user } = useAuth();
  const [record, setRecord] = useState(null);
  const [rows, setRows] = useState([]);
  const [cms, setCms] = useState('');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [all, setAll] = useState(false);
  const [allDate, setAllDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const request = useRef(null);
  const beforeAll = useRef(null);
  useEffect(() => {
    let active = true;
    Promise.all([chargingStationService.getDetail(station.id, token), chargingStationService.getDeployments(station.id, token)])
      .then(([detail, deployments]) => {
        if (!active) return;
        if (!detail.success || !deployments.success) throw new Error(detail.message || deployments.message || 'Không tải được các phần trụ');
        setRecord(detail.data);
        setCms(detail.data.cms_station_code || '');
        setRows(buildOnRows(detail.data.fulfillment || {}, deployments.data));
      }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [station.id, token]);
  const canEdit = record && record.status !== 'CANCELLED' && !record.workflow_override?.completed
    && canOperateStation(user, record, 'setup');
  const changed = rows.filter(row => Number(row.value) !== row.initialQuantity || row.value === '');
  const decreasing = changed.some(row => Number(row.value) < row.initialQuantity);
  const increasing = changed.some(row => Number(row.value) > row.initialQuantity);
  const missing = record ? missingOnPrerequisites(record) : [];
  const needsRisk = increasing && missing.length > 0;
  const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
  const committed = Number(record?.fulfillment?.totals?.committed || 0);
  const patch = (id, values) => setRows(current => current.map(row => row.id === id ? { ...row, ...values } : row));
  const confirmAll = checked => {
    setAll(checked);
    setAllDate('');
    if (checked) {
      beforeAll.current = rows;
      setRows(current => current.map(row => ({ ...row, value: row.maximum,
        date: row.maximum !== row.initialQuantity ? '' : row.firstDate })));
    } else if (beforeAll.current) setRows(beforeAll.current);
  };
  const changeAllDate = date => {
    setAllDate(date);
    setRows(current => current.map(row => Number(row.value) !== row.initialQuantity ? { ...row, date } : row));
  };
  const save = async event => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const items = rows.flatMap(onRowPayload);
      if (!items.length) throw new Error('Chưa thay đổi số lượng ON');
      if (!cms.trim()) throw new Error('Nhập mã trạm trên CMS');
      if (decreasing && !reason.trim()) throw new Error('Bắt buộc nhập lý do giảm số lượng ON');
      if (needsRisk && (!acknowledged || !reason.trim())) throw new Error('Thiếu điều kiện: cần nhập lý do và xác nhận rủi ro');
      const payload = { items, cms_station_code: cms.trim(), reason: reason.trim() || null, accept_missing: acknowledged };
      request.current = requestKeyForIntent(request.current, payload);
      const response = await chargingStationService.updateOnStation(station.id, { ...payload, request_id: request.current.request_id }, token);
      if (!response.success) throw new Error(response.message || 'Không cập nhật ON được');
      await onChanged?.();
      onClose();
    } catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Dialog isOpen title="Cập nhật ON trạm" size="2xl" portal onClose={() => !busy && onClose()}>
    <form onSubmit={save} className="space-y-4">
      {loading && <span className="loading loading-spinner" />}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {record && <>
        {record.fulfillment?.needs_review && <div role="alert" className="alert alert-warning">
          Dữ liệu trụ cần đối soát. {record.fulfillment.review_message || 'Cần kiểm tra bảng trụ chốt và các phiếu giao cũ.'}
        </div>}
        <Input label="Mã trạm trên CMS" required maxLength={100} readOnly={!!record.cms_station_code}
          disabled={busy || !canEdit} value={cms} onChange={event => setCms(event.target.value)} />
        <label className="flex items-center gap-2"><input type="checkbox" className="checkbox checkbox-sm"
          checked={all} disabled={!canEdit || busy || !rows.some(row => row.maximum > row.initialQuantity)}
          onChange={event => confirmAll(event.target.checked)} /> Xác nhận đã tích hợp ON tất cả</label>
        {all && <Input type="date" label="Ngày ON cho tất cả" aria-label="Ngày ON cho tất cả" required
          value={allDate} disabled={busy || !canEdit} onChange={event => changeAllDate(event.target.value)} />}
        <p className="text-sm">Tổng trụ đã ON / trụ chốt: <strong>{total} / {committed}</strong></p>
        <p className="text-xs text-base-content/60">Xác nhận tất cả chỉ áp dụng các phần đã lắp xong, không đóng task của trụ còn thiếu.
          Ngày trên dòng và ngày ON chung giữ lần đầu; các đợt sau lưu trong lịch sử.
          {record.on_date && ` Ngày ON chung: ${record.on_date}.`}</p>
        {record.workflow_override?.completed && <div className="alert alert-info">Hoàn tất bằng ghi đè. Điều chỉnh tại Thông tin chung; không tự tạo số liệu giao/ON trụ.</div>}
      </>}
      <ChargingStationTable frozenColumns={0} data={rows} loading={loading} emptyMessage="Chưa có đơn giao trụ."
        columns={[
          { key: 'pole_name', label: 'Loại trụ', render: (value, row) => <div>{value}<p className="text-xs text-base-content/60">
            {row.supplier_name || '—'} · Đơn giao #{row.export_id || '—'}</p></div> },
          { key: 'value', label: 'Số lượng ON / Tổng số trụ', render: (value, row) => <div className="flex items-center gap-2">
            <input aria-label={`Số lượng ON ${row.id}`} className="input input-bordered input-sm w-20" type="number"
              min={row.minimum} max={row.maximum} step={1} required value={value}
              disabled={!canEdit || busy || row.maximum === row.minimum}
              onChange={event => {
                setAll(false);
                patch(row.id, { value: event.target.value === '' ? '' : Number(event.target.value),
                  date: Number(event.target.value) === row.initialQuantity ? row.firstDate : '' });
              }} />
            <span>/ {row.quantity}</span>
          </div> },
          { key: 'status', label: 'Trạng thái', render: (_, row) => <div>
            <span className={`badge badge-sm ${Number(row.value) === 0 ? 'badge-ghost' : Number(row.value) < row.quantity ? 'badge-info' : 'badge-success'}`}>
              {ROW_LABELS[onQuantityStatus(Number(row.value), row.quantity)]}</span>
            {row.maximum < row.quantity && <p className="text-xs text-warning">Còn trụ chưa giao/lắp xong hoặc đang hoàn hàng</p>}
          </div> },
          { key: 'date', label: 'Ngày ON', render: (value, row) => <input type="date"
            aria-label={`Ngày ON ${row.id}`} className="input input-bordered input-sm" value={value}
            required={Number(row.value) !== row.initialQuantity}
            disabled={!canEdit || busy || all || Number(row.value) === row.initialQuantity}
            onChange={event => patch(row.id, { date: event.target.value })} /> }
        ]} />
      {canEdit && <label className="block text-sm">{decreasing ? 'Lý do giảm số lượng ON *' : needsRisk ? 'Lý do ON khi thiếu điều kiện *' : 'Lý do / Ghi chú'}
        <textarea aria-label="Lý do / Ghi chú ON" className="textarea textarea-bordered mt-1 w-full" maxLength={5000}
          required={decreasing || needsRisk} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} />
      </label>}
      {canEdit && missing.length > 0 && <div className="rounded-lg border border-warning p-3 space-y-3">
        <p className="text-warning">Chưa hoàn thành: {missing.join(', ')}. Các công việc còn thiếu vẫn phải thực hiện.</p>
        <label className="flex items-center gap-2"><input type="checkbox" className="checkbox checkbox-sm" checked={acknowledged}
          disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /> Tôi xác nhận chấp nhận và chịu trách nhiệm</label>
      </div>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button>
        {canEdit && <Button type="submit" loading={busy} disabled={busy || loading || !changed.length}>Lưu</Button>}
      </div>
    </form>
    <ChargingStationStepHistory stationId={station.id} step="on-tram" />
  </Dialog>;
};

export default ChargingStationOnModal;
