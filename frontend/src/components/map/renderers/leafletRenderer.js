const leafletRenderer = {
  id: 'leaflet',
  name: 'Leaflet',
  supports: { raster: true, vector: false, terrain: false, cluster: true, labels: true, polylines: true },
  supportsRasterTiles: true,
  supportsVectorTiles: false,
  supportsClustering: true,
};

export default leafletRenderer;
