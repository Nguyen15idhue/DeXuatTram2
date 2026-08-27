import MapView from '../../components/MapView';

const MapPage = () => {
  const handleMarkerClick = (data, type) => {
    console.log('Marker clicked:', type, data);
  };

  return (
    <div className="map-page">
      <div className="map-container">
        <MapView onMarkerClick={handleMarkerClick} />
      </div>
    </div>
  );
};

export default MapPage;
