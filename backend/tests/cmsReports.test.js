const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { google } = require("googleapis");
const cmsApi = require("../src/services/cmsApiService");
const reports = require("../src/services/cmsReportService");

const setEnv = (t, values) => {
  const before = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
};
const fixture = () => ({
  date: "2026-11-16",
  fetchedAt: "2026-11-17T00:00:00.000Z",
  points: [
    { id: "1", createdAt: "2026-10-15T16:59:59Z", connected: 1 },
    { id: "2", createdAt: "2026-10-15T17:00:00Z", connected: 0 },
    { id: "3", createdAt: "2026-11-01T00:00:00Z", connected: 1 },
    { id: "4", createdAt: "2026-11-17T00:00:00Z", connected: 1 },
  ],
  customers: [
    { createdAt: "2026-01-01T00:00:00Z" },
    { createdAt: "2026-11-16T16:59:59Z" },
    { createdAt: "2026-11-16T17:00:00Z" },
  ],
  transactions: [
    {
      pointId: "1",
      status: "FINISHED",
      startTime: "2026-11-16T16:30:00Z",
      endTime: "2026-11-16T18:30:00Z",
      totalCost: 20000,
    },
    {
      pointId: "2",
      status: "FINISHED",
      startTime: "2026-11-15T17:00:00Z",
      endTime: "2026-11-15T18:00:00Z",
      totalCost: 0,
    },
    { pointId: "3", status: "CANCELLED", totalCost: 999 },
    { pointId: "3", status: "CHARGING", totalCost: 100 },
    { pointId: "1", status: "FINISHED", startTime: "2026-11-16T17:00:00Z" },
  ],
});

test("calendar-month age, Vietnam dates, positive-cost and cross-midnight sessions use the agreed formulas", () => {
  const row = reports.aggregate(fixture());
  assert.deepEqual(row.slice(0, 22), [
    "2026-11-16",
    "2026-11-17T00:00:00.000Z",
    1,
    2,
    3,
    2,
    1,
    1,
    0,
    1,
    1,
    0,
    0.3333,
    2,
    0,
    2,
    0,
    0.6667,
    20000,
    0,
    20000,
    2,
  ]);
  assert.equal(row.length, reports.HEADERS.length);
  assert.equal(reports.monthCutoff("2026-03-31"), "2026-02-28");
  assert.equal(reports.monthCutoff("2024-03-31"), "2024-02-29");
  assert.equal(reports.monthCutoff("2026-01-31"), "2025-12-31");
  assert.equal(
    reports.yesterday(new Date("2026-11-16T17:01:00Z")),
    "2026-11-16",
  );
  assert.deepEqual(
    reports
      .aggregate({ ...fixture(), points: [], transactions: [] })
      .slice(8, 14),
    [0, 0, "N/A", "N/A", "N/A", 0],
  );
});

test("invalid ranges and incomplete source data fail explicitly rather than producing zero reports", () => {
  const now = new Date("2026-11-17T00:00:00Z");
  for (const [from, to] of [
    ["2026-02-30", "2026-03-01"],
    ["2026-11-17", "2026-11-17"],
    ["2026-11-16", "2026-11-15"],
    ["", "2026-11-16"],
  ]) {
    assert.throws(() => reports.validateRange(from, to, now), {
      statusCode: 400,
    });
  }
  assert.equal(
    reports.validateRange("2026-11-10", "2026-11-16", now).totalDays,
    7,
  );
  for (const changes of [
    { points: [{ id: "1", createdAt: null, connected: 1 }] },
    { customers: [{ createdAt: "bad" }] },
    {
      points: [{ id: "1", createdAt: "2026-01-01T00:00:00Z", connected: null }],
    },
    { transactions: [{ ...fixture().transactions[0], endTime: "invalid" }] },
    { transactions: [{ ...fixture().transactions[0], totalCost: "20000" }] },
    { transactions: [{ ...fixture().transactions[0], pointId: "missing" }] },
  ])
    assert.throws(() => reports.aggregate({ ...fixture(), ...changes }), {
      statusCode: 502,
    });
});

