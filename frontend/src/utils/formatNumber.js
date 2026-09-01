const NUMBER_FORMATS = {
  plain: { separator: '', decimal: '.' },
  dot: { separator: '.', decimal: ',' },
  comma: { separator: ',', decimal: '.' },
  space: { separator: ' ', decimal: ',' },
};

export function formatNumber(value, { format = 'plain', decimalPlaces, unit } = {}) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const fmt = NUMBER_FORMATS[format] || NUMBER_FORMATS.plain;

  let intPart;
  let decPart = '';
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (decimalPlaces !== undefined && decimalPlaces !== null && decimalPlaces >= 0) {
    const fixed = absNum.toFixed(decimalPlaces);
    const parts = fixed.split('.');
    intPart = parts[0];
    decPart = parts[1] || '';
  } else {
    const str = String(absNum);
    const dotIdx = str.indexOf('.');
    if (dotIdx >= 0) {
      intPart = str.substring(0, dotIdx);
      decPart = str.substring(dotIdx + 1);
    } else {
      intPart = str;
    }
  }

  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.separator);
  let result = sign + withSeparators;
  if (decPart) result += fmt.decimal + decPart;
  if (unit) result += ' ' + unit;
  return result;
}

export function parseFormattedNumber(str) {
  if (str === null || str === undefined) return NaN;
  const cleaned = String(str).replace(/[^0-9.,\-]/g, '');
  if (!cleaned) return NaN;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  if (lastDot > lastComma) {
    return parseFloat(cleaned.replace(/,/g, ''));
  } else if (lastComma > lastDot) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  } else {
    return parseFloat(cleaned.replace(/[^0-9.\-]/g, ''));
  }
}

export const NUMBER_FORMAT_OPTIONS = [
  { value: 'plain', label: '1000' },
  { value: 'comma', label: '1,000' },
  { value: 'dot', label: '1.000' },
  { value: 'space', label: '1 000' },
];
