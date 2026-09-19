const geocodeService = require('./geocodeService');
const dataListService = require('./dataListService');

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

exports.enrichDynamicData = async ({ dynamicData, fixedData, overwrite = false } = {}) => {
  if (!dynamicData || !fixedData) return false;
  const lat = parseFloat(fixedData.latitude);
  const lng = parseFloat(fixedData.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  let config;
  try {
    config = await geocodeService.getConfig();
  } catch {
    return false;
  }
  if (!config || !Number(config.enabled)) return false;

  let geo;
  try {
    geo = await geocodeService.reverse(lat, lng);
  } catch (err) {
    console.warn('[AddressEnrichment] geocode error:', err.message);
    return false;
  }
  if (!geo || !geo.found) return false;

  let match = geo.admin || null;
  if (!match) {
    try {
      match = await dataListService.matchAdministrative(geo);
    } catch (err) {
      console.warn('[AddressEnrichment] match error:', err.message);
      match = {};
    }
  }

  const setIf = (obj, key, value) => {
    if (!value) return;
    if (!overwrite && !isEmpty(obj[key])) return;
    obj[key] = value;
  };

  setIf(fixedData, 'address', geo.address || geo.formatted || geo.address_line2 || '');
  setIf(dynamicData, 'province', match.province);
  setIf(dynamicData, 'xa_phuong', match.xa_phuong);
  setIf(dynamicData, 'ma_tinh', match.ma_tinh);
  setIf(dynamicData, 'vung_mien', match.vung_mien);

  return true;
};

exports.extractProvinceFromAddress = async ({ dynamicData, fixedData } = {}) => {
  if (!dynamicData || !fixedData) return false;
  const provinceVal = dynamicData.province;
  if (!isEmpty(provinceVal)) return false;
  const address = fixedData.address || '';
  if (!address) return false;
  try {
    const match = await dataListService.findProvinceInAddress(address);
    if (!match) return false;
    dynamicData.province = match.province;
    dynamicData.ma_tinh = match.ma_tinh;
    dynamicData.vung_mien = match.vung_mien;
    return true;
  } catch {
    return false;
  }
};
