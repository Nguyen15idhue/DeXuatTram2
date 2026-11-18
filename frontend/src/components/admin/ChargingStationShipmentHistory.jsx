import { useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog } from '../ui';
import ChargingStationTable from './ChargingStationTable';
import ChargingStationStepHistory from './ChargingStationStepHistory';
import { formatDeploymentScale, requestKeyForIntent, shipmentNextStatuses, SHIPMENT_STATUS_LABELS } from '../../utils/chargingFulfillment';

const ChargingStationShipmentHistory = ({ station, shipments, canEdit, onChanged, inlineEditor = false, onBusyChange }) => {
  const { token, user } = useAuth();
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const request = useRef(null);
  const reasonRequired = user?.role === 'SUPER_ADMIN' || ['FAILED', 'RETURN_PENDING', 'RETURNED'].includes(status);
  const begin = row => {
    setSelected(row);
    setStatus(row.transport_status === 'PENDING' ? 'SHIPPING' : row.transport_status);
    setNote('');
    setError('');
    request.current = null;
  };
  const save = async event => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      if (!shipmentNextStatuses(selected.transport_status).includes(status)) throw new Error('Chọn trạng thái tiếp theo hợp lệ');
      if (reasonRequired && note.trim().length < 3) throw new Error('Lý do bắt buộc từ 3–5000 ký tự');
      const payload = { status, expected_status: selected.transport_status, reason: note.trim() || null };
      request.current = requestKeyForIntent(request.current, payload);
      const response = await chargingStationService.updateShipmentStatus(station.id, selected.id,
        { ...payload, request_id: request.current.request_id }, token);
      if (!response.success) throw new Error(response.message || 'Không cập nhật được đơn vận chuyển');
      await onChanged();
      setSelected(null);
    } catch (failure) { setError(failure.message); }
    finally { saving.current = false; setBusy(false); onBusyChange?.(false); }
  };
  const editor = selected && <>
      <form className="space-y-4" onSubmit={save}>
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <p>Phiếu giao #{selected.id} · {SHIPMENT_STATUS_LABELS[selected.transport_status]}</p>
        <p>{formatDeploymentScale(selected.items || [])}</p>
        <label className="block text-sm">Trạng thái vận chuyển
          <select aria-label="Trạng thái vận chuyển" className="select select-bordered mt-1 w-full" value={status}
            disabled={busy || !canEdit} onChange={event => setStatus(event.target.value)}>
            {['NOT_SHIPPED', 'SHIPPING', 'DELIVERED', 'FAILED', 'RETURN_PENDING', 'RETURNED'].map(value =>
              <option key={value} value={value}
                disabled={!shipmentNextStatuses(selected.transport_status).includes(value)}>
                {value === 'NOT_SHIPPED' ? 'Chưa giao (chỉ khi chưa có phiếu xuất)' : SHIPMENT_STATUS_LABELS[value]}
              </option>)}
          </select>
        </label>
        <label className="block text-sm">Lý do / Ghi chú{reasonRequired ? ' *' : ''}
          <textarea aria-label="Lý do / Ghi chú" className="textarea textarea-bordered mt-1 w-full" value={note}
            disabled={!canEdit || busy} maxLength={5000} required={reasonRequired}
            onChange={event => setNote(event.target.value)} />
        </label>
        <p className="text-sm text-base-content/60">Chỉ cập nhật phiếu đang chọn. Không được lùi phiếu đã xuất về Chưa giao hoặc lùi trạng thái giao nhận.
          Đơn đã nhận chỉ được hoàn nếu toàn bộ trụ chưa bắt đầu lắp. Xác nhận Đã hoàn mới cộng lại kho; phiếu miễn tồn kho vẫn giữ miễn tồn kho.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setSelected(null)}>Hủy</Button>
          {canEdit && <Button type="submit" loading={busy} disabled={busy || !shipmentNextStatuses(selected.transport_status).includes(status)}>Lưu</Button>}
        </div>
      </form>
      <ChargingStationStepHistory stationId={station.id} step="giao-tru" />
    </>;
  return <>
    {inlineEditor ? <>
      <label className="block text-sm">Phiếu giao
        <select aria-label="Phiếu giao" className="select select-bordered mt-1 w-full" value={selected?.id || ''}
          disabled={busy} onChange={event => {
            const row = (shipments || []).find(item => String(item.id) === event.target.value);
            if (row) begin(row); else setSelected(null);
          }}>
          <option value="">Chọn phiếu giao</option>
          {(shipments || []).map(row => <option key={row.id} value={row.id}>
            #{row.id} · {SHIPMENT_STATUS_LABELS[row.transport_status]} · {formatDeploymentScale(row.items || [])}
          </option>)}
        </select>
      </label>
      {!shipments?.length && <p>Chưa giao — chưa có phiếu xuất. Tạo phiếu trong modal Triển khai hoặc xác nhận nhận đủ trụ trực tiếp.</p>}
      {editor}
    </> : <>
      <ChargingStationTable frozenColumns={0} data={shipments || []} emptyMessage="Chưa có chuyến giao."
        columns={[
          { key: 'scale', label: 'Quy mô trụ giao', width: 420, render: (_, row) => formatDeploymentScale(row.items || []) },
          { key: 'quantity', label: 'SL trụ', render: (_, row) => (row.items || []).reduce((sum, item) => sum + Number(item.quantity), 0) },
          { key: 'transport_status', label: 'Trạng thái', width: 260, render: (value, row) => {
            const label = SHIPMENT_STATUS_LABELS[value] || value;
            return <button type="button" className={`badge gap-1 ${canEdit ? 'cursor-pointer' : ''} ${value === 'DELIVERED' ? 'badge-success' : value === 'RETURNED' ? 'badge-ghost' : 'badge-info'}`}
              onClick={() => begin(row)}>{label} <span aria-hidden>▾</span></button>;
          } }
        ]} />
      {selected && <Dialog isOpen portal title="Cập nhật trạng thái" size="2xl" onClose={() => !busy && setSelected(null)}>
        {editor}
      </Dialog>}
    </>}
  </>;
};

export default ChargingStationShipmentHistory;
