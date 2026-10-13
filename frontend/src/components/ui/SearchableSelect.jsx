import { useState, useEffect, useRef } from 'react';
import { normalizeForSearch } from '../../utils/searchText';

const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Chọn --',
  disabled = false,
  className = '',
  searchPlaceholder = 'Tìm kiếm...',
  emptyText = '-- Chọn --',
  noResultText = 'Không có kết quả',
  size = ''
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
  }, [open ]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setHighlight(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open ]);

  const term = normalizeForSearch(search.trim());
  const filtered = term
    ? (options || []).filter((o) => {
        if (o && typeof o === 'object' && o.isGroup) return false;
        const label = o && typeof o === 'object' ? (o.label ?? o.value ?? '') : o;
        const val = o && typeof o === 'object' ? (o.value ?? o.label ?? '') : o;
        return normalizeForSearch(label).includes(term) || normalizeForSearch(val).includes(term);
      })
    : (options || []);

  const pick = (opt) => {
    if (!opt || opt.disabled || opt.isGroup) return;
    const v = opt && typeof opt === 'object' ? (opt.value ?? opt) : opt;
    if (onChange) onChange(v);
    setOpen(false);
  };

  const selected = (options || []).find((o) => {
    const v = o && typeof o === 'object' ? (o.value ?? o) : o;
    return String(v) === String(value);
  });
  const selectedLabel = selected
    ? (selected && typeof selected === 'object' ? (selected.label ?? selected.value) : selected)
    : null;

  return (
    <div className={`relative ${className}`} ref={boxRef}>
      <div
        className="select select-bordered w-full flex items-center"
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          minHeight: size === 'sm' ? 32 : 36,
          fontSize: size === 'sm' ? 12 : undefined,
          opacity: disabled ? 0.6 : 1
        }}
        onClick={() => !disabled && setOpen(!open)}
      >
        <span className={selectedLabel ? '' : 'text-gray-400'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel || placeholder}
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
                pick(filtered[highlight]);
              }
            }}
            placeholder={searchPlaceholder}
            className="sticky top-0 z-10 w-full px-2 py-1.5 mb-1 text-[13px] bg-white border border-gray-200 rounded outline-none focus:border-blue-400"
          />
          <div
            className="px-2.5 py-1.5 cursor-pointer text-[13px] text-gray-400"
            onClick={() => { if (onChange) onChange(''); setOpen(false); }}
          >
            {emptyText}
          </div>
          {filtered.length === 0 ? (
            <div className="px-2.5 py-2 text-[13px] text-gray-400">{noResultText}</div>
          ) : (
            filtered.map((opt, idx) => {
              if (opt && typeof opt === 'object' && opt.isGroup) {
                return (
                  <div
                    key={`g-${idx}`}
                    style={{ padding: '6px 10px 2px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 }}
                  >
                    {opt.label}
                  </div>
                );
              }
              const v = opt && typeof opt === 'object' ? (opt.value ?? opt) : opt;
              const label = opt && typeof opt === 'object' ? (opt.label ?? opt.value) : opt;
              const isSelected = String(v) === String(value);
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
                  onClick={() => pick(opt)}
                >
                  {label}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
