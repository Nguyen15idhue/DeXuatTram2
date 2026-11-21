const { google } = require("googleapis");
const { setTimeout: sleep } = require("node:timers/promises");
const cmsApi = require("./cmsApiService");
const reports = require("./cmsReportService");

const TAB_NAME_DEFAULT = "thong_tin_xe";
const HEADERS = [
  "Mã xe",
  "Biển số",
  "Tên khách hàng",
  "Mã KH CMS",
  "Trạng thái",
  "Loại phương tiện",
  "Hãng xe",
  "Dòng xe",
  "Dung lượng pin (kWh)",
  "Số khung",
  "Mã ID Tag",
  "Chế độ sạc",
  "Mã MAC/EVCC",
  "Ngày tạo",
  "Ngày cập nhật",
];
let running = false;

const error = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const sheetCall = async (request) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await request();
    } catch (cause) {
      const status = Number(cause.response?.status || cause.code);
      if ((status === 429 || status >= 500 || !status) && attempt < 2) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw error(
        `Không ghi/đọc được Google Sheet${status ? ` (HTTP ${status})` : ""}. Kiểm tra cấu hình và quyền service account.`,
        502,
      );
    }
  }
};

const openSheet = async (config) => {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.credentialsFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  let sheets;
  try {
    sheets = google.sheets({
      version: "v4",
      auth: await auth.getClient(),
      timeout: 30000,
      retry: false,
    });
  } catch {
    throw error("Không đọc được service account Google Sheets", 503);
  }
  const meta = await sheetCall(() =>
    sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
      fields: "sheets.properties",
    }),
  );
  let properties = meta.data.sheets?.find(
    (sheet) =>
      sheet.properties?.title?.toLowerCase() === config.tabName.toLowerCase(),
  )?.properties;
  if (!properties) {
    const added = await sheetCall(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: config.tabName } } }],
        },
      }),
    );
    properties = added.data.replies[0].addSheet.properties;
  }
  const tab = `'${(properties.title || config.tabName).replace(/'/g, "''")}'`;
  return { sheets, tab, properties };
};

const getConfig = () => {
  const base = reports.getConfig();
  const tabName = String(
    process.env.CMS_VEHICLE_SHEET_TAB_NAME || TAB_NAME_DEFAULT,
  ).trim();
  const missing = [];
  if (!base.configured)
    missing.push(base.message || "Thiếu cấu hình CMS/Google Sheet");
  if (!tabName || tabName.length > 100 || /[:\\/?*[\]]/.test(tabName))
    missing.push("tab thong_tin_xe hợp lệ");
  return {
    configured: missing.length === 0,
    message: missing.length ? missing.join("; ") : "",
    spreadsheetId: base.spreadsheetId,
    tabName,
    credentialsFile: base.credentialsFile,
  };
};

const projectVehicle = (row) => ({
  vehicleId: row.vehicleId,
  plate: row.plate ?? null,
  customerName: row.customerName ?? null,
  customerCode: row.userId == null ? null : row.userId,
  status: row.status ?? null,
  vehicleType: row.vehicleType ?? null,
  brand: row.brand ?? null,
  model: row.model ?? null,
  batteryCapacity: row.batteryCapacity ?? null,
  vinNumber: row.vinNumber ?? null,
  idTag: row.idTag ?? null,
  autoCharge:
    row.autoCharge === true
      ? "Tự động"
      : row.autoCharge === false
        ? "Thủ công"
        : "",
  evcc: row.evcc ?? null,
  createdAt: row.createdAt ?? null,
  updatedAt: row.updatedAt ?? null,
});

const toRow = (v) => [
  v.vehicleId,
  v.plate,
  v.customerName,
  v.customerCode,
  v.status,
  v.vehicleType,
  v.brand,
  v.model,
  v.batteryCapacity,
  v.vinNumber,
  v.idTag,
  v.autoCharge,
  v.evcc,
  v.createdAt,
  v.updatedAt,
];

