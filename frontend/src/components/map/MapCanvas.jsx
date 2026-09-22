import { useEffect, useRef, useState } from 'react';
import { createRuntime } from './renderers';
import { clusterSig } from '../../utils/mapCluster';

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
  clusterOptions = null,
  showStationLabels = true,
  showProvinceLabels = true,
  showBoundaries = true,
  boundariesGeojson = null,
  provincePoints = [],
  islandPoints = [],
  wardPoints = [],
  showWardLabels = false,
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
  measureActive = false,
  measurePoints = null,
  measureSnapped = null,
  onMeasureClick,
  onMeasureSnap,
  flyToPosition = null,
  onTileError,
  onRuntimeInfo,
}) {
  const containerRef = useRef(null);
  const runtimeRef = useRef(null);
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const clickRef = useRef({ selectingLocation, onMapSelectClick });
  const measureClickRef = useRef({ measureActive, onMeasureClick, onMeasureSnap });
  const markerClickRef = useRef(onMarkerClick);
  const markersSigRef = useRef({ runtime: null, stations: null, proposals: null, cluster: null });
  const argsRef = useRef({ center, zoom, tile, vectorStyle, apiKey });
  clickRef.current = { selectingLocation, onMapSelectClick };
  measureClickRef.current = { measureActive, onMeasureClick, onMeasureSnap };
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
        const lat = e.latlng ? e.latlng.lat : e.lngLat.lat;
        const lng = e.latlng ? e.latlng.lng : e.lngLat.lng;
        const { selectingLocation: selecting, onMapSelectClick: onSelect } = clickRef.current;
        if (selecting && onSelect) onSelect(lat, lng);
        const { measureActive: measuring, onMeasureClick: onMeasure } = measureClickRef.current;
        if (measuring && onMeasure) {
          let zoom = null;
          try {
            const rt = runtimeRef.current;
            zoom = typeof rt?.getZoom === 'function' ? rt.getZoom() : null;
          } catch { /* noop */ }
          onMeasure(lat, lng, zoom);
        }
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
  }, [runtimeVersion, tile?.url, tile?.attribution, tile?.subdomains, tile?.maxNativeZoom, tile?.overlays, onTileError]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const sig = markersSigRef.current;
    const clusterKey = `${showCluster ? 'on' : 'off'}:${clusterSig(clusterOptions)}`;
    const sameData = sig.runtime === runtime && sig.stations === stations && sig.proposals === proposals && sig.cluster === clusterKey;
    if (sameData) {
      if (sig.labels === showStationLabels) return;
      markersSigRef.current = { ...sig, labels: showStationLabels };
      if (typeof runtime.setMarkerLabels === 'function') {
        runtime.setMarkerLabels(showStationLabels);
        return;
      }
    } else {
      markersSigRef.current = { runtime, stations, proposals, cluster: clusterKey, labels: showStationLabels };
    }
    const items = [
      ...stations.map((s) => ({ ...s, _type: 'station', _color: s._color, _label: s.ma_tram || s.ma_tram_gen || s.name || `Trạm #${s.id}` })),
      ...proposals.map((p) => ({ ...p, _type: 'proposal', _color: p._color, _label: p.ma_de_xuat || `Đề xuất #${p.id}` })),
    ];
    runtime.setMarkers(items, {
      cluster: showCluster,
      clusterOptions,
      showLabels: showStationLabels,
      onMarkerClick: (...args) => markerClickRef.current && markerClickRef.current(...args),
      renderPopup: (item) => (item._type === 'station' ? renderStationPopup(item) : renderProposalPopup(item)),
    });
  }, [runtimeVersion, stations, proposals, showCluster, clusterOptions && `${clusterOptions.radius}/${clusterOptions.maxZoom}`, showStationLabels, renderStationPopup, renderProposalPopup]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setPolylines(pairs, { renderPopup: renderDuplicatePopup });
  }, [runtimeVersion, pairs, renderDuplicatePopup]);

  useEffect(() => {
    runtimeRef.current?.setProvinceLabels(provincePoints, showProvinceLabels);
  }, [runtimeVersion, provincePoints, showProvinceLabels]);

  useEffect(() => {
    runtimeRef.current?.setIslandLabels(islandPoints);
  }, [runtimeVersion, islandPoints]);

  useEffect(() => {
    runtimeRef.current?.setWardLabels(wardPoints, showWardLabels);
  }, [runtimeVersion, wardPoints, showWardLabels]);

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
    if (!runtime || typeof runtime.setMeasure !== 'function') return;
    runtime.setMeasure({ active: measureActive, points: measurePoints, snapped: measureSnapped }, onMeasureSnap || null);
  }, [runtimeVersion, measureActive, measurePoints, measureSnapped, onMeasureSnap]);

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
