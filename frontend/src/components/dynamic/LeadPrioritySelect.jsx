import { useId, useRef, useState } from 'react';

const PRIORITY_DESCRIPTIONS = {
  'ƯT1': 'Đây là định nghĩa của Ưu tiên 1',
  'ƯT2': 'Đây là định nghĩa của Ưu tiên 2',
  'ƯT3': 'Đây là định nghĩa của Ưu tiên 3',
  'ƯT4': 'Đây là định nghĩa của Ưu tiên 4',
};

const LeadPrioritySelect = ({ options, value, onChange, disabled, className, style }) => {
  const menuId = useId();
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [active, setActive] = useState('');
  const choices = [{ value: '', label: '-- Chọn --' }, ...options.map((option) => (
    typeof option === 'object'
      ? { value: option.value ?? option.label, label: option.label ?? option.value }
      : { value: option, label: option }
  ))];
  const selected = choices.find((option) => option.value === value);
  const description = PRIORITY_DESCRIPTIONS[active];

  if (!HTMLElement.prototype.showPopover) {
    return (
      <select aria-label="GĐKV phân loại KH" className={className} style={style} value={value}
        disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {choices.map((option) => (
          <option key={option.value} value={option.value} title={PRIORITY_DESCRIPTIONS[option.value]}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const openMenu = () => {
    const menu = menuRef.current;
    if (menu.matches(':popover-open')) {
      menu.hidePopover();
      return;
    }
    const anchor = triggerRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(240, anchor.width), window.innerWidth - 16);
    const spaceBelow = window.innerHeight - anchor.bottom - 12;
    const spaceAbove = anchor.top - 12;
    const below = spaceBelow >= 260 || spaceBelow >= spaceAbove;
    Object.assign(menu.style, {
      left: `${Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)}px`,
      width: `${width}px`,
      top: below ? `${anchor.bottom + 4}px` : 'auto',
      bottom: below ? 'auto' : `${window.innerHeight - anchor.top + 4}px`,
      maxHeight: `${Math.min(260, below ? spaceBelow : spaceAbove)}px`,
    });
    menu.showPopover();
    const buttons = menu.querySelectorAll('button');
    (buttons[choices.indexOf(selected)] || buttons[0]).focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        style={{ ...style, textAlign: 'left' }}
        disabled={disabled}
        aria-label={`GĐKV phân loại KH: ${selected?.label || value || '-- Chọn --'}`}
        popovertarget={menuId}
        onClick={(event) => {
          event.preventDefault();
          openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        {selected?.label || value || '-- Chọn --'} <span aria-hidden="true">▾</span>
      </button>
      <div
        id={menuId}
        ref={menuRef}
        popover="auto"
        className="fixed m-0 overflow-auto rounded-md border border-gray-300 bg-white p-1 text-gray-900 shadow-lg"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
          const index = buttons.indexOf(document.activeElement);
          const next = index + (event.key === 'ArrowDown' ? 1 : -1);
          buttons[Math.max(0, Math.min(next, buttons.length - 1))]?.focus();
        }}
      >
        {choices.map((option, index) => {
          const optionDescription = PRIORITY_DESCRIPTIONS[option.value];
          return (
            <button
              key={option.value}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100 focus:bg-gray-100"
              aria-label={option.label}
              aria-pressed={option.value === value}
              aria-describedby={optionDescription ? `${menuId}-description-${index}` : undefined}
              onMouseEnter={() => setActive(option.value)}
              onFocus={() => setActive(option.value)}
              onClick={() => {
                menuRef.current.hidePopover();
                triggerRef.current.focus();
                onChange(option.value);
              }}
            >
              {option.label}
              {optionDescription && (
                <span id={`${menuId}-description-${index}`} className="sr-only [@media(hover:none)]:not-sr-only [@media(hover:none)]:block text-xs text-gray-600">
                  {optionDescription}
                </span>
              )}
            </button>
          );
        })}
        <div className="sticky bottom-0 min-h-8 bg-white p-2 text-xs text-gray-700 [@media(hover:none)]:hidden">
          {description && <span role="tooltip">{description}</span>}
        </div>
      </div>
    </>
  );
};

export default LeadPrioritySelect;
