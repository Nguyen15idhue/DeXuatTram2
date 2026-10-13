const variants = {
  primary: 'badge-primary',
  secondary: 'badge-secondary',
  accent: 'badge-accent',
  ghost: 'badge-ghost',
  info: 'badge-info',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  neutral: 'badge-neutral',
};

const sizes = {
  xs: 'badge-xs',
  sm: 'badge-sm',
  md: '',
  lg: 'badge-lg',
};

const Badge = ({
  children,
  variant = 'neutral',
  size = 'md',
  outline = false,
  className = '',
}) => {
  const variantClass = variants[variant] || variants.neutral;
  const sizeClass = sizes[size] || '';
  const outlineClass = outline ? 'badge-outline' : '';

  return (
    <span className={`badge ${variantClass} ${sizeClass} ${outlineClass} ${className}`}>
      {children}
    </span>
  );
};

export default Badge;
