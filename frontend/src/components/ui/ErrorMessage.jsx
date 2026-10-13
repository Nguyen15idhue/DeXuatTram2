import { AlertCircle, RefreshCw } from 'lucide-react';

const ErrorMessage = ({ message, onRetry = null }) => {
  if (!message) return null;

  return (
    <div className="alert alert-error">
      <AlertCircle size={20} />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button className="btn btn-sm btn-ghost" onClick={onRetry}>
          <RefreshCw size={14} />
          Thử lại
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;
