const ErrorMessage = ({ message, onRetry = null }) => {
  if (!message) return null;

  return (
    <div className="error-alert">
      <div className="error-icon">❌</div>
      <div className="error-content">
        <p className="error-text">{message}</p>
        {onRetry && (
          <button className="btn btn-sm btn-primary" onClick={onRetry}>Thử lại</button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
