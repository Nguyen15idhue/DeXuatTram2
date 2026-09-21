import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPinned, Ruler, LayoutGrid } from 'lucide-react';
import { stationService, proposalService } from '../services/api';
import { getMarkerColor } from '../utils/mapHelpers';
import { getStatusLabel, getStationStatuses, getProposalStatuses } from '../utils/mapStatuses';
import { getMarkerIcon } from '../utils/mapMarkerIcons';
import MarkerIcon from './MarkerIcon';
import useMarkerIcons from '../hooks/useMarkerIcons';
import useMapStatuses from '../hooks/useMapStatuses';
import useMapConfig from '../hooks/useMapConfig';
import { ISLAND_POINTS } from '../utils/provinceData';
import MapCanvas from './map/MapCanvas';

const RADIUS_OPTIONS = [5, 10, 20, 50];

export const PREVIEW_STATUS_FILTER = {
  stations: ['ACTIVE', 'DEPLOYING'],
  proposals: ['PENDING', 'APPROVED']
};

const zoomForRadius = (radius) => {
  if (radius <= 5) return 12;
  if (radius <= 10) return 11;
  if (radius <= 20) return 10;
  return 9;
};

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

function createNearbyPopup(title, item, status, entity) {
  const div = document.createElement('div');
  div.className = 'popup-content';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  div.appendChild(h3);
  const addRow = (label, value) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value || ''));
    div.appendChild(p);
  };
  const statusP = document.createElement('p');
  const statusStrong = document.createElement('strong');
  statusStrong.textContent = 'Trạng thái: ';
  statusP.appendChild(statusStrong);
  const span = document.createElement('span');
  span.style.color = getMarkerColor(status, entity);
  span.textContent = getStatusLabel(status, entity);
  statusP.appendChild(span);
  div.appendChild(statusP);
  addRow('Khoảng cách', `${item._distanceKm.toFixed(2)} km`);
  addRow('Địa chỉ', item.address);
  return div;
}

