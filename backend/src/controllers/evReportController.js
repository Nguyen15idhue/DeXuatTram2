const evReportService = require("../services/evReportService");
const evReportSheetSyncService = require("../services/evReportSheetSyncService");
const proximityService = require("../services/proximityService");

exports.getAll = async (req, res) => {
  try {
    const reports = await evReportService.getPublicReports();
    // Tên/SĐT người gửi chỉ trả cho người đã đăng nhập (giống chu_tram của stations)
    if (!req.user) {
      reports.forEach((r) => { delete r.full_name; delete r.phone; });
    }
    res.json({ success: true, data: reports });
  } catch (error) {
    console.error("Get ev reports error:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

exports.getById = async (req, res) => {
  try {
    const report = await evReportService.getPublicReportById(req.params.id);
    if (!report) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy vị trí chia sẻ" });
    }
    if (!req.user) {
      delete report.full_name;
      delete report.phone;
    }
    res.json({ success: true, data: report });
  } catch (error) {
    console.error("Get ev report error:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

exports.createGuest = async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || null;
    const { report } = await evReportService.createGuestReport(req.body, ip);
    res.status(201).json({
      success: true,
      data: report,
      message: "Gửi thông tin thành công. Cảm ơn bạn đã chia sẻ!",
    });
  } catch (error) {
    console.error("Create guest ev report error:", error);
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

exports.checkNearbyPublic = async (req, res) => {
  try {
    const { latitude, longitude, radius_m = 200 } = req.body;
    const result = await proximityService.checkNearby(
      latitude,
      longitude,
      radius_m,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    return res
      .status(400)
      .json({ success: false, message: error.message || "Lỗi server" });
  }
};

exports.adminList = async (req, res) => {
  try {
    const reports = await evReportService.getAllReports({
      search: req.query.search || "",
    });
    res.json({ success: true, data: reports });
  } catch (error) {
    console.error("Admin list ev reports error:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

exports.adminGetById = async (req, res) => {
  try {
    const report = await evReportService.getReportFullById(req.params.id);
    if (!report) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy vị trí chia sẻ" });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    console.error("Admin get ev report error:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const report = await evReportService.updateReport(req.params.id, req.body);
    res.json({ success: true, data: report, message: "Cập nhật thành công" });
  } catch (error) {
    console.error("Admin update ev report error:", error);
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

exports.adminDelete = async (req, res) => {
  try {
    await evReportService.deleteReport(req.params.id);
    res.json({ success: true, message: "Xóa thành công" });
  } catch (error) {
    console.error("Admin delete ev report error:", error);
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

exports.adminCreateProposal = async (req, res) => {
  try {
    const proposal = await evReportService.createProposalFromReport(
      req.params.id,
      req.user.id,
      req.user.role || null,
    );
    const { autoInfoCompleted, ...data } = proposal;
    res.status(201).json({
      success: true,
      data,
      infoCompleted: autoInfoCompleted || null,
      message: "Tạo đề xuất từ điểm sạc thành công",
    });
  } catch (error) {
    console.error("Create proposal from ev report error:", error);
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

exports.adminSheetSyncStatus = async (req, res) => {
  try {
    const data = await evReportSheetSyncService.getStatus();
    res.json({ success: true, data });
  } catch (error) {
    console.error("Get ev report sheet sync status error:", error.message);
    res.status(500).json({
      success: false,
      message: "Không lấy được trạng thái đồng bộ Google Sheet",
    });
  }
};

exports.adminSyncSheet = async (req, res) => {
  try {
    const result = await evReportSheetSyncService.syncReports({
      triggeredBy: req.user.id,
      triggerType: "manual",
    });
    if (result.status === "SKIPPED") {
      return res.status(409).json({
        success: false,
        data: result,
        message: result.message,
      });
    }
    res.json({
      success: true,
      data: result,
      message: `Đồng bộ hoàn tất: đã thêm ${result.insertedCount} bản ghi mới`,
    });
  } catch (error) {
    console.error("Sync ev reports to Google Sheet error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Đồng bộ Google Sheet thất bại",
    });
  }
};