const createVehicleSheetWriter = async (config) => {
  const { sheets, tab, properties } = await openSheet({
    ...config,
    tabName: config.tabName,
  });
  const { spreadsheetId } = config;
  let { rowCount } = properties.gridProperties;
  const { columnCount } = properties.gridProperties;
  if (columnCount < HEADERS.length) {
    await sheetCall(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              appendDimension: {
                sheetId: properties.sheetId,
                dimension: "COLUMNS",
                length: HEADERS.length - columnCount,
              },
            },
          ],
        },
      }),
    );
  }
  const { data } = await sheetCall(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A:${String.fromCharCode(64 + Math.min(columnCount, HEADERS.length))}`,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
  );
  const rows = data.values || [];
  const isEmpty = (row) =>
    row.every((cell) => String(cell ?? "").trim() === "");
  const hasData = rows.some((row) => !isEmpty(row));
  const headersMatch = HEADERS.every((header, i) => rows[0]?.[i] === header);
  if (hasData && !headersMatch) {
    throw error(
      `Header ${config.tabName}!A1:O1 không khớp; không ghi đè tab. Hãy dùng tab riêng.`,
      409,
    );
  }
  const index = new Map();
  for (let i = 1; i < rows.length; i++) {
    if (isEmpty(rows[i])) continue;
    const id = String(rows[i][0] ?? "").trim();
    if (!id) throw error(`${config.tabName}!A${i + 1} thiếu mã xe.`, 409);
    if (index.has(id))
      throw error(
        `${config.tabName}: mã xe trùng tại A${index.get(id).number} và A${i + 1}.`,
        409,
      );
    index.set(id, { number: i + 1, values: rows[i] });
  }
  if (!headersMatch) {
    await sheetCall(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1:O1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS] },
      }),
    );
  }
  let nextRow = Math.max(2, rows.length + 1);
  let rowCountState = rowCount;
  return {
    async write(vehicles) {
      const ids = new Set();
      for (const v of vehicles) {
        const id = String(v.vehicleId ?? "").trim();
        if (!id) throw error("CMS trả mã xe trống.", 502);
        if (ids.has(id)) throw error("CMS trả trùng mã xe.");
        ids.add(id);
      }
      const toAppend = vehicles.filter((v) => !index.has(String(v.vehicleId).trim()));
      const needed = nextRow + toAppend.length - 1;
      if (needed > rowCountState) {
        await sheetCall(() =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId: properties.sheetId,
                      gridProperties: { rowCount: needed },
                    },
                    fields: "gridProperties.rowCount",
                  },
                },
              ],
            },
          }),
        );
        rowCountState = needed;
      }
      const data = [];
      const changes = [];
      let updated = 0;
      for (const v of vehicles) {
        const existing = index.get(String(v.vehicleId).trim());
        if (!existing) continue;
        const values = toRow(v);
        let changed = false;
        for (let i = 1; i < values.length; i++) {
          const value = values[i];
          if (value == null || (typeof value === "string" && !value.trim())) continue;
          if (String(existing.values[i] ?? "") === String(value)) continue;
          const column = String.fromCharCode(65 + i);
          data.push({ range: `${tab}!${column}${existing.number}`, values: [[value]] });
          changes.push({ existing, column: i, value });
          changed = true;
        }
        if (changed) updated++;
      }
      data.push(...toAppend.map((v, i) => ({
        range: `${tab}!A${nextRow + i}:O${nextRow + i}`,
        values: [toRow(v).map((value) => value ?? "")],
      })));
      for (let i = 0; i < data.length; i += 500) {
        try {
          await sheetCall(() =>
            sheets.spreadsheets.values.batchUpdate({
              spreadsheetId,
              requestBody: { valueInputOption: "RAW", data: data.slice(i, i + 500) },
            }),
          );
        } catch (cause) {
          cause.message += " Một phần dữ liệu có thể đã ghi; hãy chạy lại sau khi khắc phục.";
          throw cause;
        }
      }
      changes.forEach(({ existing, column, value }) => { existing.values[column] = value; });
      toAppend.forEach((v, i) => index.set(String(v.vehicleId).trim(), {
        number: nextRow + i,
        values: toRow(v),
      }));
      nextRow += toAppend.length;
      return {
        added: toAppend.length,
        updated,
        skipped: vehicles.length - toAppend.length - updated,
      };
    },
  };
};

const runVehicleSync = async ({
  from,
  to,
  all = false,
} = {}) => {
  if (running) throw error("Đồng bộ danh sách xe đang chạy. Vui lòng thử lại sau.", 409);
  running = true;
  try {
    const config = getConfig();
    if (!config.configured) throw error(config.message || "Chưa cấu hình CMS/Google Sheet", 503);
    if (!all) {
      const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
      if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
        throw error("Khoảng ngày xe không hợp lệ");
      }
    }
    const client = cmsApi.createClient();
    await client.renewKey();
    const allVehicles = await client.getVehicles();
    let filtered = allVehicles;
    if (!all) {
      const start = from || (to ? "" : reports.yesterday());
      const end = to || (from ? "" : start);
      filtered = allVehicles.filter((v) => {
        const date = new Date(v.createdAt || "");
        if (!Number.isFinite(date.getTime())) throw error("CMS trả ngày tạo xe không hợp lệ", 502);
        const d = reports.dayKey(date);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }
    const writer = await createVehicleSheetWriter(config);
    const result = await writer.write(filtered.map(projectVehicle));
    return {
      total: allVehicles.length,
      filtered: filtered.length,
      ...result,
    };
  } finally {
    running = false;
  }
};

module.exports = {
  getConfig,
  createVehicleSheetWriter,
  runVehicleSync,
  HEADERS,
};
