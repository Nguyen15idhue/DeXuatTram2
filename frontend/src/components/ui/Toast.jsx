import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const iconMap = {
  success: { icon: CheckCircle, alertClass: 'alert-success' },
  error: { icon: XCircle, alertClass: 'alert-error' },
  warning: { icon: AlertTriangle, alertClass: 'alert-warning' },
  info: { icon: Info, alertClass: 'alert-info' },
};

const Toast = ({ message, type = 'success', onClose, duration = 3000 }) => {
  useEffect(() => {
    if (message && duration > 0) {
      const timer = setTimeout(() => onClose(), duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!message) return null;

  const { icon: Icon, alertClass } = iconMap[type] || iconMap.success;

  return (
    <div className="toast toast-end toast-top z-50">
      <div className={`alert ${alertClass} shadow-lg`}>
        <Icon size={20} />
        <span className="flex-1 text-sm">{message}</span>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default Toast;
