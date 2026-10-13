import { X } from 'lucide-react';

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

const Dialog = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = '',
}) => {
  if (!isOpen) return null;

  const sizeClass = sizes[size] || sizes.md;

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div
        className={`modal-box ${sizeClass} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">{title}</h3>
            <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
      <div className="modal-backdrop bg-black/50" />
    </div>
  );
};

export default Dialog;
