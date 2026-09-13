export const MAP_MODES = [
  { id: 'streets', label: 'Đường phố', hint: 'Bản đồ nền đường phố' },
  { id: 'satellite', label: 'Vệ tinh', hint: 'Ảnh vệ tinh' },
  { id: 'hybrid', label: 'Vệ tinh + nhãn', hint: 'Ảnh vệ tinh phủ nhãn' },
  { id: 'terrain', label: 'Địa hình', hint: 'Địa hình / độ cao' },
];

export const DEFAULT_MODE = 'streets';

export function getMode(modeId) {
  return MAP_MODES.find((m) => m.id === modeId) || MAP_MODES[0];
}
