const fs = require("fs");
const { google } = require("googleapis");
const pool = require("../utils/db");

const HEADERS = [
  "Mã nhu cầu",
  "Ngày gửi",
  "Họ và tên",
  "Số điện thoại",
  "Địa chỉ",
  "Phường/Xã",
  "Tỉnh/Thành phố",
  "Miền",
  "Hãng xe",
  "Nhóm phương tiện",
  "Nhu cầu hợp tác lắp trạm",
  "Google Maps",
];
const DB_BATCH_SIZE = 500;
const SHEET_BATCH_SIZE = 500;
const LOCK_NAME = "ev_report_google_sheet_sync";

const getConfig = () => {
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  const missing = [];
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    missing.push("Spreadsheet ID chưa được cấu hình");
  }
  if (!process.env.GOOGLE_SHEETS_TAB_NAME) {
    missing.push("Tên tab Google Sheet chưa được cấu hình");
  }
  if (!credentialsFile || !fs.existsSync(credentialsFile)) {
    missing.push("Không tìm thấy file service account trong backend");
  }
  return {
    configured: missing.length === 0,
    message: missing.join("; "),
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "",
    tabName: process.env.GOOGLE_SHEETS_TAB_NAME || "",
    credentialsFile,
    cron: String(process.env.EV_REPORT_SHEET_SYNC_CRON || "0 7 * * *").trim(),
  };
};

const getSpreadsheetUrl = (spreadsheetId) =>
  spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`
    : "";

const quoteTab = (tabName) => `'${String(tabName).replace(/'/g, "''")}'`;

const parseCustomData = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

const stringifyCell = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join(", ");
  if (typeof value === "object") {
    if (value.label !== undefined) return stringifyCell(value.label);
    if (value.value !== undefined) return stringifyCell(value.value);
    return "";
  }
  const text = String(value).trim();
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      return stringifyCell(JSON.parse(text));
    } catch {
      return text;
    }
  }
  return text;
};

const mapReportToRow = (report) => {
  const customData = parseCustomData(report.custom_data);
  const mapUrl =
    report.latitude !== null &&
    report.latitude !== undefined &&
    report.longitude !== null &&
    report.longitude !== undefined
      ? `https://www.google.com/maps?q=${encodeURIComponent(
          `${report.latitude},${report.longitude}`,
        )}`
      : "";
  return [
    String(report.id),
    report.submitted_at || "",
    report.full_name || "",
    report.phone || "",
    report.address || "",
    report.ward || "",
    report.province || "",
    stringifyCell(customData.vung_mien),
    stringifyCell(customData.hang_xe),
    stringifyCell(customData.nhom_phuong_tien),
    stringifyCell(customData.hop_tac_lap_tram),
    mapUrl,
  ];
};

const createSheetsClient = async (config) => {
  if (!config.configured) {
    const error = new Error(config.message || "Google Sheet chưa được cấu hình");
    error.statusCode = 503;
    throw error;
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: config.credentialsFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth: await auth.getClient() });
};

const assertHeader = async (sheets, config, tab) => {
  const range = `${tab}!A1:L1`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });
  const existing = (response.data.values?.[0] || []).map((value) =>
    String(value || "").trim(),
  );
  if (existing.every((value) => !value)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
    return;
  }
  const matches = HEADERS.every((header, index) => existing[index] === header);
  if (!matches) {
    throw new Error(
      `Header không khớp. Hãy đặt các cột A–L lần lượt là: ${HEADERS.join(" | ")}`,
    );
  }
};

const readExistingIds = async (sheets, config, tab) => {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${tab}!A2:L`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = response.data.values || [];
  const existingIds = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((cell) => String(cell ?? "").trim())) continue;
    const id = String(row[0] ?? "").trim();
    if (!/^\d+$/.test(id)) {
      throw new Error(
        `Dòng ${index + 2} có dữ liệu nhưng cột "Mã nhu cầu" trống hoặc không hợp lệ. Hãy bổ sung ID trước khi đồng bộ.`,
      );
    }
    existingIds.add(id);
  }
  return existingIds;
};

const appendRows = async (sheets, config, tab, rows) => {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${tab}!A:L`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
};

const updateRun = async (id, fields) => {
  const entries = Object.entries(fields);
  const assignments = entries.map(([key]) => `\`${key}\` = ?`).join(", ");
  await pool.query(
    `UPDATE ev_report_sheet_sync_runs SET ${assignments} WHERE id = ?`,
    [...entries.map(([, value]) => value), id],
  );
};

