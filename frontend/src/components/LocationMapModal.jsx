import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPinned } from 'lucide-react';
import { stationService, proposalService } from '../services/api';
import { getMarkerColor, createCustomIcon } from '../utils/mapHelpers';

const RADIUS_OPTIONS = [5, 10, 20, 50];

const pointIcon = L.divIcon({
  className: 'location-point-icon',
  html: '<div class="location-point"><span class="location-point-ring"></span><span class="location-point-dot"></span></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

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

function FitRadius({ position, radius }) {
  const map = useMap();
  useEffect(() => {
    const zoom = zoomForRadius(radius);
    map.setView(position, zoom, { animate: true });
  }, [position, radius, map]);
  return null;
}

const LocationMapModal = ({ open, lat, lng, title = 'Vị trí', radiusKm = 5, onClose }) => {
  const [radius, setRadius] = useState(radiusKm);
  const [stations, setStations] = useState([]);
  const [proposals, setProposals] = useState([]);
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
    const nearStations = stations.map(within).filter(Boolean);
    const nearProposals = proposals.map(within).filter(Boolean);
    return { stations: nearStations, proposals: nearProposals };
  }, [position, radius, stations, proposals]);

  if (!valid) return null;

  const total = nearby.stations.length + nearby.proposals.length;

  const addRow = (label, value) => (
    <>
      <strong>{label}: </strong>{value || ''}<br />
    </>
  );

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
            {total} điểm lân cận
          </span>
        </div>

        <div className="location-map-body">
          <MapContainer
            center={position}
            zoom={zoomForRadius(radius)}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <FitRadius position={position} radius={radius} />
            <Marker position={position} icon={pointIcon} />
            <Circle
              center={position}
              radius={radius * 1000}
              pathOptions={{ color: '#2563eb', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.1 }}
            />
            {nearby.stations.map((s) => (
              <Marker key={`s-${s.id}`} position={[parseFloat(s.latitude), parseFloat(s.longitude)]} icon={createCustomIcon(getMarkerColor(s.status))}>
                <Popup>
                  <div className="popup-content">
                    <h3>{s.name || `Trạm #${s.id}`}</h3>
                    {addRow('Trạng thái', s.status)}
                    {addRow('Khoảng cách', `${s._distanceKm.toFixed(2)} km`)}
                    {addRow('Địa chỉ', s.address)}
                  </div>
                </Popup>
              </Marker>
            ))}
            {nearby.proposals.map((p) => (
              <Marker key={`p-${p.id}`} position={[parseFloat(p.latitude), parseFloat(p.longitude)]} icon={createCustomIcon(getMarkerColor(p.status))}>
                <Popup>
                  <div className="popup-content">
                    <h3>Đề xuất #{p.id}</h3>
                    {addRow('Trạng thái', p.status)}
                    {addRow('Khoảng cách', `${p._distanceKm.toFixed(2)} km`)}
                    {addRow('Địa chỉ', p.address)}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LocationMapModal;
