import { forwardRef } from 'react';

const Input = forwardRef(({
  label,
  type = 'text',
  error,
  helperText,
  className = '',
  required = false,
  disabled = false,
  readOnly = false,
  ...props
}, ref) => {
  return (
    <div className={`form-control w-full ${className}`}>
      {label && (
        <label className="label">
          <span className="label-text font-medium">
            {label}
            {required && <span className="text-error ml-1">*</span>}
          </span>
        </label>
      )}
      <input
        ref={ref}
        type={type}
        className={`input input-bordered w-full ${error ? 'input-error' : ''} ${readOnly ? 'bg-base-200 cursor-not-allowed' : ''}`}
        disabled={disabled}
        readOnly={readOnly}
        {...props}
      />
      {(error || helperText) && (
        <label className="label">
          {error && <span className="label-text-alt text-error">{error}</span>}
          {!error && helperText && <span className="label-text-alt text-base-content/60">{helperText}</span>}
        </label>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
