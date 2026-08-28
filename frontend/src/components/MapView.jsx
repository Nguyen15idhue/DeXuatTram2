import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { stationService, proposalService } from '../services/api';
import { getMarkerColor, createCustomIcon, parseGoogleMapsLink, resolveGoogleMapsShortUrl } from '../utils/mapHelpers';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapClickHandler({ onMapClick, selectingLocation, onLocationSelected }) {
  useMapEvents({
    click(e) {
      if (selectingLocation) {
        onLocationSelected(e.latlng.lat, e.latlng.lng);
      } else if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

function FlyToLocation({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 16, { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

const MAP_LEGEND = [
  { status: 'ACTIVE', label: 'Đang hoạt động' },
  { status: 'DEPLOYING', label: 'Đang triển khai' },
  { status: 'PENDING', label: 'Đang đề xuất' },
  { status: 'REVIEWING', label: 'Đang xem xét' },
  { status: 'APPROVED', label: 'Đã duyệt' },
  { status: 'REJECTED', label: 'Từ chối' },
];

const MapView = ({
  onMarkerClick,
  onMapClick,
  selectingLocation,
  onLocationSelected,
  highlightPosition,
  refreshKey
}) => {
  const [stations, setStations] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [googleMapUrl, setGoogleMapUrl] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [stationsRes, proposalsRes] = await Promise.all([
        stationService.getAll(),
        proposalService.getAll()
      ]);
      if (stationsRes.success) setStations(stationsRes.data);
      if (proposalsRes.success) setProposals(proposalsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (refreshKey) fetchData(); }, [refreshKey]);

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Trình duyệt không hỗ trợ định vị');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMyLocation([latitude, longitude]);
        setLocationLoading(false);
        setShowCreateMenu(false);
        if (onLocationSelected) {
          onLocationSelected(latitude, longitude);
        }
      },
      (error) => {
        setLocationLoading(false);
        let msg = 'Không thể lấy vị trí';
        if (error.code === 1) msg = 'Bạn đã từ chối quyền truy cập vị trí';
        else if (error.code === 2) msg = 'Không xác định được vị trí';
        else if (error.code === 3) msg = 'Timeout lấy vị trí';
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleGoogleMapSubmit = async () => {
    if (!googleMapUrl.trim()) return;

    setResolvingUrl(true);
    const result = parseGoogleMapsLink(googleMapUrl);

    if (result && !result.needResolve) {
      setGoogleMapUrl('');
      setResolvingUrl(false);
      setShowCreateMenu(false);
      if (onLocationSelected) {
        onLocationSelected(result.lat, result.lng);
      }
      return;
    }

    if (result && result.needResolve) {
      const resolved = await resolveGoogleMapsShortUrl(result.url);
      setResolvingUrl(false);
      if (resolved && !resolved.needResolve) {
        setGoogleMapUrl('');
        setShowCreateMenu(false);
        if (onLocationSelected) {
          onLocationSelected(resolved.lat, resolved.lng);
        }
        return;
      }
    }

    setResolvingUrl(false);
    alert('Không thể đọc tọa độ từ link này. Vui lòng kiểm tra lại định dạng link.');
  };

  if (loading) {
    return <div className="map-loading">Đang tải bản đồ...</div>;
  }

  const position = [10.7626, 106.6601];

  return (
    <div style={{ flex: 1, height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={position}
        zoom={12}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <MapClickHandler
          onMapClick={onMapClick}
          selectingLocation={selectingLocation}
          onLocationSelected={onLocationSelected}
        />

        {highlightPosition && <FlyToLocation position={highlightPosition} />}
        {myLocation && <FlyToLocation position={myLocation} />}

        {stations.map((station) => (
          <Marker
            key={`station-${station.id}`}
            position={[parseFloat(station.latitude), parseFloat(station.longitude)]}
            icon={createCustomIcon(getMarkerColor(station.status))}
            eventHandlers={{
              click: () => onMarkerClick && onMarkerClick(station, 'station')
            }}
          >
            <Popup>
              <div className="popup-content">
                <h3>{station.name}</h3>
                <p><strong>Địa chỉ:</strong> {station.address}</p>
                <p><strong>Trạng thái:</strong> <span style={{ color: getMarkerColor(station.status) }}>{station.status}</span></p>
                {station.description && <p><strong>Mô tả:</strong> {station.description}</p>}
                <p><strong>Loại:</strong> Trạm sạc</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {proposals.map((proposal) => (
          <Marker
            key={`proposal-${proposal.id}`}
            position={[parseFloat(proposal.latitude), parseFloat(proposal.longitude)]}
            icon={createCustomIcon(getMarkerColor(proposal.status))}
            eventHandlers={{
              click: () => onMarkerClick && onMarkerClick(proposal, 'proposal')
            }}
          >
            <Popup>
              <div className="popup-content">
                <h3>Đề xuất #{proposal.id}</h3>
                <p><strong>Chủ sở hữu:</strong> {proposal.owner_name}</p>
                <p><strong>SĐT:</strong> {proposal.owner_phone}</p>
                <p><strong>Địa chỉ:</strong> {proposal.address}</p>
                <p><strong>Diện tích:</strong> {proposal.area}</p>
                <p><strong>Loại đất:</strong> {proposal.land_type}</p>
                <p><strong>Trạng thái:</strong> <span style={{ color: getMarkerColor(proposal.status) }}>{proposal.status}</span></p>
                {proposal.description && <p><strong>Mô tả:</strong> {proposal.description}</p>}
                <p><strong>Người đề xuất:</strong> {proposal.user_name}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Legend - top left */}
      <div className="map-legend">
        <div className="map-legend-title">Chú thích</div>
        {MAP_LEGEND.map((item) => (
          <div key={item.status} className="map-legend-item">
            <span
              className="map-legend-dot"
              style={{ backgroundColor: getMarkerColor(item.status) }}
            />
            <span className="map-legend-label">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Floating Action Buttons - bottom right */}
      <div className="map-fab-group">
        {/* Create Proposal Menu */}
        {showCreateMenu && (
          <div className="map-create-menu">
            <button className="map-create-option" onClick={handleMyLocation} disabled={locationLoading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
              <span>{locationLoading ? 'Đang lấy...' : 'Vị trí của tôi'}</span>
            </button>
            <button
              className="map-create-option"
              onClick={() => { setShowCreateMenu(false); if (onMapClick) onMapClick(null, null, 'select'); }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>Chọn trên bản đồ</span>
            </button>
            <div className="map-create-option map-create-option-input">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/>
                <path d="M8 2v12M16 6v12"/>
              </svg>
              <input
                type="text"
                placeholder="Dán link Google Map..."
                value={googleMapUrl}
                onChange={(e) => setGoogleMapUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGoogleMapSubmit()}
              />
              <button
                className="map-google-confirm"
                onClick={handleGoogleMapSubmit}
                disabled={resolvingUrl || !googleMapUrl.trim()}
              >
                {resolvingUrl ? '...' : '✓'}
              </button>
            </div>
          </div>
        )}

        {/* My Location Button */}
        <button
          className="map-fab map-fab-location"
          onClick={handleMyLocation}
          disabled={locationLoading}
          title="Vị trí của tôi"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Create Proposal Button */}
        <button
          className={`map-fab map-fab-create ${showCreateMenu ? 'map-fab-active' : ''}`}
          onClick={() => setShowCreateMenu(!showCreateMenu)}
          title="Tạo đề xuất mới"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default MapView;
