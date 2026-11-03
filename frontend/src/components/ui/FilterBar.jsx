const FilterBar = ({ children, className = '', title = '' }) => {
  return (
    <div className={`flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 p-4 bg-base-100 rounded-lg border border-base-300 mb-4 ${className}`}>
      {title && <span className="warehouse-filter-note text-xs font-medium text-base-content/50" title={title}>{title}</span>}
      {children}
    </div>
  );
};

export default FilterBar;
