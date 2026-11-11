import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

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
  portal = false,
}) => {
  if (!isOpen) return null;

  const sizeClass = sizes[size] || sizes.md;

  const modal = (
    <div
      className="modal modal-open"
      style={portal ? { zIndex: 1000 } : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onClose?.();
      }}
    >
      <div
        className={`modal-box ${sizeClass} ${className}`}
        style={portal ? { maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">{title}</h3>
            <button type="button" aria-label="Đóng" className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
      <div className="modal-backdrop bg-black/50" />
    </div>
  );

  return portal ? createPortal(modal, document.body) : modal;
};

export default Dialog;
