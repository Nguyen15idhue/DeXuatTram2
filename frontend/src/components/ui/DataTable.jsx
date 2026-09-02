import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const DataTable = ({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'Không có dữ liệu',
  sortConfig,
  onSort,
  startIndex = 0,
  actions,
  onRowClick,
  className = '',
}) => {
  const getSortIcon = (key) => {
    if (!sortConfig || sortConfig.key !== key) return <ArrowUpDown size={14} className="opacity-30" />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-lg border border-base-300 ${className}`}>
      <table className="table table-zebra w-full">
        <thead className="bg-base-200">
          <tr>
            <th className="w-12 text-center">STT</th>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.sortable ? 'cursor-pointer hover:bg-base-300 select-none' : ''}
                style={col.width ? { minWidth: col.width } : undefined}
                onClick={() => col.sortable && onSort && onSort(col.key)}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && getSortIcon(col.key)}
                </span>
              </th>
            ))}
            {actions && <th className="w-40 text-center">Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (actions ? 2 : 1)} className="text-center py-12 text-base-content/50">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={row.id || idx}
                className={onRowClick ? 'cursor-pointer hover:bg-base-200' : ''}
                onClick={() => onRowClick && onRowClick(row)}
              >
                <td className="text-center text-sm">{startIndex + idx + 1}</td>
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
                {actions && (
                  <td>
                    <div className="flex items-center justify-center gap-1">
                      {actions(row)}
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
