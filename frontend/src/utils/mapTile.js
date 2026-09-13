import { getProviderById } from './tileProviders';

export const PROXY_TILE = '/tiles/{z}/{x}/{y}';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function resolveTileUrl(template, apiKey, styleValue) {
  if (!template) return '';
  let url = template.replace('{key}', apiKey || '');
  url = url.replace('{style}', styleValue || '');
  return url;
}

export function isValidTileUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const matches = url.match(/\{[^}]+\}/g) || [];
  const validPlaceholders = ['{z}', '{x}', '{y}', '{s}', '{r}'];
  return matches.every(m => validPlaceholders.includes(m));
}

export function buildTileConfig(config = {}, styleIdx) {
  const providerId = config.tile_provider_id || config.tile_provider || 'leaflet-osm';
  const apiKey = config.api_key || '';
  const tileMode = config.tile_mode || 'proxy';
  const retina = !!Number(config.retina);
  const styleValue = config.style_url || config.style_value || '';
  const fallback = { url: PROXY_TILE, attribution: OSM_ATTRIBUTION, subdomains: '', warning: '' };

  const provider = getProviderById(providerId);
  if (!provider) {
    const storedUrl = config.tile_url;
    if (storedUrl && isValidTileUrl(storedUrl) && !storedUrl.includes('{domain}')) {
      return {
        url: storedUrl,
        attribution: config.tile_attribution || OSM_ATTRIBUTION,
        subdomains: config.tile_subdomains || '',
        warning: `Provider "${providerId}" không còn trong danh mục — đang dùng tile URL đã lưu. Vào Admin → Cấu hình bản đồ để cập nhật.`,
      };
    }
    return { ...fallback, warning: 'Không tìm thấy provider đã lưu, đang dùng bản đồ mặc định.' };
  }
  if (provider.incompatible_with_leaflet) {
    return { ...fallback, warning: `${provider.name} không dùng được với Leaflet, đang dùng bản đồ mặc định.` };
  }

  if (tileMode === 'proxy') {
    return {
      url: PROXY_TILE,
      attribution: provider.attribution || OSM_ATTRIBUTION,
      subdomains: provider.subdomains || '',
      warning: '',
    };
  }

  if (provider.requires_key && !apiKey) {
    return { ...fallback, warning: `${provider.name} yêu cầu API Key nhưng chưa cấu hình.` };
  }

  const styles = provider.tile_url_styles || [];
  const selectedStyle = (styleIdx !== undefined && styleIdx !== null)
    ? (styles[styleIdx] || styles[0])
    : (styles.find(s => s.value === styleValue) || styles[0]);

  let url = '';
  if (selectedStyle && selectedStyle.url) url = selectedStyle.url;
  else if (provider.tile_url_template) url = provider.tile_url_template;
  else if (provider.tile_url && isValidTileUrl(provider.tile_url)) url = provider.tile_url;

  if (!url) return fallback;

  url = resolveTileUrl(url, apiKey, selectedStyle?.value || '');
  if (retina && provider.supports_retina) url = url.replace('.png', '@2x.png');

  return {
    url,
    attribution: selectedStyle?.attribution || provider.attribution || OSM_ATTRIBUTION,
    subdomains: selectedStyle?.subdomains !== undefined ? selectedStyle.subdomains : (provider.subdomains || ''),
    warning: '',
  };
}
