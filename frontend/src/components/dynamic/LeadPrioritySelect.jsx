import { useId, useLayoutEffect, useRef, useState } from "react";

const PRIORITY_DESCRIPTIONS = {
  "1. Có sẵn hạ tầng triển khai được ngay":
    "Khách hàng có mặt bằng, nguồn điện và các điều kiện cơ bản phù hợp để triển khai trạm sạc; sẵn sàng phối hợp khảo sát và đầu tư.",
  "2. Có thể triển khai làm HUB (hoặc có đất cho thuê làm HUB)":
    "Khách hàng có quỹ đất hoặc mặt bằng tiềm năng để phát triển HUB trạm sạc quy mô lớn, có nhu cầu hợp tác đầu tư hoặc cho thuê.",
  "3. Dừng không tư vấn":
    "Khách hàng không có nhu cầu, từ chối hợp tác hoặc không đáp ứng các điều kiện cần thiết để triển khai trạm sạc.",
  "4. Khác":
    "Khách hàng chưa xác định rõ nhu cầu, cần thêm thông tin, đang cân nhắc hoặc hẹn liên hệ lại để tiếp tục tư vấn.",
};

const LeadPrioritySelect = ({
  options,
  value,
  onChange,
  disabled,
  className,
  style,
}) => {
  const menuId = useId();
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const tooltipRef = useRef(null);
  const [active, setActive] = useState(null);
  const choices = [
    { value: "", label: "-- Chọn --" },
    ...options.map((option) =>
      typeof option === "object"
        ? {
            value: option.value ?? option.label,
            label: option.label ?? option.value,
          }
        : { value: option, label: option },
    ),
  ];
  const selected = choices.find((option) => option.value === value);
  const descriptionFor = ({ value, label }) =>
    PRIORITY_DESCRIPTIONS[value] ?? PRIORITY_DESCRIPTIONS[label];
  const description = active?.description;

  useLayoutEffect(() => {
    if (!description || !tooltipRef.current) return;
    const menu = menuRef.current.getBoundingClientRect();
    const option = active.element.getBoundingClientRect();
    const tooltip = tooltipRef.current;
    const right = window.innerWidth - menu.right - 16;
    const left = menu.left - 16;
    const showRight = right >= 280 || right >= left;
    tooltip.style.width = `${Math.max(0, Math.min(280, showRight ? right : left))}px`;
    tooltip.style.left = showRight ? "calc(100% + 8px)" : "auto";
    tooltip.style.right = showRight ? "auto" : "calc(100% + 8px)";
    const top = Math.max(
      8,
      Math.min(option.top, window.innerHeight - tooltip.offsetHeight - 8),
    );
    tooltip.style.top = `${top - menu.top}px`;
  }, [active, description]);

  if (!HTMLElement.prototype.showPopover) {
    return (
      <select
        aria-label="GĐKV phân loại KH"
        className={className}
        style={style}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {choices.map((option) => (
          <option
            key={option.value}
            value={option.value}
            title={descriptionFor(option)}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const openMenu = () => {
    const menu = menuRef.current;
    if (menu.matches(":popover-open")) {
      menu.hidePopover();
      return;
    }
    const anchor = triggerRef.current.getBoundingClientRect();
    const width = Math.min(
      Math.max(240, anchor.width),
      window.innerWidth - (window.innerWidth >= 600 ? 344 : 16),
    );
    const spaceBelow = window.innerHeight - anchor.bottom - 12;
    const spaceAbove = anchor.top - 12;
    const below = spaceBelow >= 260 || spaceBelow >= spaceAbove;
    Object.assign(menu.style, {
      left: `${Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)}px`,
      width: `${width}px`,
      top: below ? `${anchor.bottom + 4}px` : "auto",
      bottom: below ? "auto" : `${window.innerHeight - anchor.top + 4}px`,
    });
    menu.firstElementChild.style.maxHeight = `${Math.min(260, below ? spaceBelow : spaceAbove)}px`;
    setActive(null);
    menu.showPopover();
    const buttons = menu.querySelectorAll("button");
    (buttons[choices.indexOf(selected)] || buttons[0]).focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        style={{ ...style, textAlign: "left" }}
        disabled={disabled}
        aria-label={`GĐKV phân loại KH: ${selected?.label || value || "-- Chọn --"}`}
        popovertarget={menuId}
        onClick={(event) => {
          event.preventDefault();
          openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        {selected?.label || value || "-- Chọn --"}{" "}
        <span aria-hidden="true">▾</span>
      </button>
      <div
        id={menuId}
        ref={menuRef}
        popover="auto"
        className="fixed m-0 overflow-visible rounded-md border border-gray-300 bg-white text-gray-900 shadow-lg"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setActive(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const buttons = Array.from(
            event.currentTarget.querySelectorAll("button"),
          );
          const index = buttons.indexOf(document.activeElement);
          const next = index + (event.key === "ArrowDown" ? 1 : -1);
          buttons[Math.max(0, Math.min(next, buttons.length - 1))]?.focus();
        }}
      >
        <div
          className="overflow-auto p-1"
          onMouseLeave={() => setActive(null)}
          onWheel={() => setActive(null)}
        >
          {choices.map((option, index) => {
            const optionDescription = descriptionFor(option);
            const showDescription = (event) =>
              setActive(
                optionDescription
                  ? {
                      element: event.currentTarget,
                      description: optionDescription,
                    }
                  : null,
              );
            return (
              <button
                key={option.value}
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100 focus:bg-gray-100"
                aria-label={option.label}
                aria-pressed={option.value === value}
                aria-describedby={
                  optionDescription
                    ? `${menuId}-description-${index}`
                    : undefined
                }
                onMouseEnter={showDescription}
                onFocus={showDescription}
                onClick={() => {
                  menuRef.current.hidePopover();
                  triggerRef.current.focus();
                  onChange(option.value);
                }}
              >
                {option.label}
                {optionDescription && (
                  <span
                    id={`${menuId}-description-${index}`}
                    className="sr-only max-[599px]:not-sr-only max-[599px]:block [@media(hover:none)]:not-sr-only [@media(hover:none)]:block text-xs text-gray-600"
                  >
                    {optionDescription}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {description && (
          <div
            ref={tooltipRef}
            role="tooltip"
            className="pointer-events-none absolute rounded-md border border-gray-300 bg-white p-3 text-xs text-gray-700 shadow-lg max-[599px]:hidden [@media(hover:none)]:hidden"
          >
            {description}
          </div>
        )}
      </div>
    </>
  );
};

export default LeadPrioritySelect;
