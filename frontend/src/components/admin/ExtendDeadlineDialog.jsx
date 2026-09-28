import { useState } from 'react';

const ExtendDeadlineDialog = ({ isOpen, onConfirm, onCancel, saving = false, limits = null }) => {
  const [days, setDays] = useState(1);
  const [hours, setHours] = useState(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const maxDays = limits && Number.isFinite(Number(limits.maxDaysPerTime)) ? Number(limits.maxDaysPerTime) : 30;
  const remaining = limits ? limits.remaining : null;
  const outOfTurns = remaining !== null && remaining !== undefined && Number(remaining) <= 0;

  const handleConfirm = () => {
    if (outOfTurns) {
      setError('Đề xuất đã hết số lần gia hạn');
      return;
    }
    const d = Math.floor(Number(days) || 0);
    const h = Math.floor(Number(hours) || 0);
    if (d < 0 || h < 0 || d > maxDays || h > 23 || d * 1440 + h * 60 <= 0) {
      setError(`Thời gian không hợp lệ (ngày 0–${maxDays}, giờ 0–23, tổng phải lớn hơn 0)`);
      return;
    }
    if (!String(reason || '').trim()) {
      setError('Vui lòng nhập lý do gia hạn');
      return;
    }
    setError('');
    onConfirm({ days: d, hours: h, reason: String(reason).trim() });
  };

  const close = () => {
    if (saving) return;
    setError('');
    onCancel();
  };

  return (
    <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); close(); }}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="confirm-icon confirm-icon-info">◷</div>
        <h3 className="confirm-title">Gia hạn bổ sung thông tin</h3>
        <p className="confirm-message">Thời gian được cộng thêm vào hạn hiện tại. Hết hạn mới thì đề xuất mới bị hủy.</p>
        {limits && (
          <p className="confirm-message" style={{ marginTop: 4 }}>
            Tối đa {maxDays} ngày/lần
            {remaining !== null && remaining !== undefined ? ` · Còn ${remaining} lần gia hạn` : ''}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
          <label style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
            Số ngày
            <input
              type="number" min="0" max={maxDays} className="form-control"
              value={days} disabled={saving}
              onChange={(e) => setDays(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
            Số giờ
            <input
              type="number" min="0" max="23" className="form-control"
              value={hours} disabled={saving}
              onChange={(e) => setHours(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
        </div>
        <label style={{ width: '100%', fontSize: 12, fontWeight: 600, marginTop: 8 }}>
          Lý do gia hạn <span className="text-red-600">*</span>
          <textarea
            className="form-control" rows={3} disabled={saving}
            placeholder="VD: Chờ chủ đất gửi sổ đỏ..."
            value={reason} onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        {error && <div className="form-error-summary" style={{ width: '100%', marginTop: 8 }}><span className="text-sm">{error}</span></div>}
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={close} disabled={saving}>Hủy</button>
          <button className="btn btn-info" onClick={handleConfirm} disabled={saving || outOfTurns}>{saving ? 'Đang xử lý...' : 'Gia hạn'}</button>
        </div>
      </div>
    </div>
  );
};

export default ExtendDeadlineDialog;