test("FINISHED transactions without endTime are excluded from all session metrics with an exported warning", () => {
  const input = fixture();
  const row = reports.aggregate({
    ...input,
    transactions: [
      ...input.transactions,
      { ...input.transactions[0], endTime: null, totalCost: 99999 },
    ],
  });
  assert.deepEqual(row.slice(2, 22), reports.aggregate(input).slice(2, 22));
  assert.match(row[23], /Đã loại 1 phiên FINISHED/);
});

test("CMS client uses the server key, reads every page and discards private fields", async (t) => {
  setEnv(t, { CMS_API_KEY: "Bearer fixture-private-key" });
  const requested = [];
  t.mock.method(global, "fetch", async (url, options) => {
    requested.push(url);
    assert.equal(url.origin, "https://api.tmt-egreen.com");
    assert.equal(options.headers.authorization, "Bearer fixture-private-key");
    assert.equal(options.redirect, "error");
    const page = Number(url.searchParams.get("page"));
    return Response.json({
      result: "success",
      page,
      limit: 2,
      total: 3,
      chargePoints: (page ? [3] : [1, 2]).map((pointId) => ({
        pointId,
        createdAt: "2026-01-01T00:00:00Z",
        connected: 1,
        ocppPassword: "never-retain",
        phoneNumber: "never-retain",
      })),
    });
  });
  const points = await cmsApi.createClient().getPoints();
  assert.equal(requested.length, 2);
  assert.deepEqual(
    points.map((point) => point.id),
    ["1", "2", "3"],
  );
  assert.equal(requested[0].searchParams.has("status"), false);
  assert.equal(requested[0].searchParams.get("isTestChargePoint"), "0");
  assert.doesNotMatch(
    JSON.stringify(points),
    /never-retain|phoneNumber|ocppPassword/,
  );
});

test("CMS denies expired keys, business errors and broken/repeated pagination", async (t) => {
  setEnv(t, { CMS_API_KEY: "fixture-private-key" });
  let response = () => new Response("", { status: 401 });
  let calls = 0;
  t.mock.method(global, "fetch", async () => {
    calls++;
    return response();
  });
  const client = cmsApi.createClient();
  await assert.rejects(client.getPoints(), /CMS từ chối key/);
  assert.equal(calls, 1);
  response = () =>
    Response.json({ result: "error", message: "do-not-echo-private-payload" });
  await assert.rejects(client.getPoints(), (cause) => {
    assert.doesNotMatch(cause.message, /do-not-echo/);
    return cause.statusCode === 502;
  });
  response = () =>
    Response.json({
      result: "success",
      total: 2,
      page: 0,
      limit: 100,
      chargePoints: [],
    });
  await assert.rejects(client.getPoints(), /thiếu hoặc thừa/);
  response = () =>
    Response.json({
      result: "success",
      total: 2,
      page: 0,
      limit: 100,
      chargePoints: [{ pointId: 1 }, { pointId: 1 }],
    });
  await assert.rejects(client.getPoints(), /ID thiếu hoặc trùng/);
});

test("CMS transactions preserve zero-cost query and Profile renews without exposing credentials", async (t) => {
  setEnv(t, { CMS_API_KEY: "fixture-key" });
  t.mock.method(global, "fetch", async (url) => {
    if (url.pathname.endsWith("/profile"))
      return Response.json({
        result: "success",
        profile: {
          token: "fixture-key",
          expirationDate: "2099-01-01T00:00:00Z",
          phone: "private",
        },
      });
    assert.equal(url.searchParams.get("from"), "2026-11-16");
    assert.equal(url.searchParams.get("to"), "2026-11-16");
    assert.equal(url.searchParams.get("exclusionZeroCost"), "false");
    assert.equal(url.searchParams.get("isTestTransaction"), "0");
    return Response.json({
      result: "success",
      total: 1,
      page: 0,
      limit: 100,
      chargeTransactions: [
        {
          transactionId: 1,
          chargeConnector: { pointId: 8 },
          status: "FINISHED",
          startTime: "2026-11-16T00:00:00Z",
          endTime: "2026-11-16T01:00:00Z",
          totalCost: 0,
          user: { phone: "private" },
        },
      ],
    });
  });
  const client = cmsApi.createClient();
  assert.equal(await client.renewKey(), undefined);
  const rows = await client.getTransactions("2026-11-16");
  assert.equal(rows[0].pointId, "8");
  assert.doesNotMatch(JSON.stringify(rows), /private|user/);
});

