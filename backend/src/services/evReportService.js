const pool = require("../utils/db");
const dynamicUtils = require("./dynamicUtils");
const dataListService = require("./dataListService");
const addressEnrichment = require("./addressEnrichment");
const proximityService = require("./proximityService");

const ENTITY = "ev_charging_reports";

const normalizePhone = (phone) => String(phone || "").replace(/[^\d]/g, "");

const verifyCaptcha = async (token, ip) => {
  if (process.env.CAPTCHA_ENABLED === "false") return true;
  const secret = process.env.TURNSTILE_SECRET_KEY || "";
  if (!token || !secret) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          response: token,
          remoteip: ip || undefined,
        }),
      },
    );
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
};

const fail = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

exports.getPublicReports = async () => {
  const [rows] = await pool.query(
    `SELECT r.id, r.latitude, r.longitude, r.address, r.province, r.ward,
            r.created_at,
            JSON_UNQUOTE(JSON_EXTRACT(r.custom_data, '$.hang_xe')) AS hang_xe
       FROM ev_charging_reports r
      ORDER BY r.created_at DESC
      LIMIT 20000`,
  );
  return rows;
};

exports.getPublicReportById = async (id) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.latitude, r.longitude, r.address, r.province, r.ward,
            r.created_at,
            JSON_UNQUOTE(JSON_EXTRACT(r.custom_data, '$.hang_xe')) AS hang_xe
       FROM ev_charging_reports r
      WHERE r.id = ?`,
    [id],
  );
  if (rows.length === 0) return null;
  return rows[0];
};

exports.getAllReports = async ({ search = "" } = {}) => {
  const conds = [];
  const params = [];
  if (search) {
    conds.push(
      "(r.full_name LIKE ? OR r.phone LIKE ? OR r.address LIKE ? OR r.province LIKE ?)",
    );
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT r.*, JSON_UNQUOTE(JSON_EXTRACT(r.custom_data, '$.hang_xe')) AS hang_xe
       FROM ev_charging_reports r ${where} ORDER BY r.created_at DESC LIMIT 500`,
    params,
  );
  return rows;
};

exports.getReportFullById = async (id) => {
  const [rows] = await pool.query(
    "SELECT * FROM ev_charging_reports WHERE id = ?",
    [id],
  );
  if (rows.length === 0) return null;
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity(ENTITY);
  return dynamicUtils.mergeData(rows[0], fieldDefs);
};

exports.createGuestReport = async (data, ip) => {
  if (data && data.website) fail("Dữ liệu không hợp lệ");

  const captchaOk = await verifyCaptcha(data ? data.captcha_token : null, ip);
  if (!captchaOk) fail("Xác thực captcha thất bại");

  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity(ENTITY);
  const { fixedData, dynamicData } = dynamicUtils.splitData(
    ENTITY,
    data,
    fieldDefs,
  );

  const phone = normalizePhone(fixedData.phone);
  if (!phone) fail("Số điện thoại là bắt buộc");
  if (!/^0(3|5|7|8|9)\d{8}$/.test(phone))
    fail("Số điện thoại phải là số di động Việt Nam 10 chữ số");
  fixedData.phone = phone;

  const lat = Number(fixedData.latitude);
  const lng = Number(fixedData.longitude);
  if (
    isNaN(lat) ||
    lat < -90 ||
    lat > 90 ||
    isNaN(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    fail("Tọa độ không hợp lệ");
  }

  if (!fixedData.province) {
    await addressEnrichment
      .enrichDynamicData({ dynamicData, fixedData })
      .catch(() => {});
  }
  const geoInput = { ...dynamicData, province: fixedData.province };
  await dataListService.applyDiaGioi(geoInput);
  fixedData.province_code = geoInput.ma_tinh || "";
  if (geoInput.vung_mien) dynamicData.vung_mien = geoInput.vung_mien;

  const customData =
    Object.keys(dynamicData).length > 0 ? JSON.stringify(dynamicData) : null;
  const [result] = await pool.query(
    `INSERT INTO ev_charging_reports (full_name, phone, latitude, longitude, address, province, ward, province_code, custom_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fixedData.full_name || "",
      phone,
      fixedData.latitude,
      fixedData.longitude,
      fixedData.address || "",
      fixedData.province || "",
      fixedData.ward || "",
      fixedData.province_code || fixedData.ma_tinh || "",
      customData,
    ],
  );
  const recordId = result.insertId;

  const [rows] = await pool.query(
    "SELECT * FROM ev_charging_reports WHERE id = ?",
    [recordId],
  );
  const finalData = dynamicUtils.mergeData(rows[0], fieldDefs);

  return { report: finalData };
};

exports.updateReport = async (id, data) => {
  const [rows] = await pool.query(
    "SELECT * FROM ev_charging_reports WHERE id = ?",
    [id],
  );
  if (rows.length === 0) fail("Không tìm thấy vị trí chia sẻ", 404);
  const fieldDefs = await dynamicUtils.getFieldDefinitionsByEntity(ENTITY);
  const { fixedData, dynamicData } = dynamicUtils.splitData(
    ENTITY,
    data,
    fieldDefs,
  );
  if (fixedData.phone !== undefined) {
    const phone = normalizePhone(fixedData.phone);
    if (phone && !/^0(3|5|7|8|9)\d{8}$/.test(phone))
      fail("Số điện thoại phải là số di động Việt Nam 10 chữ số");
    fixedData.phone = phone;
  }
  const sets = [];
  const params = [];
  [
    "full_name",
    "phone",
    "address",
    "province",
    "ward",
    "province_code",
  ].forEach((k) => {
    if (fixedData[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(fixedData[k]);
    }
  });
  if (Object.keys(dynamicData).length > 0) {
    let current = {};
    try {
      current =
        typeof rows[0].custom_data === "string"
          ? JSON.parse(rows[0].custom_data)
          : rows[0].custom_data || {};
    } catch {
      current = {};
    }
    sets.push("custom_data = ?");
    params.push(JSON.stringify({ ...current, ...dynamicData }));
  }
  if (sets.length > 0) {
    params.push(id);
    await pool.query(
      `UPDATE ev_charging_reports SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  }
  return exports.getReportFullById(id);
};

exports.deleteReport = async (id) => {
  const [rows] = await pool.query(
    "SELECT id FROM ev_charging_reports WHERE id = ?",
    [id],
  );
  if (rows.length === 0) fail("Không tìm thấy vị trí chia sẻ", 404);
  await pool.query("DELETE FROM ev_charging_reports WHERE id = ?", [id]);
  return true;
};

exports.createProposalFromReport = async (id, userId, actorRole) => {
  const [rows] = await pool.query(
    "SELECT * FROM ev_charging_reports WHERE id = ?",
    [id],
  );
  if (rows.length === 0) fail("Không tìm thấy vị trí chia sẻ", 404);
  const r = rows[0];
  let cd = {};
  try {
    cd =
      typeof r.custom_data === "string"
        ? JSON.parse(r.custom_data)
        : r.custom_data || {};
  } catch {
    cd = {};
  }
  const proposalService = require("./proposalService");
  const proposal = await proposalService.createProposal(
    userId,
    {
      latitude: r.latitude,
      longitude: r.longitude,
      address: r.address || "",
      province: r.province || "",
      ward: r.ward || "",
      owner_name: r.full_name || "",
      owner_phone: r.phone || "",
      description: `Tạo từ điểm sạc #${r.id} (hãng ${cd.hang_xe || "—"})`,
    },
    { actorRole: actorRole || null },
  );
  return proposal;
};
