import { ChevronLeft, ChevronRight } from 'lucide-react';

const Pagination = ({ page, totalPages, total, onPageChange }) => {
  if (total === 0 || totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <button
        className="btn btn-sm btn-outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft size={16} />
        Trước
      </button>
      <span className="text-sm text-base-content/70 px-2">
        Trang {page} / {totalPages} (Tổng: {total})
      </span>
      <button
        className="btn btn-sm btn-outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Sau
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

export default Pagination;
