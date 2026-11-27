const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { setTimeout: sleep } = require("node:timers/promises");
const { google } = require("googleapis");
const cmsApi = require("./cmsApiService");

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const DAY_MS = 86400000;
const SHEET_EPOCH = Date.UTC(1899, 11, 30);
const MAX_SHEET_DATE = (Date.UTC(9999, 11, 31) - SHEET_EPOCH) / DAY_MS;
const RAW_TAB = "Phien_sac_raw";
const RAW_HEADERS = [
  "Ma_phien_sac", "Ngay_sac", "Thang_sac", "Thoi_gian_bat_dau",
  "Thoi_gian_ket_thuc", "Thoi_luong_gio", "Ma_tram_sac", "Ten_tram_sac",
  "Tru_sac", "Sung_sac", "Ma_khach_hang", "Bien_so_xe", "Tong_kWh",
  "Doanh_thu_sau_giam_VAT", "Trang_thai",
  "Ma_phien_hien_thi", "Thoi_gian_ket_thuc_dat_cho", "Dong_xe",
  "SOC_bat_dau_pct", "SOC_ket_thuc_pct", "Trang_thai_xuat_hoa_don",
];
const RAW_LEGACY_COLUMNS = 15;
const RAW_STATUS = new Map([
  ["CHARGING", "Đang sạc"], ["FINISHED", "Đã kết thúc"], ["CANCELLED", "Đã hủy"],
]);
const rawTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const HEADERS = [
  "Ngày báo cáo",
  "Thời điểm lấy",
  "Số trụ cũ",
  "Số trụ mới",
  "Tổng trụ sạc",
  "Trụ hoạt động",
  "Trụ không hoạt động",
  "Phiên sạc trụ cũ",
  "Phiên sạc trụ mới",
  "Tổng phiên sạc",
  "Phiên/trụ/ngày - cũ",
  "Phiên/trụ/ngày - mới",
  "Tổng phiên/trụ/ngày",
  "Giờ sạc trụ cũ",
  "Giờ sạc trụ mới",
  "Giờ/trụ/ngày - cũ",
  "Giờ/trụ/ngày - mới",
  "Tổng giờ/trụ/ngày",
  "Doanh thu trụ cũ",
  "Doanh thu trụ mới",
  "Tổng doanh thu",
  "Khách đăng ký lũy kế",
  "Cập nhật lúc",
  "Cảnh báo dữ liệu",
];
let currentRun = null;
const error = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const dayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const offsetDay = (date, offset) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const yesterday = (now = new Date()) => offsetDay(dayKey(now), -1);
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const normalizeSheetDate = (value) => {
  if (Number.isInteger(value) && value >= 2 && value <= MAX_SHEET_DATE) {
    return new Date(SHEET_EPOCH + value * DAY_MS).toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const date = match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : text;
  return validDate(date) ? date : null;
};

const validateRange = (from, to, now = new Date(), rawOnly = false) => {
  if (!validDate(from) || !validDate(to))
    throw error("Ngày phải hợp lệ và có định dạng YYYY-MM-DD");
  if (from > to) throw error("Ngày bắt đầu không được sau ngày kết thúc");
  if (rawOnly && to > dayKey(now)) throw error("Dữ liệu raw chỉ lấy tối đa đến ngày hôm nay");
  if (!rawOnly && to > yesterday(now))
    throw error("Chỉ lấy ngày đã kết thúc, tối đa đến ngày hôm qua");
  return {
    from,
    to,
    totalDays: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
  };
};

const monthCutoff = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const lastDay = new Date(
    Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 0),
  ).getUTCDate();
  previous.setUTCDate(Math.min(day, lastDay));
  return previous.toISOString().slice(0, 10);
};
const timestamp = (value, label) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw error(`CMS thiếu hoặc sai ${label}`, 502);
  return Date.parse(value);
};
const round = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;
const aggregate = ({ date, points, customers, transactions, fetchedAt }) => {
  const groups = {
    old: { points: 0, sessions: 0, milliseconds: 0, revenue: 0 },
    new: { points: 0, sessions: 0, milliseconds: 0, revenue: 0 },
  };
  const pointGroups = new Map();
  const excludedPointIds = new Set();
  let active = 0;
  let inactive = 0;
  let excludedMissingEnd = 0;
  const cutoff = monthCutoff(date);
  for (const point of points) {
    const created = dayKey(
      new Date(timestamp(point.createdAt, "ngày tạo trụ")),
    );
    if (created > date) continue;
    // Loại trừ trụ 3kW (xe máy điện) khỏi mọi thống kê.
    if (Number(point.power) === 3000) {
      excludedPointIds.add(String(point.id));
      continue;
    }
    if (![0, 1].includes(point.connected))
      throw error("CMS trả trạng thái kết nối trụ không hợp lệ", 502);
    const group = created >= cutoff ? "new" : "old";
    if (pointGroups.has(point.id)) throw error("CMS trả trụ trùng ID", 502);
    pointGroups.set(point.id, group);
    groups[group].points++;
    if (point.connected === 1) active++;
    else inactive++;
  }
  for (const transaction of transactions) {
    if (transaction.status !== "FINISHED") continue;
    const start = timestamp(transaction.startTime, "thời gian bắt đầu phiên");
    if (dayKey(new Date(start)) !== date) continue;
    if (!(transaction.totalCost > 0)) continue;
    const group = pointGroups.get(transaction.pointId);
    if (!group) {
      // Bỏ qua phiên của trụ 3kW (đã loại khỏi thống kê).
      if (excludedPointIds.has(String(transaction.pointId))) continue;
      throw error(
        "Phiên FINISHED có trụ không nằm trong danh mục CMS của ngày báo cáo",
        502,
      );
    }
    if (transaction.endTime == null || transaction.endTime === "") {
      excludedMissingEnd++;
      continue;
    }
    const end = timestamp(transaction.endTime, "thời gian kết thúc phiên");
    if (
      end < start ||
      typeof transaction.totalCost !== "number" ||
      !Number.isFinite(transaction.totalCost) ||
      transaction.totalCost < 0
    )
      throw error("CMS trả thời lượng hoặc doanh thu phiên không hợp lệ", 502);
    groups[group].sessions++;
    groups[group].milliseconds += end - start;
    groups[group].revenue += transaction.totalCost;
  }
  const customerCount = customers.reduce(
    (count, customer) =>
      count +
      (dayKey(new Date(timestamp(customer.createdAt, "ngày tạo khách hàng"))) <=
      date
        ? 1
        : 0),
    0,
  );
  const { old, new: recent } = groups;
  const average = (value, count) => (count ? round(value / count) : "N/A");
  const totalPoints = old.points + recent.points;
  const totalSessions = old.sessions + recent.sessions;
  const totalMs = old.milliseconds + recent.milliseconds;
  const totalRevenue = round(old.revenue + recent.revenue);
  return [
    date,
    fetchedAt,
    old.points,
    recent.points,
    totalPoints,
    active,
    inactive,
    old.sessions,
    recent.sessions,
    totalSessions,
    average(old.sessions, old.points),
    average(recent.sessions, recent.points),
    average(totalSessions, totalPoints),
    round(old.milliseconds / 3600000),
    round(recent.milliseconds / 3600000),
    average(old.milliseconds / 3600000, old.points),
    average(recent.milliseconds / 3600000, recent.points),
    average(totalMs / 3600000, totalPoints),
    round(old.revenue),
    round(recent.revenue),
    totalRevenue,
    customerCount,
    new Date().toISOString(),
    excludedMissingEnd
      ? `Đã loại ${excludedMissingEnd} phiên FINISHED thiếu thời gian kết thúc khỏi tất cả chỉ số phiên sạc`
      : "",
  ];
};

