import { forwardRef } from 'react';

const FormInput = forwardRef(({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  readOnly = false,
  error = '',
  className = '',
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
        value={value}
        onChange={onChange}
        placeholder={placeholder || ''}
        required={required}
        readOnly={readOnly}
        className={`input input-bordered w-full ${error ? 'input-error' : ''} ${readOnly ? 'bg-base-200 cursor-not-allowed' : ''}`}
        {...props}
      />
      {error && (
        <label className="label">
          <span className="label-text-alt text-error">{error}</span>
        </label>
      )}
    </div>
  );
});

FormInput.displayName = 'FormInput';

export default FormInput;
