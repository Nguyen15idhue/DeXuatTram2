import { useState, useEffect, useMemo, useRef, useLayoutEffect, forwardRef, useImperativeHandle, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { dynamicService } from '../../services/api';
import FieldRenderer from './FieldRenderer';
import useDataListMap from '../../hooks/useDataListMap';

const SERVER_FILTER_DEBOUNCE_MS = 500;

const colWidthStyle = (col) => {
  const w = Number(col.width);
  if (!w || w <= 0) return undefined;
  return { width: w, minWidth: w };
};

const DynamicTable = forwardRef(({ entity, viewId, data, onRowClick, actions, actionAfterKey = null, leadingAction = null, leadingActionTitle = 'Cập nhật thông tin', frozenColumns = null, startIndex = 0, rowDepth = null, selectedIds, onSelectionChange, onColumnFiltersChange, cellFooter = null }, ref) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [filters, setFilters] = useState({});
  const [configVersion, setConfigVersion] = useState(0);
  const [frozenN, setFrozenN] = useState(typeof frozenColumns === 'number' ? frozenColumns : 2);
  const [frozenMap, setFrozenMap] = useState(null);
  const [frozenBgs, setFrozenBgs] = useState(null);
  const frozenSigRef = useRef(null);
  const tableWrapRef = useRef(null);

  const effectiveBg = (el) => {
    let cur = el;
    while (cur && cur !== document.body) {
      const bg = getComputedStyle(cur).backgroundColor;
      if (bg && !/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(bg) && bg !== 'transparent') return bg;
      cur = cur.parentElement;
    }
    return '#ffffff';
  };
  const dataListOptions = useDataListMap(columns.map(c => c.data_list_id));
  const serverMode = typeof onColumnFiltersChange === 'function';
  const onColumnFiltersChangeRef = useRef(onColumnFiltersChange);
  onColumnFiltersChangeRef.current = onColumnFiltersChange;
  const lastPushedRef = useRef('{}');

  useImperativeHandle(ref, () => ({
    clearFilters() {
      setFilters({});
      setSortConfig({ key: null, direction: null });
      lastPushedRef.current = '{}';
      if (onColumnFiltersChangeRef.current) onColumnFiltersChangeRef.current({});
    }
  }));

  useEffect(() => {
    if (!serverMode) return undefined;
    const t = setTimeout(() => {
      const sig = JSON.stringify(filters);
      if (sig === lastPushedRef.current) return;
      lastPushedRef.current = sig;
      if (onColumnFiltersChangeRef.current) onColumnFiltersChangeRef.current(filters);
    }, SERVER_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters, serverMode]);

  useEffect(() => {
    if (viewId) loadViewConfig();
    else {
      setColumns([]);
      setLoading(false);
    }
  }, [entity, viewId, configVersion]);

  useEffect(() => {
    if (frozenColumns !== null && frozenColumns !== undefined) {
      setFrozenN(Math.max(0, Math.floor(Number(frozenColumns) || 0)));
    }
  }, [frozenColumns]);

  const loadViewConfig = async () => {
    try {
      setLoading(true);
      const res = await dynamicService.getViewConfig(entity, viewId);
      if (res.success) {
        setColumns(res.data.fields || []);
        if (frozenColumns === null || frozenColumns === undefined) {
          const fc = res.data && res.data.view ? res.data.view.frozen_columns : null;
          if (fc !== undefined && fc !== null && fc !== '') setFrozenN(Math.max(0, Math.floor(Number(fc) || 0)));
        }
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

const toDisplayValue = (val) => {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    if (typeof val.label === 'string') return val.label;
    if (val.id !== undefined && val.id !== null) return val.id;
  }
  return val;
};

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (serverMode) return data;
    const activeFilters = Object.entries(filters).filter(([, v]) => v.trim());
    if (activeFilters.length === 0) return data;

    return data.filter(row => {
      return activeFilters.every(([key, filterVal]) => {
        const val = toDisplayValue(getFieldValue(row, { key }));
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(filterVal.toLowerCase());
      });
    });
  }, [serverMode, data, filters]);

  const sortedData = useMemo(() => {
    if (!filteredData) return [];
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = toDisplayValue(getFieldValue(a, { key: sortConfig.key }));
      const bVal = toDisplayValue(getFieldValue(b, { key: sortConfig.key }));

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
  const pinAfterIdx = actionAfterKey
    ? visibleColumns.findIndex(c => (c.field_key || c.key) === actionAfterKey)
    : -1;
  const pinActions = !!(actions && pinAfterIdx >= 0);
  const hasLeading = typeof leadingAction === 'function';
  const hasSelection = Array.isArray(selectedIds) && onSelectionChange;
  const emptyColSpan = visibleColumns.length + 2 + (hasSelection ? 1 : 0) + (hasLeading ? 1 : 0);
  const frozenEff = Math.max(0, Math.floor(Number(frozenN) || 0));

  const frozenKeys = useMemo(() => {
    if (frozenEff <= 0) return [];
    const keys = [];
    if (hasSelection) keys.push('__sel');
    let budget = frozenEff;
    keys.push('__stt');
    budget -= 1;
    if (hasLeading && budget > 0) { keys.push('__lead'); budget -= 1; }
    visibleColumns.forEach((col, ci) => {
      if (budget <= 0) return;
      const key = col.field_key || col.key;
      keys.push(`__d:${key}`);
      budget -= 1;
      if (pinActions && ci === pinAfterIdx && budget > 0) { keys.push('__pin'); budget -= 1; }
    });
    return keys;
  }, [frozenEff, hasSelection, hasLeading, visibleColumns, pinActions, pinAfterIdx]);

  useLayoutEffect(() => {
    if (frozenKeys.length === 0) { setFrozenMap(null); return; }
    const measure = () => {
      const wrap = tableWrapRef.current;
      if (!wrap) return;
      const order = [];
      if (hasSelection) order.push('__sel');
      order.push('__stt');
      if (hasLeading) order.push('__lead');
      visibleColumns.forEach((col, ci) => {
        order.push(`__d:${col.field_key || col.key}`);
        if (pinActions && ci === pinAfterIdx) order.push('__pin');
      });
      order.push('__end');
      const headCount = wrap.querySelectorAll('thead tr:first-child > th').length;
      if (headCount === 0 || headCount !== order.length) return;
      const headCells = [...wrap.querySelectorAll('thead tr:first-child > th')];
      const filtCells = [...wrap.querySelectorAll('thead tr:nth-child(2) > th')];
      const measureRows = [...wrap.querySelectorAll('tbody tr')]
        .filter(r => r.children.length === order.length)
        .slice(0, 50);
      const widths = headCells.map((_, i) => {
        let w = headCells[i] ? headCells[i].getBoundingClientRect().width : 0;
        if (filtCells[i]) w = Math.max(w, filtCells[i].getBoundingClientRect().width);
        for (const r of measureRows) {
          const c = r.children[i];
          if (c) {
            const cw = c.getBoundingClientRect().width;
            if (cw > w) w = cw;
          }
        }
        return w;
      });
      const map = new Map();
      let acc = 0;
      let lastFrozen = null;
      order.forEach((k, i) => {
        if (frozenKeys.includes(k)) { map.set(k, { left: acc, last: false }); lastFrozen = k; }
        acc += widths[i] || 0;
      });
      if (lastFrozen && map.has(lastFrozen)) map.get(lastFrozen).last = true;
      const headRow = wrap.querySelector('thead tr:first-child');
      const filtRow = wrap.querySelector('thead tr:nth-child(2)');
      const bodyRows = wrap.querySelectorAll('tbody tr');
      const plainCell = (row) => (row ? row.querySelector('th:not(.dt-frozen), td:not(.dt-frozen)') : null);
      const plainHead = headRow ? headRow.querySelector('th:not(.dt-frozen)') : null;
      const plainFilt = filtRow ? filtRow.querySelector('th:not(.dt-frozen)') : null;
      const bgs = {
        head: plainHead ? effectiveBg(plainHead) : '#ffffff',
        filter: plainFilt ? effectiveBg(plainFilt) : effectiveBg(filtRow),
        row0: plainCell(bodyRows[0]) ? effectiveBg(plainCell(bodyRows[0])) : '#ffffff',
        row1: plainCell(bodyRows[1]) ? effectiveBg(plainCell(bodyRows[1])) : '#ffffff',
      };
      const sig = JSON.stringify({ cells: [...map.entries()], bgs });
      if (sig !== frozenSigRef.current) {
        frozenSigRef.current = sig;
        setFrozenMap(map);
        setFrozenBgs(bgs);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [frozenKeys, hasSelection, hasLeading, visibleColumns, pinActions, pinAfterIdx, (data || []).length]);

  const frozenCell = (key, kind, base = '', parity = 0) => {
    if (!frozenMap || !frozenMap.has(key)) return base ? { className: base } : {};
    const { left, last } = frozenMap.get(key);
    const bg = !frozenBgs
      ? undefined
      : kind === 'filter' ? frozenBgs.filter
        : kind === 'th' ? frozenBgs.head
          : (parity % 2 === 1 ? frozenBgs.row1 : frozenBgs.row0);
    return {
      className: `${base} dt-frozen ${kind === 'th' ? 'dt-frozen-head' : kind === 'filter' ? 'dt-frozen-filter' : ''}`.trim(),
      style: {
        position: 'sticky',
        left,
        zIndex: kind === 'th' ? 20 : kind === 'filter' ? 15 : 10,
        backgroundColor: bg,
        borderRight: last ? '1px solid var(--fallback-b3, #e5e7eb)' : undefined,
      },
    };
  };
  const allSelected = hasSelection && sortedData.length > 0 && sortedData.every(row => selectedIds.includes(row.id));

  const handleToggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(sortedData.map(row => row.id));
    }
  };

  const handleToggleRow = (id) => {
    if (!hasSelection) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(x => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div className="dynamic-table-container">
      <div className="overflow-x-auto" ref={tableWrapRef}>
        {loading && <div className="px-2 py-1 text-xs text-base-content/50 border-b border-base-300">Đang tải cấu hình...</div>}
        <table className="table table-zebra w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0, overflow: 'visible' }}>
          <thead>
            <tr>
              {hasSelection && (
                <th {...frozenCell('__sel', 'th', 'w-10')}>
                  <input type="checkbox" className="checkbox checkbox-sm" checked={allSelected} onChange={handleToggleAll} />
                </th>
              )}
              <th {...frozenCell('__stt', 'th', 'text-center w-12')}>STT</th>
              {hasLeading && <th {...frozenCell('__lead', 'th', 'text-center min-w-[110px] whitespace-nowrap')}>{leadingActionTitle}</th>}
              {visibleColumns.map((col, ci) => {
                const key = col.field_key || col.key;
                const sortable = col.sortable;
                const fp = frozenCell(`__d:${key}`, 'th');
                const fpPin = (pinActions && ci === pinAfterIdx) ? frozenCell('__pin', 'th') : null;
                return (
                  <Fragment key={key}>
                    <th
                      onClick={() => sortable && handleSort(key)}
                      className={`${sortable ? 'cursor-pointer select-none' : ''} ${fp.className || ''}`}
                      style={{ ...colWidthStyle(col), ...fp.style }}
                    >
                      {col.label}
                      {sortable && <span className="ml-1 text-xs">{getSortIcon(key)}</span>}
                    </th>
                    {pinActions && ci === pinAfterIdx && (
                      <th className={`text-center min-w-[120px] whitespace-nowrap ${fpPin.className || ''}`} style={fpPin.style}>Hành động</th>
                    )}
                  </Fragment>
                );
              })}
              {!pinActions && <th className="text-center min-w-[230px] whitespace-nowrap">Hành động</th>}
            </tr>
            {hasFilters && (
              <tr className="bg-base-200">
                {hasSelection && <th {...frozenCell('__sel', 'filter')}></th>}
                <th {...frozenCell('__stt', 'filter')}></th>
                {hasLeading && <th {...frozenCell('__lead', 'filter')}></th>}
                {visibleColumns.map((col, ci) => {
                  const key = col.field_key || col.key;
                  const fp = frozenCell(`__d:${key}`, 'filter');
                  const fpPin = (pinActions && ci === pinAfterIdx) ? frozenCell('__pin', 'filter') : null;
                  return (
                    <Fragment key={key}>
                      <th style={{ ...colWidthStyle(col), ...fp.style }} className={fp.className}>
                        {col.filterable ? (
                          <input
                            type="text"
                            className="input input-bordered input-xs w-full"
                            placeholder={col.type === 'user' ? 'ID, #id, tên...' : (serverMode ? 'Lọc toàn bộ...' : 'Lọc...')}
                            title={col.type === 'user' ? 'Lọc user: nhập nhiều ID cách nhau dấu phẩy (1,2), #id để khớp chính xác, hoặc tên user' : (serverMode ? 'Lọc trên toàn bộ dữ liệu' : 'Lọc trong trang hiện tại')}
                            value={filters[key] || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={(e) => handleFilterChange(key, e.target.value)}
                          />
                        ) : null}
                      </th>
                      {pinActions && ci === pinAfterIdx && <th className={fpPin.className} style={fpPin.style}></th>}
                    </Fragment>
                  );
                })}
                {!pinActions && <th></th>}
              </tr>
            )}
          </thead>
          <tbody>
            {!sortedData || sortedData.length === 0 ? (
              <tr>
                <td colSpan={emptyColSpan} className="text-center py-10 text-base-content/40">
                  Không có dữ liệu
                </td>
              </tr>
            ) : sortedData.map((row, idx) => (
              <tr key={row.id || idx} className="hover">
                {hasSelection && (
                  <td {...frozenCell('__sel', 'td', '', idx % 2)}>
                    <input type="checkbox" className="checkbox checkbox-sm" checked={selectedIds.includes(row.id)} onChange={() => handleToggleRow(row.id)} />
                  </td>
                )}
                <td {...frozenCell('__stt', 'td', 'text-center', idx % 2)}>{startIndex + idx + 1}</td>
                {hasLeading && <td {...frozenCell('__lead', 'td', 'text-center whitespace-nowrap', idx % 2)}>{leadingAction(row)}</td>}
                {visibleColumns.map((col, colIdx) => {
                  const key = col.field_key || col.key;
                  const depth = typeof rowDepth === 'function' ? (rowDepth(row) || 0) : 0;
                  const fp = frozenCell(`__d:${key}`, 'td', '', idx % 2);
                  const fpPin = (pinActions && colIdx === pinAfterIdx) ? frozenCell('__pin', 'td', '', idx % 2) : null;
                  const cell = (
                    <FieldRenderer
                      field={col}
                      value={getFieldValue(row, col)}
                      entity={entity}
                      entityId={row.id}
                      dataListOptions={dataListOptions}
                    />
                  );
                  return (
                    <Fragment key={key}>
                      <td style={{ ...colWidthStyle(col), ...fp.style }} className={fp.className}>
                        {colIdx === 0 && depth > 0 ? <div style={{ paddingLeft: depth * 24 }}>{cell}</div> : cell}
                        {typeof cellFooter === 'function' ? cellFooter(row, key) : null}
                      </td>
                      {pinActions && colIdx === pinAfterIdx && (
                        <td className={`text-center whitespace-nowrap ${fpPin.className || ''}`} style={fpPin.style}>{actions(row)}</td>
                      )}
                    </Fragment>
                  );
                })}
                {!pinActions && (
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
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default DynamicTable;