const getConfig = () => {
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  const spreadsheetId = String(
    process.env.CMS_GOOGLE_SHEETS_SPREADSHEET_ID || "",
  ).trim();
  const tabName = String(
    process.env.CMS_GOOGLE_SHEETS_TAB_NAME || "Thống kê phiên sạc",
  ).trim();
  const rawEnabled = process.env.CMS_RAW_SHEET_ENABLED === "true";
  const missing = [];
  if (!String(process.env.CMS_API_KEY || "").trim())
    missing.push("CMS_API_KEY");
  if (!/^[\w-]+$/.test(spreadsheetId))
    missing.push("CMS_GOOGLE_SHEETS_SPREADSHEET_ID (chỉ ID, không phải URL)");
  if (!tabName || tabName.length > 100 || /[:\\/?*[\]]/.test(tabName))
    missing.push("CMS_GOOGLE_SHEETS_TAB_NAME hợp lệ");
  if (tabName.toLowerCase() === RAW_TAB.toLowerCase())
    missing.push(`tab tổng hợp phải khác ${RAW_TAB}`);
  if (!credentialsFile || !fs.existsSync(credentialsFile))
    missing.push("file GOOGLE_APPLICATION_CREDENTIALS");
  return {
    configured: missing.length === 0,
    message: missing.length ? `Thiếu cấu hình: ${missing.join(", ")}` : "",
    spreadsheetId,
    tabName,
    rawEnabled,
    credentialsFile,
  };
};
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
    (sheet) => sheet.properties?.title?.toLowerCase() === config.tabName.toLowerCase(),
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
const createSheetWriter = async (config) => {
  const { sheets, tab, properties } = await openSheet(config);
  const { columnCount, rowCount: initialRowCount } = properties.gridProperties;
  if (columnCount < 24) {
    throw error("Tab báo cáo CMS cần có ít nhất các cột A:X.", 409);
  }
  const existing = await sheetCall(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${tab}!A:${String.fromCharCode(64 + Math.min(columnCount, 26))}`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    }),
  );
  const rows = existing.data.values || [];
  const header = (rows[0] || []).slice(0, HEADERS.length);
  if (
    rows.length &&
    (header.length !== HEADERS.length ||
      !HEADERS.every((value, i) => header[i] === value))
  ) {
    throw error(
      "Header Google Sheet không khớp báo cáo CMS; hãy dùng tab riêng, không ghi đè tab dữ liệu khác.",
      409,
    );
  }
  const rowByDate = new Map();
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].slice(0, HEADERS.length).every((cell) => String(cell ?? "").trim() === "")) continue;
    const raw = rows[index][0];
    const rowNumber = index + 1;
    const date = normalizeSheetDate(raw);
    if (!date) {
      const message = String(raw ?? "").trim() === ""
        ? "đang trống. Hãy điền ngày báo cáo."
        : "không phải ngày hợp lệ. Hãy nhập theo dd/MM/yyyy hoặc yyyy-MM-dd.";
      throw error(`Ô A${rowNumber} ${message}`, 409);
    }
    if (rowByDate.has(date)) {
      throw error(
        `Ngày báo cáo ${date} bị trùng tại ô A${rowByDate.get(date).rowNumber} và A${rowNumber}. Hãy chỉ giữ một dòng cho ngày này.`,
        409,
      );
    }
    rowByDate.set(date, { rowNumber, existing: true });
  }

  if (!rows.length) {
    await sheetCall(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${tab}!A1:X1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS] },
      }),
    );
  }
  let nextRow = Math.max(2, rows.length + 1);
  let rowCount = initialRowCount;
  return {
    async write(row) {
      const date = row[0];
      let entry = rowByDate.get(date);
      if (!entry) {
        entry = { rowNumber: nextRow++, existing: false };
        rowByDate.set(date, entry);
      }
      const { rowNumber } = entry;
      if (rowNumber > rowCount) {
        const targetCount = Math.max(rowNumber, rowCount + 500);
        await sheetCall(() =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId: config.spreadsheetId,
            requestBody: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId: properties.sheetId,
                      gridProperties: { rowCount: targetCount },
                    },
                    fields: "gridProperties.rowCount",
                  },
                },
              ],
            },
          }),
        );
        rowCount = targetCount;
      }
      if (!entry.existing) {
        await sheetCall(() =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId: config.spreadsheetId,
            requestBody: {
              requests: [{
                repeatCell: {
                  range: {
                    sheetId: properties.sheetId,
                    startRowIndex: rowNumber - 1,
                    endRowIndex: rowNumber,
                    startColumnIndex: 0,
                    endColumnIndex: 1,
                  },
                  cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/MM/yyyy" } } },
                  fields: "userEnteredFormat.numberFormat",
                },
              }],
            },
          }),
        );
      }
      await sheetCall(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId: config.spreadsheetId,
          range: `${tab}!${entry.existing ? "B" : "A"}${rowNumber}:X${rowNumber}`,
          valueInputOption: "RAW",
          requestBody: {
            values: [entry.existing
              ? row.slice(1, HEADERS.length)
              : [(Date.parse(`${date}T00:00:00Z`) - SHEET_EPOCH) / DAY_MS, ...row.slice(1, HEADERS.length)]],
          },
        }),
      );
      entry.existing = true;
    },
  };
};

const optionalText = value => typeof value === "string" && value.trim() ? value.trim() : null;
const optionalNumber = (value, max = Infinity) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

const buildRawRows = (from, transactions, to = from) => {
  const rows = [];
  for (const transaction of transactions) {
    const start = timestamp(transaction.startTime, "thời gian bắt đầu phiên raw");
    const date = dayKey(new Date(start));
    if (date < from || date > to) continue;
    const end = transaction.endTime == null || transaction.endTime === ""
      ? null
      : timestamp(transaction.endTime, "thời gian kết thúc phiên raw");
    if (end !== null && end < start) throw error("Thời gian kết thúc phiên raw trước giờ bắt đầu");
    if (!/^[A-Za-z0-9_ -]+$/.test(transaction.id || ""))
      throw error("CMS trả mã phiên raw thiếu hoặc không hợp lệ");
    if (!/^[A-Z_0-9]+$/.test(transaction.status || ""))
      throw error("CMS trả trạng thái phiên raw thiếu hoặc không hợp lệ");
    const energy = optionalNumber(transaction.energyWh);
    const reservationEnd = transaction.reservationEndTime == null || transaction.reservationEndTime === ""
      ? null
      : rawTime.format(timestamp(transaction.reservationEndTime, "giờ kết thúc đặt chỗ")).replace(",", "");
    rows.push([
      transaction.id, date, `${date.slice(5, 7)}/${date.slice(0, 4)}`,
      rawTime.format(start).replace(",", ""), end === null ? "" : rawTime.format(end).replace(",", ""),
      end === null ? "" : (end - start) / 3600000,
      optionalText(transaction.stationCode), optionalText(transaction.stationName), optionalText(transaction.pointName),
      optionalText(transaction.connectorName), transaction.userId == null ? null : transaction.userId, optionalText(transaction.plate), energy === null ? null : energy / 1000,
      optionalNumber(transaction.totalCost),
      RAW_STATUS.get(transaction.status) ?? transaction.status,
      optionalText(transaction.code), reservationEnd, optionalText(transaction.vehicleModel),
      optionalNumber(transaction.startSoc, 100), optionalNumber(transaction.endSoc, 100),
      transaction.invoiced === true ? "Đã xuất" : transaction.invoiced === false ? "Chưa xuất" : null,
    ]);
  }
  return rows;
};

const createRawSheetWriter = async (config) => {
  const { sheets, tab, properties } = await openSheet({ ...config, tabName: RAW_TAB });
  const { spreadsheetId } = config;
  let { rowCount } = properties.gridProperties;
  const { columnCount } = properties.gridProperties;
  if (columnCount < RAW_LEGACY_COLUMNS)
    throw error(`${RAW_TAB} cần có đủ các cột A:O.`, 409);

  const { data } = await sheetCall(() => sheets.spreadsheets.values.get({
    spreadsheetId, range: `${tab}!A:${String.fromCharCode(64 + Math.min(columnCount, RAW_HEADERS.length))}`,
    valueRenderOption: "FORMULA",
  }));
  const rows = data.values || [];
  const isEmpty = row => row.every(cell => String(cell ?? "").trim() === "");
  const hasData = rows.some(row => !isEmpty(row));
  const headersMatch = RAW_HEADERS.every((header, i) => rows[0]?.[i] === header);
  const legacyMatch = RAW_HEADERS.slice(0, RAW_LEGACY_COLUMNS).every((header, i) => rows[0]?.[i] === header);
  if (hasData && !headersMatch && (!legacyMatch ||
      rows.some(row => !isEmpty(row.slice(RAW_LEGACY_COLUMNS))))) {
    throw error(`Header ${RAW_TAB}!A1:U1 không khớp hoặc vùng P:U đã có dữ liệu; không ghi đè tab.`, 409);
  }
  const index = new Map();
  for (let i = 1; i < rows.length; i++) {
    if (isEmpty(rows[i])) continue;
    const id = String(rows[i][0] ?? "").trim();
    const rowNumber = i + 1;
    if (!id) throw error(`${RAW_TAB}!A${rowNumber} thiếu mã phiên.`, 409);
    if (!/^[A-Za-z0-9_ -]+$/.test(id))
      throw error(`${RAW_TAB}!A${rowNumber} không phải mã phiên hợp lệ.`, 409);
    if (index.has(id))
      throw error(`${RAW_TAB}: mã phiên trùng tại ô A${index.get(id).rowNumber} và A${rowNumber}.`, 409);
    index.set(id, { rowNumber, existing: true });
  }
  if (columnCount < RAW_HEADERS.length) {
    await sheetCall(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId, requestBody: { requests: [{ appendDimension: {
        sheetId: properties.sheetId, dimension: "COLUMNS", length: RAW_HEADERS.length - columnCount,
      } }] },
    }));
  }
  if (!headersMatch) {
    await sheetCall(() => sheets.spreadsheets.values.update({
      spreadsheetId, range: `${tab}!${hasData ? "P" : "A"}1:U1`, valueInputOption: "RAW",
      requestBody: { values: [hasData ? RAW_HEADERS.slice(RAW_LEGACY_COLUMNS) : RAW_HEADERS] },
    }));
  }
  let nextRow = Math.max(2, rows.length + 1);
  return {
    async write(rawRows) {
      const ids = new Set();
      for (const [id] of rawRows) {
        if (ids.has(id)) throw error("CMS trả trùng mã phiên raw trong ngày.");
        ids.add(id);
      }
      for (let start = 0; start < rawRows.length; start += 200) {
        const batch = rawRows.slice(start, start + 200);
        const entries = batch.map(row => {
          if (!index.has(row[0])) index.set(row[0], { rowNumber: nextRow++, existing: false });
          return index.get(row[0]);
        });
        const needed = nextRow - 1;
        if (needed > rowCount) {
          await sheetCall(() => sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ updateSheetProperties: {
              properties: { sheetId: properties.sheetId, gridProperties: { rowCount: needed } },
              fields: "gridProperties.rowCount",
            } }] },
          }));
          rowCount = needed;
        }
        const data = batch.flatMap((row, i) => {
          const { rowNumber: n, existing } = entries[i];
          return existing
            ? [
                { range: `${tab}!A${n}:J${n}`, values: [row.slice(0, 10)] },
                ...(row[10] != null && String(row[10]).trim() !== ''
                  ? [{ range: `${tab}!K${n}`, values: [[row[10]]] }]
                  : []),
                ...(row[11] != null && String(row[11]).trim() !== ''
                  ? [{ range: `${tab}!L${n}`, values: [[row[11]]] }]
                  : []),
                { range: `${tab}!M${n}:N${n}`, values: [row.slice(12, 14)] },
                { range: `${tab}!O${n}:U${n}`, values: [row.slice(14)] }
              ]
            : [{ range: `${tab}!A${n}:U${n}`, values: [row.map(value => value ?? "")] }];
        });
        await sheetCall(() => sheets.spreadsheets.values.batchUpdate({
          spreadsheetId, requestBody: { valueInputOption: "RAW", data },
        }));
        entries.forEach(entry => { entry.existing = true; });
      }
    },
  };
};
const getStatus = () => {
  const config = getConfig();
  const today = dayKey();
  return {
    configured: config.configured,
    message: config.message,
    tabName: config.tabName,
    spreadsheetUrl: config.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.spreadsheetId)}/edit`
      : "",
    schedule: "07:00 Asia/Ho_Chi_Minh — ngày hôm trước",
    yesterday: offsetDay(today, -1),
    today,
    headers: HEADERS,
    raw: { enabled: config.rawEnabled, tabName: RAW_TAB },
    run: currentRun,
  };
};

