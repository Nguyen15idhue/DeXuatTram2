const Pagination = ({ page, totalPages, total, onPageChange }) => {
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
    </div>
  );
};

export default Pagination;
