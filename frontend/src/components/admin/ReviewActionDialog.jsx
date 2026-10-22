import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const ReviewActionDialog = ({
  isOpen,
  title,
  description,
  confirmText = 'Xác nhận',
  confirmClass = 'btn-primary',
  reasonLabel = 'Lý do',
  reasonPlaceholder = 'Nhập lý do...',
  requireReason = true,
  saving = false,
  error = '',
  onClose,
  onConfirm
}) => {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!isOpen) return null;

  const disabled = saving || (requireReason && !reason.trim());

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-lg">{title}</h3>
            {description ? <p className="text-sm text-base-content/70 mt-1">{description}</p> : null}
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
        </div>

        <label className="form-control w-full">
          <div className="label py-1">
            <span className="label-text font-medium">{reasonLabel}{requireReason ? ' *' : ''}</span>
          </div>
          <textarea
            className="textarea textarea-bordered w-full min-h-24"
            value={reason}
            placeholder={reasonPlaceholder}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
        </label>

        {error && (
          <div className="alert alert-error py-2 mt-3 text-sm">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="modal-action mt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button
            type="button"
            className={`btn ${confirmClass}`}
            onClick={() => onConfirm(reason.trim())}
            disabled={disabled}
          >
            {saving ? <span className="loading loading-spinner loading-sm" /> : null}
            {saving ? 'Đang xử lý...' : confirmText}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

export default ReviewActionDialog;