const LocationMapModal = ({ open, lat, lng, title = 'Vị trí', radiusKm = 5, onClose, statusFilter = null }) => {
  const [radius, setRadius] = useState(radiusKm);
  const [showLegend, setShowLegend] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true));
  const [showDistance, setShowDistance] = useState(false);
  const [stations, setStations] = useState([]);
  const [proposals, setProposals] = useState([]);
  const { renderer, vectorStyle, apiKey, tileUrl, attribution, subdomains } = useMapConfig();
  useMarkerIcons();
  useMapStatuses();
  const position = useMemo(() => [parseFloat(lat), parseFloat(lng)], [lat, lng]);

  const valid = open && !Number.isNaN(position[0]) && !Number.isNaN(position[1]);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, p] = await Promise.all([stationService.getAll(), proposalService.getAll()]);
        if (cancelled) return;
        if (s.success) setStations(s.data);
        if (p.success) setProposals(p.data);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [valid]);

  const nearby = useMemo(() => {
    const [clat, clng] = position;
    const within = (item) => {
      const ilat = parseFloat(item.latitude);
      const ilng = parseFloat(item.longitude);
      if (Number.isNaN(ilat) || Number.isNaN(ilng)) return null;
      const d = haversineKm(clat, clng, ilat, ilng);
      return d <= radius ? { ...item, _distanceKm: d } : null;
    };
    let nearStations = stations.map(within).filter(Boolean);
    let nearProposals = proposals.map(within).filter(Boolean);
    if (statusFilter && Array.isArray(statusFilter.stations) && statusFilter.stations.length > 0) {
      nearStations = nearStations.filter((s) => statusFilter.stations.includes(s.status));
    }
    if (statusFilter && Array.isArray(statusFilter.proposals) && statusFilter.proposals.length > 0) {
      nearProposals = nearProposals.filter((p) => statusFilter.proposals.includes(p.status));
    }
    return { stations: nearStations, proposals: nearProposals };
  }, [position, radius, stations, proposals, statusFilter]);

  const pairs = useMemo(() => {
    if (!showDistance) return [];
    const toPair = (item) => ({
      a: { latitude: position[0], longitude: position[1] },
      b: { latitude: item.latitude, longitude: item.longitude },
      distance_m: item._distanceKm * 1000
    });
    return [...nearby.stations.map(toPair), ...nearby.proposals.map(toPair)];
  }, [showDistance, nearby, position]);

  const fitView = useMemo(() => ({ center: position, zoom: zoomForRadius(radius) }), [position, radius]);
  const circle = useMemo(() => ({ center: position, radiusM: radius * 1000 }), [position, radius]);

  if (!valid) return null;

  const allStationStatuses = getStationStatuses();
  const allProposalStatuses = getProposalStatuses();
  const legendStations = statusFilter && Array.isArray(statusFilter.stations) && statusFilter.stations.length > 0
    ? allStationStatuses.filter((s) => statusFilter.stations.includes(s.value))
    : allStationStatuses;
  const legendProposals = statusFilter && Array.isArray(statusFilter.proposals) && statusFilter.proposals.length > 0
    ? allProposalStatuses.filter((s) => statusFilter.proposals.includes(s.value))
    : allProposalStatuses;
  const filterNote = statusFilter
    ? ` (lọc ${[
        ...(statusFilter.stations || []).map((v) => getStatusLabel(v, 'station')),
        ...(statusFilter.proposals || []).map((v) => getStatusLabel(v, 'proposal'))
      ].join('/')})`
    : '';
  const total = nearby.stations.length + nearby.proposals.length;
  const canvasStations = nearby.stations.map(s => ({ ...s, _color: getMarkerColor(s.status, 'station'), _icon: getMarkerIcon(s.status, 'station') }));
  const canvasProposals = nearby.proposals.map(p => ({ ...p, _color: getMarkerColor(p.status, 'proposal'), _icon: getMarkerIcon(p.status, 'proposal') }));
  const renderStationPopup = (item) => createNearbyPopup(item.name || `Trạm #${item.id}`, item, item.status, 'station');
  const renderProposalPopup = (item) => createNearbyPopup(`Đề xuất #${item.id}`, item, item.status, 'proposal');

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="legacy-modal location-map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h2 className="flex items-center gap-2">
            <MapPinned size={18} className="text-primary" />
            {title}
          </h2>
          <button className="btn-close" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', padding: '4px 8px' }}>✕</button>
        </div>

        <div className="location-map-toolbar">
          <span className="text-xs font-medium text-base-content/70">Bán kính</span>
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`btn btn-xs ${radius === r ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setRadius(r)}
            >
              {r} km
            </button>
          ))}
          <span className="ml-auto text-xs text-base-content/50">
            {total} điểm lân cận{filterNote}
          </span>
        </div>

        <div className="location-map-body">
          <MapCanvas
            renderer={renderer}
            center={position}
            zoom={zoomForRadius(radius)}
            tile={{ url: tileUrl, attribution, subdomains }}
            vectorStyle={vectorStyle}
            apiKey={apiKey}
            stations={canvasStations}
            proposals={canvasProposals}
            islandPoints={ISLAND_POINTS}
            showCluster={false}
            showStationLabels={false}
            showProvinceLabels={false}
            showBoundaries={false}
            provincePoints={[]}
            selectedPosition={position}
            locationPoint
            circle={circle}
            fitView={fitView}
            pairs={pairs}
            renderStationPopup={renderStationPopup}
            renderProposalPopup={renderProposalPopup}
          />
          <div className="location-map-controls">
            <button
              type="button"
              className={`map-control-btn ${showLegend ? 'map-control-btn-active' : ''}`}
              title="Chú thích"
              onClick={() => setShowLegend((v) => !v)}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={`map-control-btn ${showDistance ? 'map-control-btn-active' : ''}`}
              title="Đường khoảng cách"
              onClick={() => setShowDistance((v) => !v)}
            >
              <Ruler size={16} />
            </button>
          </div>
          {showLegend && (
            <div className="map-legend">
              <div className="map-legend-title">Chú thích</div>
              <div className="map-legend-columns">
                <div className="map-legend-col">
                  <div className="map-legend-col-title">Trạm</div>
                  {legendStations.map((item) => (
                    <div key={`s-${item.value}`} className="map-legend-item">
                      {getMarkerIcon(item.value, 'station')
                        ? <span className="map-legend-badge" style={{ borderColor: getMarkerColor(item.value, 'station') }}><MarkerIcon id={getMarkerIcon(item.value, 'station')} size={13} /></span>
                        : <span className="map-legend-dot" style={{ backgroundColor: getMarkerColor(item.value, 'station') }} />}
                      <span className="map-legend-label">{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="map-legend-col map-legend-col-wide">
                  <div className="map-legend-col-title text-center">Đề xuất</div>
                  <div className="map-legend-subcols">
                    {[0, 1].map((chunk) => legendProposals.slice(chunk * 5, chunk * 5 + 5)).filter((g) => g.length > 0).map((group, gi) => (
                      <div key={gi} className="map-legend-subcol">
                        {group.map((item) => (
                          <div key={`p-${item.value}`} className="map-legend-item">
                            {getMarkerIcon(item.value, 'proposal')
                              ? <span className="map-legend-badge" style={{ borderColor: getMarkerColor(item.value, 'proposal') }}><MarkerIcon id={getMarkerIcon(item.value, 'proposal')} size={13} /></span>
                              : <span className="map-legend-dot" style={{ backgroundColor: getMarkerColor(item.value, 'proposal') }} />}
                            <span className="map-legend-label">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LocationMapModal;
