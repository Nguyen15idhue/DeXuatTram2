const stationService = require('../services/stationService');

exports.getAll = async (req, res) => {
  try {
    const { search, status, page = 1, limit, uu_tien, mo_hinh_tram, filters, province, region, date_from, date_to, date_field } = req.query;
    const isMapRequest = limit === undefined;
    const parsedLimit = isMapRequest ? 10000 : parseInt(limit);
    const parsedPage = isMapRequest ? 1 : parseInt(page);
    const result = await stationService.getAllStations(search, status, parsedPage, parsedLimit, isMapRequest, {
      uuTien: uu_tien,
      moHinhTram: mo_hinh_tram,
      columnFilters: filters,
      province,
      region,
      dateFrom: date_from,
      dateTo: date_to,
      dateField: date_field
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
    try {
      const stationActivityService = require('../services/stationActivityService');
      await stationActivityService.logActivity({
        stationId: station.id, action: 'created', toStatus: station.status,
        changedFields: { name: station.name, ma_tram: station.ma_tram || '' },
        actorId: req.user ? req.user.id : null, actorRole: req.user ? req.user.role : null,
        source: 'user', ip: req.ip || null
      });
    } catch { /* silent */ }
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
    try {
      const stationActivityService = require('../services/stationActivityService');
      await stationActivityService.logActivity({
        stationId: id,
        action: existing.status !== station.status ? 'status_change' : 'updated',
        fromStatus: existing.status, toStatus: station.status,
        changedFields: { keys: Object.keys(req.body || {}) },
        actorId: req.user ? req.user.id : null, actorRole: req.user ? req.user.role : null,
        source: 'user', ip: req.ip || null
      });
    } catch { /* silent */ }
    try {
      const journeySyncService = require('../services/journeySyncService');
      const actorArgs = {
        actorId: req.user ? req.user.id : null, actorRole: req.user ? req.user.role : null,
        source: 'user', ip: req.ip || null
      };
      if (existing.status !== station.status) {
        await journeySyncService.onStationStatus(id, { from: existing.status, to: station.status, ...actorArgs });
      } else {
        const keys = Object.keys(req.body || {});
        if (keys.length > 0) await journeySyncService.onStationUpdated(id, { changedFields: { keys }, ...actorArgs });
      }
    } catch { /* silent */ }
    res.json({ success: true, data: station, message: 'Cập nhật trạm thành công' });
  } catch (error) {
    console.error('Update station error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.activity = async (req, res) => {
  try {
    const station = await stationService.getStationById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }
    const stationActivityService = require('../services/stationActivityService');
    const items = await stationActivityService.timeline(req.params.id);
    res.json({ success: true, data: items });
  } catch (error) {
    console.error('Get station activity error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.sourceProposal = async (req, res) => {
  try {
    const station = await stationService.getStationById(req.params.id);
    if (!station) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy trạm' });
    }
    const pool = require('../utils/db');
    const [rows] = await pool.query(
      'SELECT id, tracking_code, status, user_id FROM station_proposals WHERE station_id = ? ORDER BY id DESC LIMIT 1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Trạm chưa liên kết đề xuất nào' });
    }
    const adminProposalService = require('../services/adminProposalService');
    const scope = req.user.role === 'SALES'
      ? { role: 'SALES', branchIds: await adminProposalService.getBranchUserIds(req.user.id) }
      : { role: req.user.role };
    if (scope.role === 'SALES' && !scope.branchIds.includes(Number(rows[0].user_id))) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem đề xuất này' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get station source proposal error:', error);
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
