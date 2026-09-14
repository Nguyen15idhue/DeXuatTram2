import { useEffect, useRef, useState } from 'react';
import { createRuntime } from './renderers';

export default function MapCanvas({
  renderer,
  center,
  zoom,
  tile,
  vectorStyle = '',
  apiKey = '',
  stations = [],
  proposals = [],
  pairs = [],
  showCluster = true,
  showStationLabels = true,
  showProvinceLabels = true,
  showBoundaries = true,
  boundariesGeojson = null,
  provincePoints = [],
  selectedPosition = null,
  myLocation = null,
  locationPoint = false,
  circle = null,
  fitView = null,
  enable3d = false,
  onMarkerClick,
  renderStationPopup,
  renderProposalPopup,
  renderDuplicatePopup,
  renderSelectedPopup,
  renderMyLocationPopup,
  selectingLocation = false,
  onMapSelectClick,
  flyToPosition = null,
  onTileError,
  onRuntimeInfo,
}) {
  const containerRef = useRef(null);
  const runtimeRef = useRef(null);
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const clickRef = useRef({ selectingLocation, onMapSelectClick });
  const markerClickRef = useRef(onMarkerClick);
  const argsRef = useRef({ center, zoom, tile, vectorStyle, apiKey });
  clickRef.current = { selectingLocation, onMapSelectClick };
  markerClickRef.current = onMarkerClick;
  argsRef.current = { center, zoom, tile, vectorStyle, apiKey };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    container.replaceChildren();
    container.className = '';
    container._leaflet_id = undefined;
    let cancelled = false;
    let runtime = null;
    const { center: c, zoom: z, tile: t, vectorStyle: vs, apiKey: k } = argsRef.current;

    const assign = (res) => {
      if (cancelled) {
        try { res.runtime.remove(); } catch { /* noop */ }
        return;
      }
      runtime = res.runtime;
      runtimeRef.current = runtime;
      if (import.meta.env.DEV) window.__mapRuntime = runtime;
      runtime.on('click', (e) => {
        const { selectingLocation: selecting, onMapSelectClick: onSelect } = clickRef.current;
        if (selecting && onSelect) onSelect(e.latlng ? e.latlng.lat : e.lngLat.lat, e.latlng ? e.latlng.lng : e.lngLat.lng);
      });
      if (onRuntimeInfo) onRuntimeInfo({ id: runtime.id, fallback: res.fallback, requested: res.requested });
      setRuntimeVersion(v => v + 1);
    };

    const result = createRuntime(renderer, { container, center: c, zoom: z, tile: t, style: vs, apiKey: k });
    if (result && typeof result.then === 'function') {
      result.then(assign).catch((err) => {
        if (!cancelled) console.error('[MapCanvas] createRuntime error:', err);
      });
    } else {
      assign(result);
    }

    return () => {
      cancelled = true;
      if (runtime) {
        try { runtime.remove(); } catch { /* noop */ }
      }
      runtimeRef.current = null;
      if (import.meta.env.DEV) window.__mapRuntime = null;
    };
  }, [renderer]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !tile) return;
    runtime.setTileLayer({ ...tile, onTileError });
  }, [runtimeVersion, tile?.url, tile?.attribution, tile?.subdomains, tile?.overlays, onTileError]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const items = [
      ...stations.map((s) => ({ ...s, _type: 'station', _color: s._color, _label: s.name || `Trạm #${s.id}` })),
      ...proposals.map((p) => ({ ...p, _type: 'proposal', _color: p._color, _label: `Đề xuất #${p.id}` })),
    ];
    runtime.setMarkers(items, {
      cluster: showCluster,
      showLabels: showStationLabels,
      onMarkerClick: (...args) => markerClickRef.current && markerClickRef.current(...args),
      renderPopup: (item) => (item._type === 'station' ? renderStationPopup(item) : renderProposalPopup(item)),
    });
  }, [runtimeVersion, stations, proposals, showCluster, showStationLabels, renderStationPopup, renderProposalPopup]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setPolylines(pairs, { renderPopup: renderDuplicatePopup });
  }, [runtimeVersion, pairs, renderDuplicatePopup]);

  useEffect(() => {
    runtimeRef.current?.setProvinceLabels(provincePoints, showProvinceLabels);
  }, [runtimeVersion, provincePoints, showProvinceLabels]);

  useEffect(() => {
    runtimeRef.current?.setBoundaries(boundariesGeojson, showBoundaries);
  }, [runtimeVersion, boundariesGeojson, showBoundaries]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const points = [];
    if (selectedPosition) {
      points.push({ position: selectedPosition, color: '#ea4335', variant: locationPoint ? 'location' : undefined, renderPopup: locationPoint ? undefined : renderSelectedPopup });
    }
    if (myLocation) {
      points.push({ position: myLocation, color: '#4285f4', renderPopup: renderMyLocationPopup });
    }
    runtime.setPoints(points);
  }, [runtimeVersion, selectedPosition, myLocation, locationPoint, renderSelectedPopup, renderMyLocationPopup]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || typeof runtime.setCircle !== 'function') return;
    runtime.setCircle(circle);
  }, [runtimeVersion, circle]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || typeof runtime.set3D !== 'function') return;
    runtime.set3D(enable3d);
  }, [runtimeVersion, enable3d]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !fitView || !fitView.center) return;
    runtime.setView(fitView.center, fitView.zoom);
  }, [runtimeVersion, fitView]);

  useEffect(() => {
    if (flyToPosition) runtimeRef.current?.flyTo(flyToPosition, 16);
  }, [runtimeVersion, flyToPosition]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !vectorStyle || typeof runtime.setStyle !== 'function') return;
    runtime.setStyle(vectorStyle);
  }, [runtimeVersion, vectorStyle]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%', position: 'relative', overflow: 'hidden' }} />;
}