const fakeSheets = (t, existing, options = {}) => {
  const writes = [];
  const requests = [];
  const reads = [];
  const properties = {
    sheetId: 7,
    title: options.title || "CMS's report",
    gridProperties: { rowCount: options.rowCount || 1000, columnCount: options.columnCount || 26 },
  };
  t.mock.method(
    google.auth.GoogleAuth.prototype,
    "getClient",
    async () => ({}),
  );
  t.mock.method(google, "sheets", () => ({
    spreadsheets: {
      get: async () => ({
        data: { sheets: options.missing ? [] : [{ properties }] },
      }),
      batchUpdate: async (request) => {
        requests.push(request);
        return { data: { replies: [{ addSheet: { properties } }] } };
      },
      values: {
        batchUpdate: async (request) => { writes.push(request); return {}; },
        get: async (request) => {
          reads.push(request);
          return { data: { values: existing } };
        },
        update: async (request) => {
          writes.push(request);
          if (
            request.range === options.failRange
          )
            throw { code: 403 };
          if (options.failOnce) {
            options.failOnce = false;
            throw { code: 503 };
          }
          return {};
        },
      },
    },
  }));
  return {
    writes,
    requests,
    reads,
    config: {
      credentialsFile: "fixture.json",
      spreadsheetId: "fixture-sheet",
      tabName: "CMS's report",
    },
  };
};

test("Sheet retries write the same explicit row; reruns update dates and new days never append twice", async (t) => {
  const { config, writes } = fakeSheets(t, [reports.HEADERS, ["2026-11-15"]], {
    failOnce: true,
  });
  const writer = await reports.createSheetWriter(config);
  const row = reports.aggregate(fixture());
  await writer.write(row);
  await writer.write(row);
  await writer.write(["2026-11-15", ...row.slice(1)]);
  assert.deepEqual(
    writes.map((item) => item.range),
    [
      "'CMS''s report'!A3:X3",
      "'CMS''s report'!A3:X3",
      "'CMS''s report'!B3:X3",
      "'CMS''s report'!B2:X2",
    ],
  );
  assert.ok(writes.every((item) => item.valueInputOption === "RAW"));
});

test("a failed or ambiguous date write reserves its own row and the grid grows for later dates", async (t) => {
  const { config, writes, requests } = fakeSheets(
    t,
    [reports.HEADERS, ["2026-11-15"]],
    { failRange: "'CMS''s report'!A3:X3", rowCount: 2 },
  );
  const writer = await reports.createSheetWriter(config);
  const row = reports.aggregate(fixture());
  await assert.rejects(writer.write(row), { statusCode: 502 });
  await writer.write(["2026-11-17", ...row.slice(1)]);
  assert.deepEqual(
    writes.map((item) => item.range),
    ["'CMS''s report'!A3:X3", "'CMS''s report'!A4:X4"],
  );
  assert.equal(
    requests[0].requestBody.requests[0].updateSheetProperties.properties
      .gridProperties.rowCount,
    502,
  );
});

test("empty destination gets a dedicated tab and the full header", async (t) => {
  const { config, writes, requests } = fakeSheets(t, [], { missing: true });
  await reports.createSheetWriter(config);
  assert.equal(
    requests[0].requestBody.requests[0].addSheet.properties.title,
    config.tabName,
  );
  assert.equal(writes[0].range, "'CMS''s report'!A1:X1");
  assert.deepEqual(writes[0].requestBody.values, [reports.HEADERS]);
});

