import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import { ensureDocumentResponse } from '../../utils/proposalDocuments';
import Dialog from '../ui/Dialog';

const SignatureRepairAction = ({ proposalId, signer, onRepaired }) => {
  const { user, token } = useAuth();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const allowed = user?.role === 'SUPER_ADMIN' && signer.status === 'SIGNED' && !!signer.signature_id;

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    setStatus(null);
    setError('');
    proposalSignatureService.signatureRepairStatus(proposalId, signer.id, token)
      .then(response => {
        ensureDocumentResponse(response);
        if (!cancelled) setStatus(response.data);
      })
      .catch(cause => { if (!cancelled) setError(cause.message || 'Không kiểm tra được ảnh chữ ký'); });
    return () => { cancelled = true; };
  }, [allowed, proposalId, signer.id, token]);

  if (!allowed) return null;
  const close = () => { if (!saving) setOpen(false); };
  const repair = async () => {
    if (saving) return;
    if (!reason.trim()) { setError('Vui lòng nhập lý do phục hồi'); return; }
    setSaving(true);
    setError('');
    try {
      const response = await proposalSignatureService.repairSignature(proposalId, signer.id, reason.trim(), token);
      ensureDocumentResponse(response);
      setStatus({ can_repair: false, repaired_at: new Date().toISOString() });
      setOpen(false);
      await onRepaired();
    } catch (cause) {
      setError(cause.message || 'Không phục hồi được ảnh chữ ký');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-1">
      {status?.can_repair && <button type="button" className="btn btn-warning btn-xs"
        onClick={() => { setReason(''); setError(''); setOpen(true); }}>
        Lấy chữ ký mới nhất
      </button>}
      {status?.repaired_at && <p className="text-xs text-warning">
        Ảnh phục hồi từ chữ ký mới: {new Date(status.repaired_at).toLocaleString('vi-VN')}. Ngày ký gốc giữ nguyên.
      </p>}
      {error && !open && <p role="alert" className="text-xs text-error">{error}</p>}
      <Dialog isOpen={open} onClose={close} title="Phục hồi ảnh chữ ký bị mất" portal size="sm">
        <p className="text-sm mb-3">
          Lấy chữ ký hồ sơ mới nhất của {signer.full_name} cho ô ký này trên tài liệu đang chọn.
          Đây là ảnh thay thế, không phải ảnh tại thời điểm ký gốc. Ngày ký và trạng thái ký được giữ nguyên.
          Thao tác được ghi nhật ký và không ghi đè bản chụp đã có.
        </p>
        <label className="form-control">
          <span className="label-text">Lý do phục hồi / xác nhận đã được phép thay ảnh</span>
          <textarea aria-label="Lý do phục hồi chữ ký" className="textarea textarea-bordered w-full"
            value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} disabled={saving} />
        </label>
        {error && <p role="alert" className="text-sm text-error mt-2">{error}</p>}
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={saving}>Hủy</button>
          <button type="button" className="btn btn-warning" onClick={repair} disabled={saving || !reason.trim()}>
            {saving ? 'Đang phục hồi…' : 'Xác nhận phục hồi'}
          </button>
        </div>
      </Dialog>
    </div>
  );
};

export default SignatureRepairAction;
