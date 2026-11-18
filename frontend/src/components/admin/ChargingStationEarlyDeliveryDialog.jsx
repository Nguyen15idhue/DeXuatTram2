import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Dialog, Input } from '../ui';

export default function ChargingStationEarlyDeliveryDialog({ station, onClose, onSaved }) {
  const { token } = useAuth();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!reason.trim()) return setError('Vui lòng nhập lý do đề xuất');
    setBusy(true);
    setError('');
    try {
      const result = await chargingStationService.requestEarlyDelivery(station.id, {
        desired_delivery_date: date, reason: reason.trim(), accept_missing: confirmed,
      }, token);
      if (!result?.success) throw new Error(result?.message || 'Không thể gửi đề xuất đi trụ sớm');
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  if (!station) return null;
  return (
    <Dialog isOpen title="Đề xuất đi trụ sớm" portal onClose={() => !busy && onClose()}>
      <form className="space-y-4" onSubmit={save}>
        <p>Trạm: <strong>{station.ma_tram || `#${station.id}`}</strong></p>
        <Input label="Ngày giao mong muốn" aria-label="Ngày giao mong muốn" type="date" required disabled={busy}
          value={date} onChange={(event) => setDate(event.target.value)} />
        <Input label="Lý do đề xuất" aria-label="Lý do đề xuất" required maxLength={5000} disabled={busy}
          value={reason} onChange={(event) => setReason(event.target.value)} />
        <div className="rounded-lg border border-warning p-3">
          <p>Chưa hoàn thành: {station.delivery_missing_items?.join(', ') || 'Điều kiện giao trụ'}.</p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" className="checkbox checkbox-sm" required disabled={busy}
              checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            Tôi xác nhận các công việc còn thiếu vẫn phải thực hiện.
          </label>
        </div>
        {error && <p role="alert" className="text-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={busy}>Gửi đề xuất</Button>
        </div>
      </form>
    </Dialog>
  );
}