test("mixed Sheet dates reconcile by calendar day and new rows use a native date", async (t) => {
  const { config, writes, reads, requests } = fakeSheets(t, [
    reports.HEADERS, ["01/10/2026"], [], [46318], ["2026-11-18"],
  ]);
  const writer = await reports.createSheetWriter(config);
  for (const date of ["2026-10-01", "2026-10-23", "2026-11-18", "2026-11-19"]) {
    await writer.write(reports.aggregate({ ...fixture(), date, transactions: [] }));
  }
  assert.equal(reads[0].range, "'CMS''s report'!A:Z");
  assert.equal(reads[0].dateTimeRenderOption, "SERIAL_NUMBER");
  assert.deepEqual(writes.map(item => item.range), [
    "'CMS''s report'!B2:X2", "'CMS''s report'!B4:X4",
    "'CMS''s report'!B5:X5", "'CMS''s report'!A6:X6",
  ]);
  assert.deepEqual(writes.map(item => item.requestBody.values[0].length), [23, 23, 23, 24]);
  assert.equal(writes[3].requestBody.values[0][0], 46345);
  const format = requests[0].requestBody.requests[0].repeatCell;
  assert.equal(format.range.startRowIndex, 5);
  assert.equal(format.range.endColumnIndex, 1);
  assert.deepEqual(format.cell.userEnteredFormat.numberFormat, { type: "DATE", pattern: "dd/MM/yyyy" });
});

test("an A:X report is used without extending columns or rewriting its header", async (t) => {
  const { config, writes, reads, requests } = fakeSheets(
    t, [reports.HEADERS, ["01/10/2026"]], { columnCount: 24 },
  );
  await reports.createSheetWriter(config);
  assert.equal(reads[0].range, "'CMS''s report'!A:X");
  assert.deepEqual(requests, []);
  assert.deepEqual(writes, []);
});

test("summary updates and new rows preserve occupied Y and Z columns", async (t) => {
  const { config, writes, reads } = fakeSheets(t, [
    [...reports.HEADERS, "Tháng báo cáo", "Số khách hàng mới"],
    ["2026-11-15", ...Array(23).fill(""), 11, 5],
    [...Array(24).fill(""), "dữ liệu khác", 7]
  ]);
  const writer = await reports.createSheetWriter(config);
  const row = reports.aggregate(fixture());
  await writer.write(["2026-11-15", ...row.slice(1), "không ghi Y", "không ghi Z"]);
  await writer.write([...row, "không ghi Y", "không ghi Z"]);
  assert.equal(reads[0].range, "'CMS''s report'!A:Z");
  assert.deepEqual(writes.map(item => item.range), [
    "'CMS''s report'!B2:X2", "'CMS''s report'!A4:X4",
  ]);
  assert.deepEqual(writes.map(item => item.requestBody.values[0].length), [23, 24]);
});

for (const { label, rows, message } of [
  { label: "foreign header", rows: [["Another report"]], message: /Header Google Sheet/ },
  { label: "duplicate across text and serial", rows: [
    reports.HEADERS, ["01/10/2026"], [], [46296],
  ], message: /2026-10-01 bị trùng tại ô A2 và A4/ },
  { label: "missing date", rows: [reports.HEADERS, ["", "orphan data"]], message: /Ô A2 đang trống/ },
  { label: "invalid date", rows: [reports.HEADERS, ["31/02/2026"]], message: /Ô A2 không phải ngày hợp lệ/ },
]) {
  test(`Sheet with ${label} is never overwritten`, async (t) => {
    const { config, writes, requests } = fakeSheets(t, rows);
    await assert.rejects(reports.createSheetWriter(config), { statusCode: 409, message });
    assert.deepEqual(writes, []);
    assert.deepEqual(requests, []);
  });
}

test("raw rows use Vietnam start date, retain charging and zero-cost sessions, and omit unverified and personal values", () => {
  const rows = reports.buildRawRows("2026-11-16", [
    { id: "fixture-1", startTime: "2026-11-16T16:30:00Z", endTime: "2026-11-16T18:30:00Z", status: "FINISHED", totalCost: 0 },
    { id: "fixture-2", startTime: "2026-11-15T17:00:00Z", status: "CHARGING", plate: "not-exported", customer: "not-exported", totalCost: 99 },
    { id: "fixture-next", startTime: "2026-11-16T17:00:00Z", status: "CHARGING" },
  ]);
  assert.deepEqual(rows, [
    ["fixture-1", "2026-11-16", "11/2026", "16/11/2026 23:30", "17/11/2026 01:30", 2, ...Array(7).fill(null), 0, "Đã kết thúc", ...Array(6).fill(null)],
    ["fixture-2", "2026-11-16", "11/2026", "16/11/2026 00:00", "", "", ...Array(7).fill(null), 99, "Đang sạc", ...Array(6).fill(null)],
  ]);
});

