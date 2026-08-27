import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { stationService, proposalService } from '../services/api';
import { getMarkerColor, createCustomIcon } from '../utils/mapHelpers';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapView = ({ onMarkerClick }) => {
  const [stations, setStations] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [stationsRes, proposalsRes] = await Promise.all([
        stationService.getAll(),
        proposalService.getAll()
      ]);

      if (stationsRes.success) {
        setStations(stationsRes.data);
      }
      if (proposalsRes.success) {
        setProposals(proposalsRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="map-loading">Đang tải bản đồ...</div>;
  }

  const position = [10.7626, 106.6601];

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
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
    </div>
  );
};

export default MapView;