const syncReports = async ({ triggeredBy = null, triggerType = "manual" } = {}) => {
  const [runResult] = await pool.query(
    `INSERT INTO ev_report_sheet_sync_runs
       (trigger_type, status, triggered_by, started_at)
     VALUES (?, 'RUNNING', ?, NOW())`,
    [triggerType, triggeredBy],
  );
  const runId = runResult.insertId;
  let connection = null;
  let lockAcquired = false;
  let scannedCount = 0;
  let insertedCount = 0;

  try {
    connection = await pool.getConnection();
    const [lockRows] = await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [
      LOCK_NAME,
    ]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      const completedAt = new Date();
      await updateRun(runId, {
        status: "SKIPPED",
        error_message: "Một lượt đồng bộ khác đang chạy",
        completed_at: completedAt,
      });
      return {
        runId,
        status: "SKIPPED",
        scannedCount,
        insertedCount,
        skippedCount: 0,
        message: "Một lượt đồng bộ khác đang chạy",
      };
    }

    const config = getConfig();
    const sheets = await createSheetsClient(config);
    const tab = quoteTab(config.tabName);
    await assertHeader(sheets, config, tab);
    const existingIds = await readExistingIds(sheets, config, tab);
    let lastId = 0;
    let pendingRows = [];

    while (true) {
      const [reports] = await pool.query(
        `SELECT id, full_name, phone, latitude, longitude, address, province, ward,
                DATE_FORMAT(created_at, '%d/%m/%Y %H:%i') AS submitted_at,
                custom_data
           FROM ev_charging_reports
          WHERE id > ?
            AND JSON_UNQUOTE(JSON_EXTRACT(custom_data, '$.hop_tac_lap_tram')) = 'Có'
          ORDER BY id ASC
          LIMIT ?`,
        [lastId, DB_BATCH_SIZE],
      );
      if (reports.length === 0) break;

      for (const report of reports) {
        lastId = report.id;
        scannedCount += 1;
        const id = String(report.id);
        if (existingIds.has(id)) continue;
        pendingRows.push(mapReportToRow(report));
        existingIds.add(id);
        if (pendingRows.length >= SHEET_BATCH_SIZE) {
          await appendRows(sheets, config, tab, pendingRows);
          insertedCount += pendingRows.length;
          pendingRows = [];
        }
      }
    }
    if (pendingRows.length > 0) {
      await appendRows(sheets, config, tab, pendingRows);
      insertedCount += pendingRows.length;
    }

    const completedAt = new Date();
    await updateRun(runId, {
      status: "SUCCESS",
      scanned_count: scannedCount,
      inserted_count: insertedCount,
      skipped_count: scannedCount - insertedCount,
      completed_at: completedAt,
      error_message: null,
    });
    return {
      runId,
      status: "SUCCESS",
      scannedCount,
      insertedCount,
      skippedCount: scannedCount - insertedCount,
      completedAt,
    };
  } catch (error) {
    try {
      await updateRun(runId, {
        status: "FAILED",
        scanned_count: scannedCount,
        inserted_count: insertedCount,
        skipped_count: scannedCount - insertedCount,
        completed_at: new Date(),
        error_message: String(error.message || "Lỗi đồng bộ").slice(0, 1000),
      });
    } catch (logError) {
      console.error("[EvReportSheetSync] could not update failed run:", logError.message);
    }
    throw error;
  } finally {
    if (connection && lockAcquired) {
      await connection
        .query("SELECT RELEASE_LOCK(?)", [LOCK_NAME])
        .catch((error) =>
          console.error("[EvReportSheetSync] release lock error:", error.message),
        );
    }
    if (connection) connection.release();
  }
};

const getStatus = async () => {
  const config = getConfig();
  const [rows] = await pool.query(
    `SELECT id, trigger_type, status, scanned_count, inserted_count, skipped_count,
            started_at, completed_at, error_message
       FROM ev_report_sheet_sync_runs
      ORDER BY id DESC
      LIMIT 1`,
  );
  return {
    configured: config.configured,
    message: config.message,
    spreadsheetUrl: getSpreadsheetUrl(config.spreadsheetId),
    tabName: config.tabName,
    cron: config.cron,
    lastRun: rows[0] || null,
  };
};

exports.getConfig = getConfig;
exports.getStatus = getStatus;
exports.syncReports = syncReports;
exports.HEADERS = HEADERS;
exports.mapReportToRow = mapReportToRow;