test("raw writer upserts by ID and preserves existing unverified columns", async (t) => {
  const { config, writes, reads, requests } = fakeSheets(t, [[...reports.RAW_HEADERS, "So_tien_sac_VND"], ["fixture-old"]], {
    title: "Phien_sac_raw", rowCount: 2,
  });
  const writer = await reports.createRawSheetWriter(config);
  const transactions = ["fixture-old", "fixture-new"].map(id => ({
    id, startTime: "2026-11-16T11:00:00Z", status: "CHARGING", totalCost: 7501,
  }));
  const rows = reports.buildRawRows("2026-11-16", transactions);
  await writer.write(rows);
  await writer.write(rows);
  assert.equal(reads[0].range, "'Phien_sac_raw'!A:U");
  assert.equal(requests[0].requestBody.requests[0].updateSheetProperties.properties.gridProperties.rowCount, 3);
  assert.deepEqual(writes.map(item => item.requestBody.data.map(entry => entry.range)), [
    ["'Phien_sac_raw'!A2:J2", "'Phien_sac_raw'!M2:N2", "'Phien_sac_raw'!O2:U2", "'Phien_sac_raw'!A3:U3"],
    ["'Phien_sac_raw'!A2:J2", "'Phien_sac_raw'!M2:N2", "'Phien_sac_raw'!O2:U2", "'Phien_sac_raw'!A3:J3", "'Phien_sac_raw'!M3:N3", "'Phien_sac_raw'!O3:U3"],
  ]);
  assert.deepEqual(writes[0].requestBody.data[1].values, [[null, 7501]]);
  assert.deepEqual(writes[0].requestBody.data[3].values, [rows[1].map(cell => cell ?? "")]);
});

test("legacy raw tab extends only a blank P:U and preserves its existing header", async (t) => {
  const row = ["fixture-old"];
  const { config, writes } = fakeSheets(t, [reports.RAW_HEADERS.slice(0, 15), row], { title: "Phien_sac_raw" });
  row[15] = '=IF(TRUE,"","")';
  await assert.rejects(reports.createRawSheetWriter(config), /P:U đã có dữ liệu/);
  assert.equal(writes.length, 0);
  row.length = 1;
  await reports.createRawSheetWriter(config);
  assert.equal(writes[0].range, "'Phien_sac_raw'!P1:U1");
  assert.deepEqual(writes[0].requestBody.values, [reports.RAW_HEADERS.slice(15)]);
});

test("raw writer rejects duplicate and incompatible tabs without writing", async (t) => {
  const existing = [reports.RAW_HEADERS, ["fixture-dup"], ["fixture-dup"]];
  const { config, writes } = fakeSheets(t, existing, { title: "Phien_sac_raw" });
  await assert.rejects(reports.createRawSheetWriter(config), /trùng tại ô A2 và A3/);
  existing[0] = ["Header khác"];
  await assert.rejects(reports.createRawSheetWriter(config), /Header Phien_sac_raw/);
  assert.equal(writes.length, 0);
});

