import { AlertTriangle, AlertCircle, CheckCircle, X } from 'lucide-react';

const iconMap = {
  danger: { icon: AlertTriangle, color: 'text-error' },
  warning: { icon: AlertCircle, color: 'text-warning' },
  success: { icon: CheckCircle, color: 'text-success' },
};

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  type = 'danger',
}) => {
  if (!isOpen) return null;

  const { icon: Icon, color } = iconMap[type] || iconMap.danger;

  return (
    <div className="modal modal-open" onClick={onCancel}>
      <div className="modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost btn-sm btn-circle absolute right-2 top-2" onClick={onCancel}>
          <X size={18} />
        </button>
        <div className="flex flex-col items-center text-center py-4">
          <div className={`p-3 rounded-full bg-base-200 mb-4 ${color}`}>
            <Icon size={32} />
          </div>
          <h3 className="font-bold text-lg mb-2">{title}</h3>
          <p className="text-base-content/70">{message}</p>
        </div>
        <div className="modal-action justify-center gap-3">
          <button className="btn btn-outline" onClick={onCancel}>{cancelText}</button>
          <button className={`btn btn-${type}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" />
    </div>
  );
};

export default ConfirmDialog;
