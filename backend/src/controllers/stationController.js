const stationService = require('../services/stationService');

exports.getAll = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const result = await stationService.getAllStations(search, status, parseInt(page), parseInt(limit));
    res.json({ success: true, data: result.stations, pagination: result.pagination });
  } catch (error) {
    console.error('Get stations error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const station = await stationService.getStationById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }
    res.json({ success: true, data: station });
  } catch (error) {
    console.error('Get station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, latitude, longitude, address, status, description } = req.body;
    const station = await stationService.createStation(name, latitude, longitude, address, status, description);
    res.status(201).json({ success: true, data: station, message: 'Tạo trạm thành công' });
  } catch (error) {
    console.error('Create station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, latitude, longitude, address, status, description } = req.body;
    const { id } = req.params;

    const existing = await stationService.getStationById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }

    await stationService.updateStation(id, name, latitude, longitude, address, status, description);
    const station = await stationService.getStationById(id);
    res.json({ success: true, data: station, message: 'Cập nhật trạm thành công' });
  } catch (error) {
    console.error('Update station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await stationService.getStationById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }

    await stationService.deleteStation(id);
    res.json({ success: true, message: 'Xóa trạm thành công' });
  } catch (error) {
    console.error('Delete station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