test("raw sync writes paginated CMS session API records into the configured spreadsheet", async (t) => {
  setEnv(t, {
    CMS_API_KEY: "fixture-key", CMS_GOOGLE_SHEETS_SPREADSHEET_ID: "fixture-sheet",
    GOOGLE_APPLICATION_CREDENTIALS: "fixture.json", CMS_RAW_SHEET_ENABLED: "true",
  });
  t.mock.method(fs, "existsSync", () => true);
  const { writes } = fakeSheets(t, [], { title: "Phien_sac_raw", missing: true });
  t.mock.method(reports, "createSheetWriter", async () => ({ write: async () => {} }));
  const pages = [];
  t.mock.method(global, "fetch", async (url) => {
    const body = { result: "success", total: 0, page: 0, limit: 100 };
    if (url.pathname.endsWith("/profile"))
      return Response.json({ ...body, profile: { expirationDate: "2099-01-01T00:00:00Z" } });
    if (url.pathname.endsWith("/admin/cp")) return Response.json({ ...body, chargePoints: [] });
    if (url.pathname.endsWith("/admin/driver")) return Response.json({ ...body, drivers: [] });
    assert.equal(url.pathname, "/api/v1/admin/ct");
    const page = Number(url.searchParams.get("page"));
    if (!url.searchParams.has("dateFilter")) {
      assert.equal(url.searchParams.get("limit"), "100");
      assert.equal(url.searchParams.get("from"), url.searchParams.get("to"));
      return Response.json({ ...body, chargeTransactions: [] });
    }
    pages.push(page);
    assert.equal(url.searchParams.get("dateFilter"), "30_NGAY_GAN_NHAT");
    assert.equal(url.searchParams.get("limit"), "10");
    assert.equal(url.searchParams.get("isTestTransaction"), "0");
    assert.equal(url.searchParams.get("exclusionZeroCost"), "false");
    assert.equal(url.searchParams.get("from"), "2026-11-16");
    assert.equal(url.searchParams.get("to"), "2026-11-17");
    return Response.json({ ...body, page, total: 3, limit: 1, chargeTransactions: [{
      transactionId: 1234 + page, startTime: `2026-11-${16 + page}T00:00:00Z`,
      status: "CHARGING", totalCost: 0, transactionCode: `CT-TEST-${page}`,
      energy: 16325, startSoc: 0, endSoc: 62, invoiceId: "9999999876543210", invoiceSerial: "123456789",
      vehicle: { model: { name: "Dòng thử" }, plate: "private-fixture" },
      chargeConnector: { name: "Súng thử", chargePoint: {
        name: "Trụ thử", chargeStation: { stationCode: "E.TEST", name: "Trạm thử" }
      } },
      user: { userId: 987654321, phone: "private-fixture", fullname: "private-fixture" },
    }] });
  });
  const run = reports.startRun({ from: "2026-11-16", to: "2026-11-17" });
  for (let i = 0; i < 50 && run.status === "RUNNING"; i++)
    await new Promise(resolve => setImmediate(resolve));
  assert.equal(run.status, "SUCCESS");
  assert.deepEqual(pages, [0, 1, 2]);
  assert.deepEqual(run.rawResults, [{ date: "2026-11-16", count: 1 }, { date: "2026-11-17", count: 1 }]);
  assert.equal(writes[0].range, "'Phien_sac_raw'!A1:U1");
  assert.deepEqual(writes[0].requestBody.values, [reports.RAW_HEADERS]);
  assert.equal(writes[1].spreadsheetId, "fixture-sheet");
  assert.deepEqual(writes.slice(1).flatMap(write => write.requestBody.data.map(({ range, values }) => [range, values[0][0], values[0][14]])), [
    ["'Phien_sac_raw'!A2:U2", "1234", "Đang sạc"],
    ["'Phien_sac_raw'!A3:U3", "1235", "Đang sạc"],
  ]);
  const first = writes[1].requestBody.data[0].values[0];
  assert.deepEqual(first.slice(6, 14), ["E.TEST", "Trạm thử", "Trụ thử", "Súng thử", "", "", 16.325, 0]);
  assert.deepEqual(first.slice(15), ["CT-TEST-0", "", "Dòng thử", 0, 62, "Đã xuất"]);
  assert.doesNotMatch(JSON.stringify(writes), /private-fixture|9999999876543210|123456789|987654321/);
});

test("only raw permits today's date at Vietnam midnight", () => {
  const now = new Date("2026-11-16T17:00:00Z");
  assert.throws(() => reports.validateRange("2026-11-17", "2026-11-17", now), /ngày hôm qua/);
  assert.equal(reports.validateRange("2026-11-17", "2026-11-17", now, true).totalDays, 1);
  assert.throws(() => reports.validateRange("2026-11-17", "2026-11-18", now, true), /ngày hôm nay/);
});

