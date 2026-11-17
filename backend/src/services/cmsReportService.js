const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { setTimeout: sleep } = require("node:timers/promises");
const { google } = require("googleapis");
const cmsApi = require("./cmsApiService");

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const HEADERS = [
  "Ngày báo cáo",
  "Thời điểm lấy",
  "Số trụ cũ",
  "Số trụ mới",
  "Trụ hoạt động",
  "Trụ không hoạt động",
  "Phiên sạc trụ cũ",
  "Phiên sạc trụ mới",
  "Phiên/trụ/ngày - cũ",
  "Phiên/trụ/ngày - mới",
  "Giờ sạc trụ cũ",
  "Giờ sạc trụ mới",
  "Giờ/trụ/ngày - cũ",
  "Giờ/trụ/ngày - mới",
  "Doanh thu trụ cũ",
  "Doanh thu trụ mới",
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

const validateRange = (from, to, now = new Date()) => {
  if (!validDate(from) || !validDate(to))
    throw error("Ngày phải hợp lệ và có định dạng YYYY-MM-DD");
  if (from > to) throw error("Ngày bắt đầu không được sau ngày kết thúc");
  if (to > yesterday(now))
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
  let active = 0;
  let inactive = 0;
  let excludedMissingEnd = 0;
  const cutoff = monthCutoff(date);
  for (const point of points) {
    const created = dayKey(
      new Date(timestamp(point.createdAt, "ngày tạo trụ")),
    );
    if (created > date) continue;
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
    if (transaction.endTime == null || transaction.endTime === "") {
      excludedMissingEnd++;
      continue;
    }
    const end = timestamp(transaction.endTime, "thời gian kết thúc phiên");
    const group = pointGroups.get(transaction.pointId);
    if (!group)
      throw error(
        "Phiên FINISHED có trụ không nằm trong danh mục CMS của ngày báo cáo",
        502,
      );
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
  return [
    date,
    fetchedAt,
    old.points,
    recent.points,
    active,
    inactive,
    old.sessions,
    recent.sessions,
    average(old.sessions, old.points),
    average(recent.sessions, recent.points),
    round(old.milliseconds / 3600000),
    round(recent.milliseconds / 3600000),
    average(old.milliseconds / 3600000, old.points),
    average(recent.milliseconds / 3600000, recent.points),
    round(old.revenue),
    round(recent.revenue),
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
  const missing = [];
  if (!String(process.env.CMS_API_KEY || "").trim())
    missing.push("CMS_API_KEY");
  if (!/^[\w-]+$/.test(spreadsheetId))
    missing.push("CMS_GOOGLE_SHEETS_SPREADSHEET_ID (chỉ ID, không phải URL)");
  if (!tabName || tabName.length > 100 || /[:\\/?*[\]]/.test(tabName))
    missing.push("CMS_GOOGLE_SHEETS_TAB_NAME hợp lệ");
  if (!credentialsFile || !fs.existsSync(credentialsFile))
    missing.push("file GOOGLE_APPLICATION_CREDENTIALS");
  return {
    configured: missing.length === 0,
    message: missing.length ? `Thiếu cấu hình: ${missing.join(", ")}` : "",
    spreadsheetId,
    tabName,
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
const createSheetWriter = async (config) => {
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
    (sheet) => sheet.properties?.title === config.tabName,
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
  const tab = `'${config.tabName.replace(/'/g, "''")}'`;
  const existing = await sheetCall(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${tab}!A:S`,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
  );
  const rows = existing.data.values || [];
  if (
    rows.length &&
    (rows[0].length !== HEADERS.length ||
      !HEADERS.every((value, i) => rows[0][i] === value))
  ) {
    throw error(
      "Header Google Sheet không khớp báo cáo CMS; hãy dùng tab riêng, không ghi đè tab dữ liệu khác.",
      409,
    );
  }
  const rowByDate = new Map();
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].every((cell) => String(cell ?? "").trim() === "")) continue;
    const date = rows[index][0];
    if (!validDate(date) || rowByDate.has(date))
      throw error(
        "Sheet có ngày thiếu/sai hoặc trùng; hãy sửa trước khi đồng bộ.",
        409,
      );
    rowByDate.set(date, index + 1);
  }
  if (!rows.length) {
    await sheetCall(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${tab}!A1:S1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS] },
      }),
    );
  }
  let nextRow = Math.max(2, rows.length + 1);
  let rowCount = properties.gridProperties.rowCount;
  return {
    async write(row) {
      let rowNumber = rowByDate.get(row[0]);
      if (!rowNumber) {
        rowNumber = nextRow++;
        rowByDate.set(row[0], rowNumber);
      }
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
      await sheetCall(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId: config.spreadsheetId,
          range: `${tab}!A${rowNumber}:S${rowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values: [row] },
        }),
      );
    },
  };
};

const getStatus = () => {
  const config = getConfig();
  return {
    configured: config.configured,
    message: config.message,
    tabName: config.tabName,
    spreadsheetUrl: config.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.spreadsheetId)}/edit`
      : "",
    schedule: "07:00 Asia/Ho_Chi_Minh — ngày hôm trước",
    yesterday: yesterday(),
    headers: HEADERS,
    run: currentRun,
  };
};

const executeRun = async (run, config) => {
  try {
    const client = cmsApi.createClient();
    await client.renewKey();
    const writer = await module.exports.createSheetWriter(config);
    run.phase = "Đang lấy danh mục trụ và khách hàng";
    const points = await client.getPoints();
    const fetchedAt = new Date().toISOString();
    const customers = await client.getCustomers();
    for (let date = run.from; date <= run.to; date = offsetDay(date, 1)) {
      run.phase = `Đang xử lý ${date}`;
      try {
        const transactions = await client.getTransactions(date);
        const row = aggregate({
          date,
          points,
          customers,
          transactions,
          fetchedAt,
        });
        await writer.write(row);
        run.rows.push(row);
      } catch (cause) {
        console.error(`[CmsReport] ${run.id} ${date}:`, cause.message);
        run.errors.push({ date, message: cause.message });
      }
      run.processed++;
    }
    run.status = run.errors.length
      ? run.rows.length
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
const startRun = ({ from, to, trigger = "manual" } = {}) => {
  if (currentRun?.status === "RUNNING")
    throw error("Đang có lượt thống kê CMS chạy. Hãy chờ hoàn tất.", 409);
  const range = validateRange(from, to);
  const config = getConfig();
  if (!config.configured) throw error(config.message, 503);
  currentRun = {
    id: randomUUID(),
    ...range,
    trigger,
    status: "RUNNING",
    processed: 0,
    phase: "Đang kiểm tra key và Google Sheet",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    rows: [],
    errors: [],
  };
  const run = currentRun;
  setImmediate(() => executeRun(run, config));
  return run;
};

module.exports = {
  HEADERS,
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