const executeRun = async (run, config) => {
  const capture = async (target, date, work) => {
    try {
      return await work();
    } catch (cause) {
      console.error(`[CmsReport] ${run.id} ${target || "source"} ${date || ""}:`, cause.message);
      run.errors.push({ ...(date && { date }), ...(target && { target }), message: cause.message });
      return null;
    }
  };
  try {
    const client = cmsApi.createClient();
    await client.renewKey();
    const summary = !run.rawOnly && await capture("summary", null, async () => {
      run.phase = "Đang lấy danh mục trụ và khách hàng";
      const writer = await module.exports.createSheetWriter(config);
      return { writer, points: await client.getPoints(), customers: await client.getCustomers() };
    });
    const raw = config.rawEnabled
      ? await capture("raw", null, () => module.exports.createRawSheetWriter(config))
      : null;
    const rawRowsByDate = raw && await capture("raw", null, async () => {
      run.phase = `Đang lấy phiên raw ${run.from} → ${run.to}`;
      const transactions = await client.getRawTransactions(run.from, run.to);
      const byDate = new Map();
      for (const row of buildRawRows(run.from, transactions, run.to)) {
        const date = row[1];
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date).push(row);
      }
      return byDate;
    });
    const fetchedAt = new Date().toISOString();
    for (let date = run.from; (summary || rawRowsByDate) && date <= run.to; date = offsetDay(date, 1)) {
      run.phase = `Đang xử lý ${date}`;
      if (summary) await capture("summary", date, async () => {
        const transactions = await client.getTransactions(date);
        const row = aggregate({ date, points: summary.points, customers: summary.customers, transactions, fetchedAt });
        await summary.writer.write(row);
        run.rows.push(row);
      });
      if (rawRowsByDate) await capture("raw", date, async () => {
        const rows = rawRowsByDate.get(date) || [];
        await raw.write(rows);
        run.rawResults.push({ date, count: rows.length });
      });
      run.processed++;
    }
    run.status = run.errors.length
      ? run.rows.length || run.rawResults.length
        ? "PARTIAL"
        : "FAILED"
      : "SUCCESS";
  } catch (cause) {
    console.error(`[CmsReport] ${run.id}:`, cause.message);
    run.errors.push({ message: cause.message });
    run.status = "FAILED";
  } finally {
    run.finishedAt = new Date().toISOString();
    run.phase = "Đã kết thúc";
  }
};
const startRun = ({ from, to, trigger = "manual", rawOnly = false } = {}) => {
  if (typeof rawOnly !== "boolean") throw error("rawOnly phải là true hoặc false");
  if (currentRun?.status === "RUNNING")
    throw error("Đang có lượt thống kê CMS chạy. Hãy chờ hoàn tất.", 409);
  const range = validateRange(from, to, new Date(), rawOnly);
  const config = getConfig();
  if (!config.configured) throw error(config.message, 503);
  if (rawOnly && !config.rawEnabled) throw error("Chưa bật xuất dữ liệu raw (CMS_RAW_SHEET_ENABLED)", 503);
  currentRun = {
    id: randomUUID(),
    ...range,
    trigger,
    rawOnly,
    status: "RUNNING",
    processed: 0,
    phase: "Đang kiểm tra key và Google Sheet",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    rows: [],
    rawResults: [],
    errors: [],
  };
  const run = currentRun;
  setImmediate(() => executeRun(run, config));
  return run;
};

module.exports = {
  HEADERS,
  RAW_HEADERS,
  buildRawRows,
  createRawSheetWriter,
  dayKey,
  yesterday,
  offsetDay,
  monthCutoff,
  validateRange,
  aggregate,
  getConfig,
  getStatus,
  createSheetWriter,
  startRun,
};