test("raw-only uses the selected range and writes only the existing raw tab", async (t) => {
  setEnv(t, {
    CMS_API_KEY: "fixture-key", CMS_GOOGLE_SHEETS_SPREADSHEET_ID: "fixture-sheet",
    GOOGLE_APPLICATION_CREDENTIALS: "fixture.json", CMS_RAW_SHEET_ENABLED: "true",
  });
  t.mock.method(fs, "existsSync", () => true);
  const { writes } = fakeSheets(t, [reports.RAW_HEADERS], { title: "phien_sac_raw" });
  const createSummary = t.mock.method(reports, "createSheetWriter", async () => assert.fail("summary writer called"));
  const summaryRead = t.mock.fn(async () => assert.fail("summary endpoint called"));
  const rawRead = t.mock.fn(async () => [{
    id: "1234", startTime: "2026-11-16T00:00:00Z", status: "CHARGING",
  }]);
  t.mock.method(cmsApi, "createClient", () => ({
    renewKey: async () => {}, getPoints: summaryRead, getCustomers: summaryRead,
    getTransactions: summaryRead, getRawTransactions: rawRead,
  }));
  const range = { from: "2026-11-16", to: "2026-11-17", rawOnly: true };
  const run = reports.startRun(range);
  assert.throws(() => reports.startRun(range), { statusCode: 409 });
  for (let i = 0; i < 50 && run.status === "RUNNING"; i++)
    await new Promise(resolve => setImmediate(resolve));
  assert.equal(run.status, "SUCCESS");
  assert.equal(run.processed, 2);
  assert.deepEqual(run.rows, []);
  assert.deepEqual(run.rawResults, [{ date: range.from, count: 1 }, { date: range.to, count: 0 }]);
  assert.deepEqual(rawRead.mock.calls.map(call => call.arguments), [[range.from, range.to]]);
  assert.equal(summaryRead.mock.callCount(), 0);
  assert.equal(createSummary.mock.callCount(), 0);
  assert.deepEqual(writes.flatMap(write => write.requestBody.data.map(item => item.range)), ["'phien_sac_raw'!A2:U2"]);
  process.env.CMS_RAW_SHEET_ENABLED = "false";
  assert.throws(() => reports.startRun(range), { statusCode: 503 });
  assert.throws(() => reports.startRun({ ...range, rawOnly: "true" }), { statusCode: 400 });
});

test("raw init and per-day errors do not prevent summary writes, and status contains counts only", async (t) => {
  setEnv(t, {
    CMS_API_KEY: "fixture-key", CMS_GOOGLE_SHEETS_SPREADSHEET_ID: "fixture-sheet",
    GOOGLE_APPLICATION_CREDENTIALS: "fixture.json", CMS_RAW_SHEET_ENABLED: "true",
  });
  t.mock.method(fs, "existsSync", () => true);
  const input = fixture();
  const tx = { ...input.transactions[0], id: "fixture-private-row" };
  t.mock.method(cmsApi, "createClient", () => ({
    renewKey: async () => {}, getPoints: async () => input.points,
    getCustomers: async () => input.customers, getTransactions: async () => [tx],
    getRawTransactions: async () => [tx],
  }));
  t.mock.method(reports, "createSheetWriter", async () => ({ write: async () => {} }));
  let initError = true;
  t.mock.method(reports, "createRawSheetWriter", async () => {
    if (initError) throw new Error("Header lỗi");
    return { write: async () => {} };
  });
  const runDay = async () => {
    const run = reports.startRun({ from: "2026-11-16", to: "2026-11-16" });
    for (let i = 0; i < 50 && run.status === "RUNNING"; i++)
      await new Promise(resolve => setImmediate(resolve));
    return run;
  };
  const partial = await runDay();
  assert.equal(partial.status, "PARTIAL");
  assert.equal(partial.rows.length, 1);
  assert.equal(partial.errors[0].target, "raw");
  initError = false;
  const retry = await runDay();
  assert.equal(retry.status, "SUCCESS");
  assert.deepEqual(retry.rawResults, [{ date: "2026-11-16", count: 1 }]);
  assert.doesNotMatch(JSON.stringify(reports.getStatus()), /fixture-private-row|fixture-key/);
});

