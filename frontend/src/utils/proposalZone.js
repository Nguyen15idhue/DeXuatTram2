const normalizeProvinceKey = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

const BIG_CITY_PROVINCES = new Set([
  'hanoi',
  'hochiminh',
  'hcm',
  'hno',
  'thanhphohanoi',
  'thanhphohochiminh',
  'tphochiminh'
]);

export const getProposalMinDistanceM = (province) => {
  const key = normalizeProvinceKey(province);
  if (BIG_CITY_PROVINCES.has(key)) return 100;
  return 1000;
};

export const isBigCityProvince = (province) => {
  const key = normalizeProvinceKey(province);
  return BIG_CITY_PROVINCES.has(key);
};
