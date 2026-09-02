import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  accent: 'btn-accent',
  ghost: 'btn-ghost',
  link: 'btn-link',
  error: 'btn-error',
  warning: 'btn-warning',
  info: 'btn-info',
  success: 'btn-success',
  outline: 'btn-outline',
  'outline-error': 'btn-outline btn-error',
  'outline-warning': 'btn-outline btn-warning',
};

const sizes = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) => {
  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || '';
  const loadingClass = loading ? 'btn-disabled' : '';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${loadingClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" size={16} />}
      {children}
    </button>
  );
};

export default Button;