test("background run rejects concurrency, surfaces per-day errors and allows explicit rerun without DB", async (t) => {
  setEnv(t, {
    CMS_API_KEY: "fixture-key",
    CMS_GOOGLE_SHEETS_SPREADSHEET_ID: "fixture-sheet",
    CMS_GOOGLE_SHEETS_TAB_NAME: "fixture",
    CMS_RAW_SHEET_ENABLED: "false",
    GOOGLE_APPLICATION_CREDENTIALS: "fixture.json",
  });
  t.mock.method(fs, "existsSync", () => true);
  t.mock.method(cmsApi, "createClient", () => ({
    renewKey: async () => {},
    getPoints: async () => fixture().points,
    getCustomers: async () => fixture().customers,
    getTransactions: async (date) => {
      if (date === "2026-11-15") throw new Error("CMS dữ liệu thiếu");
      return fixture().transactions;
    },
  }));
  const saved = [];
  t.mock.method(reports, "createSheetWriter", async () => ({
    write: async (row) => saved.push(row[0]),
  }));
  const run = reports.startRun({ from: "2026-11-15", to: "2026-11-16" });
  assert.throws(() => reports.startRun({ from: run.from, to: run.to }), {
    statusCode: 409,
  });
  for (let i = 0; i < 50 && run.status === "RUNNING"; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.status, "PARTIAL");
  assert.equal(run.processed, 2);
  assert.deepEqual(saved, ["2026-11-16"]);
  assert.equal(run.errors[0].date, "2026-11-15");
  assert.doesNotMatch(
    JSON.stringify(reports.getStatus()),
    /fixture-key|fixture.json/,
  );
  const retry = reports.startRun({ from: "2026-11-16", to: "2026-11-16" });
  for (let i = 0; i < 50 && retry.status === "RUNNING"; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(retry.status, "SUCCESS");
});

test("worker runs yesterday at 07:00 Vietnam time once, regardless of host timezone", (t) => {
  const worker = require("../src/workers/cmsReportWorker");
  const starts = [];
  let busy = false;
  t.mock.method(reports, "getConfig", () => ({ configured: true }));
  t.mock.method(reports, "getStatus", () => ({
    run: { status: busy ? "RUNNING" : "SUCCESS" },
  }));
  t.mock.method(reports, "startRun", (input) => starts.push(input));
  worker.tick(new Date("2027-01-01T23:59:00Z"));
  worker.tick(new Date("2027-01-02T00:00:00Z"));
  worker.tick(new Date("2027-01-02T00:00:30Z"));
  assert.deepEqual(starts, [
    { from: "2027-01-01", to: "2027-01-01", trigger: "scheduled" },
  ]);
  busy = true;
  worker.tick(new Date("2027-01-03T00:00:00Z"));
  assert.equal(starts.length, 1);
  busy = false;
  worker.tick(new Date("2027-01-03T00:05:00Z"));
  assert.equal(starts[1].from, "2027-01-02");
});

test("CMS status/run endpoints reject non-admins and never expose the CMS key", async (t) => {
  process.env.JWT_SECRET ||= "cms-report-route-fixture";
  const express = require("express");
  const jwt = require("jsonwebtoken");
  const pool = require("../src/utils/db");
  t.after(() => pool.end());
  t.mock.method(pool, "query", async (sql, params) => [
    [
      {
        id: params[0],
        role: {
          1: "SUPER_ADMIN",
          2: "ADMIN",
          3: "SALES",
          4: "CTV",
          5: "NPP",
          6: "MKT",
        }[params[0]],
        status: "ACTIVE",
        token_version: 0,
      },
    ],
  ]);
  t.mock.method(reports, "getStatus", () => ({
    configured: false,
    message: "Missing configuration",
  }));
  t.mock.method(reports, "startRun", () => ({ id: "fixture-run" }));
  const app = express();
  app.use(express.json());
  app.use("/api/admin/cms-reports", require("../src/routes/cmsReports"));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/admin/cms-reports`;
    assert.equal((await fetch(`${base}/status`)).status, 401);
    for (let id = 1; id <= 6; id++) {
      const headers = {
        authorization: `Bearer ${jwt.sign({ id, tokenVersion: 0 }, process.env.JWT_SECRET)}`,
        "content-type": "application/json",
      };
      assert.equal(
        (await fetch(`${base}/status`, { headers })).status,
        id <= 2 ? 200 : 403,
      );
      assert.equal(
        (
          await fetch(`${base}/run`, {
            headers,
            method: "POST",
            body: JSON.stringify({ from: "2026-11-16", to: "2026-11-16" }),
          })
        ).status,
        id <= 2 ? 202 : 403,
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
