import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { buildTileConfig } from '../utils/mapTile';
import { buildMapStyle } from '../utils/mapStyles';
import { getProviderById } from '../utils/tileProviders';

const TTL = 60000;
let cache = null;
let cacheAt = 0;
let cachePromise = null;

function fetchConfig(force = false) {
  if (!force && cache && Date.now() - cacheAt < TTL) return Promise.resolve(cache);
  if (!cachePromise) {
    cachePromise = api.get('/map-configs?entity=stations')
      .then((res) => {
        cache = res && res.success ? res.data : null;
        cacheAt = Date.now();
        return cache;
      })
      .catch(() => null)
      .finally(() => { cachePromise = null; });
  }
  return cachePromise;
}

export function clearMapConfigCache() {
  cache = null;
  cacheAt = 0;
}

export default function useMapConfig() {
  const [config, setConfig] = useState(cache);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    const onRefresh = () => { clearMapConfigCache(); setVersion((v) => v + 1); };
    window.addEventListener('mapconfig:refresh', onRefresh);
    return () => window.removeEventListener('mapconfig:refresh', onRefresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stale = !cache || Date.now() - cacheAt >= TTL;
    if (!stale && !config) {
      setConfig(cache);
      setLoading(false);
      return;
    }
    fetchConfig(version > 0 || stale).then((data) => {
      if (cancelled) return;
      setConfig(data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [version]);

  const tile = buildTileConfig(config || {});
  const renderer = (config && config.renderer) || 'leaflet';
  const provider = config ? getProviderById(config.tile_provider_id) : null;
  const providerStyleUrl = provider && provider.style_url && !provider.style_url.includes('{domain}')
    ? provider.style_url
    : '';
  const vectorStyle = renderer === 'maplibre'
    ? buildMapStyle(config && config.default_mode, {
        styleUrl: providerStyleUrl || (config && config.style_url),
        pmtilesUrl: config && /\.pmtiles(\?|$)/i.test(config.tile_url || '') ? config.tile_url : '',
      })
    : '';

  return {
    config,
    loading,
    tileUrl: tile.url,
    attribution: tile.attribution,
    subdomains: tile.subdomains,
    renderer,
    vectorStyle,
    apiKey: (config && config.api_key) || '',
  };
}
