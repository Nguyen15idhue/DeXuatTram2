const FormInput = ({ label, type = 'text', value, onChange, placeholder, required = false, readOnly = false, error = '' }) => {
  return (
    <div className="form-group">
      <label>{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder || ''}
        required={required}
        readOnly={readOnly}
        className={readOnly ? 'readonly' : ''}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
};

export default FormInput;
