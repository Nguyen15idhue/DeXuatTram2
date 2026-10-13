import { useState, useEffect, useRef } from 'react';
import { normalizeForSearch } from '../../utils/searchText';

const SearchableMultiSelect = ({
  options = [],
  values = [],
  onChange,
  placeholder = '-- Chọn --',
  disabled = false,
  className = '',
  searchPlaceholder = 'Tìm kiếm...',
  noResultText = 'Không có kết quả',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setHighlight(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const selected = Array.isArray(values) ? values.map(String) : [];
  const term = normalizeForSearch(search.trim());
  const filtered = term
    ? (options || []).filter((o) => {
        const label = o && typeof o === 'object' ? (o.label ?? o.value ?? '') : o;
        const val = o && typeof o === 'object' ? (o.value ?? o.label ?? '') : o;
        return normalizeForSearch(label).includes(term) || normalizeForSearch(val).includes(term);
      })
    : (options || []);

  const toggle = (opt) => {
    if (!opt || opt.disabled) return;
    const v = String(opt && typeof opt === 'object' ? (opt.value ?? opt) : opt);
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    if (onChange) onChange(next);
  };

  const remove = (v) => {
    if (onChange) onChange(selected.filter((x) => x !== String(v)));
  };

  const labelOf = (v) => {
    const found = (options || []).find((o) => String(o && typeof o === 'object' ? (o.value ?? o) : o) === String(v));
    if (!found) return String(v);
    return found && typeof found === 'object' ? (found.label ?? found.value) : found;
  };

  return (
    <div className={`${className}`}>
      <div className={`relative ${className}`} ref={boxRef}>
        <div
          className="select select-bordered w-full flex items-center"
          style={{ cursor: disabled ? 'not-allowed' : 'pointer', minHeight: 32, fontSize: 12, opacity: disabled ? 0.6 : 1 }}
          onClick={() => !disabled && setOpen(!open)}
        >
          <span className={selected.length > 0 ? '' : 'text-gray-400'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.length > 0 ? `Đã chọn ${selected.length} model` : placeholder}
          </span>
          <span className="ml-auto text-[10px]">▼</span>
        </div>
        {open && (
          <div className="absolute top-full left-0 right-0 z-[100] bg-white border border-gray-300 rounded-md shadow-lg max-h-[240px] overflow-auto p-1">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setHighlight(0); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlight((i) => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlight((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  toggle(filtered[highlight]);
                }
              }}
              placeholder={searchPlaceholder}
              className="sticky top-0 z-10 w-full px-2 py-1.5 mb-1 text-[13px] bg-white border border-gray-200 rounded outline-none focus:border-blue-400"
            />
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-[13px] text-gray-400">{noResultText}</div>
            ) : (
              filtered.map((opt, idx) => {
                const v = String(opt && typeof opt === 'object' ? (opt.value ?? opt) : opt);
                const label = opt && typeof opt === 'object' ? (opt.label ?? opt.value) : opt;
                const hint = opt && typeof opt === 'object' ? opt.hint : null;
                const isSelected = selected.includes(v);
                const isHighlighted = idx === highlight;
                return (
                  <div
                    key={idx}
                    title={opt && typeof opt === 'object' ? (opt.title || '') : ''}
                    style={{
                      padding: '6px 10px',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      fontSize: 13,
                      opacity: opt.disabled ? 0.45 : 1,
                      background: isSelected ? '#e5e7eb' : (isHighlighted ? '#f3f4f6' : 'transparent')
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => toggle(opt)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <input type="checkbox" className="checkbox checkbox-xs" checked={isSelected} readOnly tabIndex={-1} />
                      <span className="min-w-0">
                        <span className="block truncate">{label}</span>
                        {hint && <span className="block text-[11px] text-gray-400 truncate">{hint}</span>}
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((v) => (
            <span key={v} className="badge badge-sm gap-1 max-w-full" title={v}>
              <span className="truncate max-w-[220px]">{labelOf(v)}</span>
              <button type="button" className="btn btn-xs btn-ghost btn-circle" style={{ width: 16, height: 16, minHeight: 16 }} onClick={() => remove(v)} disabled={disabled}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchableMultiSelect;
