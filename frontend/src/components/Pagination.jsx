const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const Pagination = ({ page, totalPages, total, onPageChange, pageSize, onPageSizeChange }) => {
  if (total === 0) return null;

  return (
    <div className="pagination">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Trước
      </button>
      <span className="pagination-info">
        Trang {page} / {totalPages} (Tổng: {total})
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Sau
      </button>
      {onPageSizeChange && (
        <select
          className="pagination-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Số dòng mỗi trang"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} / trang</option>
          ))}
        </select>
      )}
    </div>
  );
};

export default Pagination;
