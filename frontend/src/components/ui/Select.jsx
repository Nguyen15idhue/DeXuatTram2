import { forwardRef } from 'react';

const Select = forwardRef(({
  label,
  options = [],
  value,
  onChange,
  placeholder = 'Chọn...',
  error,
  helperText,
  className = '',
  required = false,
  disabled = false,
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
      <select
        ref={ref}
        value={value}
        onChange={onChange}
        className={`select select-bordered w-full ${error ? 'select-error' : ''}`}
        disabled={disabled}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {(error || helperText) && (
        <label className="label">
          {error && <span className="label-text-alt text-error">{error}</span>}
          {!error && helperText && <span className="label-text-alt text-base-content/60">{helperText}</span>}
        </label>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;
