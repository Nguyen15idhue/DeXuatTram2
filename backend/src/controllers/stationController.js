const stationService = require('../services/stationService');

exports.getAll = async (req, res) => {
  try {
    const { search, status, page = 1, limit, uu_tien, mo_hinh_tram, filters } = req.query;
    const isMapRequest = limit === undefined;
    const parsedLimit = isMapRequest ? 10000 : parseInt(limit);
    const parsedPage = isMapRequest ? 1 : parseInt(page);
    const result = await stationService.getAllStations(search, status, parsedPage, parsedLimit, isMapRequest, {
      uuTien: uu_tien,
      moHinhTram: mo_hinh_tram,
      columnFilters: filters
    });
    const data = result.stations;
    if (!req.user) {
      data.forEach((s) => { delete s.chu_tram; delete s.sdt_chu_tram; });
    }
    res.json({ success: true, data, pagination: result.pagination });
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
    if (!req.user) {
      delete station.chu_tram;
      delete station.sdt_chu_tram;
    }
    res.json({ success: true, data: station });
  } catch (error) {
    console.error('Get station error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const station = await stationService.createStation(req.body);
    res.status(201).json({ success: true, data: station, message: 'Tạo trạm thành công' });
  } catch (error) {
    console.error('Create station error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await stationService.getStationById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }

    await stationService.updateStation(id, req.body);
    const station = await stationService.getStationById(id);
    res.json({ success: true, data: station, message: 'Cập nhật trạm thành công' });
  } catch (error) {
    console.error('Update station error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
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
