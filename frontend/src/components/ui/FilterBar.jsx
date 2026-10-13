const FilterBar = ({ children, className = '' }) => {
  return (
    <div className={`flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 p-4 bg-base-100 rounded-lg border border-base-300 mb-4 ${className}`}>
      {children}
    </div>
  );
};

export default FilterBar;
