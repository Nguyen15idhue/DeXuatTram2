import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import { dynamicService } from '../../services/api';
import FieldRenderer from './FieldRenderer';
import useDataListMap from '../../hooks/useDataListMap';

const DynamicTable = forwardRef(({ entity, viewId, data, onRowClick, actions, startIndex = 0 }, ref) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [filters, setFilters] = useState({});
  const [configVersion, setConfigVersion] = useState(0);
  const dataListOptions = useDataListMap(columns.map(c => c.data_list_id));

  useImperativeHandle(ref, () => ({
    clearFilters() {
      setFilters({});
      setSortConfig({ key: null, direction: null });
    }
  }));

  useEffect(() => {
    if (viewId) loadViewConfig();
  }, [entity, viewId, configVersion]);

  const loadViewConfig = async () => {
    try {
      setLoading(true);
      const res = await dynamicService.getViewConfig(entity, viewId);
      if (res.success) {
        setColumns(res.data.fields || []);
      }
    } catch {
      setError('Lỗi tải cấu hình view');
    } finally {
      setLoading(false);
    }
  };

  const getFieldValue = (row, field) => {
    if (row[field.key] !== undefined && row[field.key] !== null) return row[field.key];
    if (row.custom_data) {
      try {
        const cd = typeof row.custom_data === 'string' ? JSON.parse(row.custom_data) : row.custom_data;
        return cd[field.key];
      } catch { return null; }
    }
    return null;
  };

  const filteredData = useMemo(() => {
    if (!data) return [];
    const activeFilters = Object.entries(filters).filter(([, v]) => v.trim());
    if (activeFilters.length === 0) return data;

    return data.filter(row => {
      return activeFilters.every(([key, filterVal]) => {
        const val = getFieldValue(row, { key });
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(filterVal.toLowerCase());
      });
    });
  }, [data, filters]);

  const sortedData = useMemo(() => {
    if (!filteredData) return [];
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = getFieldValue(a, { key: sortConfig.key });
      const bVal = getFieldValue(b, { key: sortConfig.key });

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal), 'vi');
      }

      return sortConfig.direction === 'desc' ? -comparison : comparison;
    });
  }, [filteredData, sortConfig]);

  const handleSort = (fieldKey) => {
    setSortConfig(prev => {
      if (prev.key === fieldKey) {
        if (prev.direction === 'asc') return { key: fieldKey, direction: 'desc' };
        if (prev.direction === 'desc') return { key: null, direction: null };
      }
      return { key: fieldKey, direction: 'asc' };
    });
  };

  const getSortIcon = (fieldKey) => {
    if (sortConfig.key !== fieldKey) return '↕';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const handleFilterChange = (fieldKey, value) => {
    setFilters(prev => ({ ...prev, [fieldKey]: value }));
  };

  const handleViewClick = (row) => {
    const entityPath = entity === 'station_proposals' ? 'proposals' : entity;
    navigate(`/admin/${entityPath}/view=${row.id}`);
  };

  const handleEditClick = (row) => {
    const entityPath = entity === 'station_proposals' ? 'proposals' : entity;
    navigate(`/admin/${entityPath}/edit=${row.id}`);
  };

  if (error) return <div className="alert alert-error"><span>{error}</span></div>;
  if (columns.length === 0 && !loading) return <div className="text-center py-8 text-base-content/40">Chưa có cột nào được cấu hình</div>;

  const visibleColumns = columns.filter(c => c.visible);
  const hasFilters = visibleColumns.some(c => c.filterable);

  return (
    <div className="dynamic-table-container">
      <div className="overflow-x-auto">
        {loading && <div className="px-2 py-1 text-xs text-base-content/50 border-b border-base-300">Đang tải cấu hình...</div>}
        <table className="table table-zebra w-full text-sm">
          <thead>
            <tr>
              <th className="text-center w-12">STT</th>
              {visibleColumns.map(col => {
                const key = col.field_key || col.key;
                const sortable = col.sortable;
                return (
                  <th
                    key={key}
                    onClick={() => sortable && handleSort(key)}
                    className={sortable ? 'cursor-pointer select-none' : ''}
                  >
                    {col.label}
                    {sortable && <span className="ml-1 text-xs">{getSortIcon(key)}</span>}
                  </th>
                );
              })}
              <th className="text-center min-w-[200px]">Thao tác</th>
            </tr>
            {hasFilters && (
              <tr className="bg-base-200">
                <th></th>
                {visibleColumns.map(col => {
                  const key = col.field_key || col.key;
                  return (
                    <th key={key}>
                      {col.filterable ? (
                        <input
                          type="text"
                          className="input input-bordered input-xs w-full"
                          placeholder="Lọc..."
                          value={filters[key] || ''}
                          onClick={e => e.stopPropagation()}
                          onChange={(e) => handleFilterChange(key, e.target.value)}
                        />
                      ) : null}
                    </th>
                  );
                })}
                <th></th>
              </tr>
            )}
          </thead>
          <tbody>
            {!sortedData || sortedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2} className="text-center py-10 text-base-content/40">
                  Không có dữ liệu
                </td>
              </tr>
            ) : sortedData.map((row, idx) => (
              <tr key={row.id || idx} className="hover">
                <td className="text-center">{startIndex + idx + 1}</td>
                {visibleColumns.map(col => {
                  const key = col.field_key || col.key;
                  return (
                    <td key={key}>
                      <FieldRenderer
                        field={col}
                        value={getFieldValue(row, col)}
                        entity={entity}
                        entityId={row.id}
                        dataListOptions={dataListOptions}
                      />
                    </td>
                  );
                })}
                <td>
                  {actions ? (
                    actions(row)
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      <button className="btn btn-primary btn-xs" onClick={() => handleViewClick(row)}>Xem</button>
                      {onRowClick && (
                        <button className="btn btn-warning btn-xs" onClick={() => handleEditClick(row)}>Sửa</button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default DynamicTable;
