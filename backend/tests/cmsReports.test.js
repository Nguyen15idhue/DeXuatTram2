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

test("calendar-month age, Vietnam dates, zero-cost and cross-midnight sessions use the agreed formulas", () => {
  const row = reports.aggregate(fixture());
  assert.deepEqual(row.slice(0, 17), [
    "2026-11-16",
    "2026-11-17T00:00:00.000Z",
    1,
    2,
    2,
    1,
    1,
    1,
    1,
    0.5,
    2,
    1,
    2,
    0.5,
    20000,
    0,
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
    ["N/A", "N/A", 0, 0, "N/A", "N/A"],
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
  assert.deepEqual(row.slice(2, 17), reports.aggregate(input).slice(2, 17));
  assert.match(row[18], /Đã loại 1 phiên FINISHED/);
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
  const properties = {
    sheetId: 7,
    title: "CMS's report",
    gridProperties: { rowCount: options.rowCount || 1000, columnCount: 26 },
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
        get: async () => ({ data: { values: existing } }),
        update: async (request) => {
          writes.push(request);
          if (
            options.failDate &&
            request.requestBody.values[0][0] === options.failDate
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
      "'CMS''s report'!A3:S3",
      "'CMS''s report'!A3:S3",
      "'CMS''s report'!A3:S3",
      "'CMS''s report'!A2:S2",
    ],
  );
  assert.ok(writes.every((item) => item.valueInputOption === "RAW"));
});

test("a failed or ambiguous date write reserves its own row and the grid grows for later dates", async (t) => {
  const { config, writes, requests } = fakeSheets(
    t,
    [reports.HEADERS, ["2026-11-15"]],
    { failDate: "2026-11-16", rowCount: 2 },
  );
  const writer = await reports.createSheetWriter(config);
  const row = reports.aggregate(fixture());
  await assert.rejects(writer.write(row), { statusCode: 502 });
  await writer.write(["2026-11-17", ...row.slice(1)]);
  assert.deepEqual(
    writes.map((item) => item.range),
    ["'CMS''s report'!A3:S3", "'CMS''s report'!A4:S4"],
  );
  assert.equal(
    requests[0].requestBody.requests[0].updateSheetProperties.properties
      .gridProperties.rowCount,
    502,
  );
});

test("empty destination gets a dedicated tab/header; foreign headers and duplicate dates block writes", async (t) => {
  const { config, writes, requests } = fakeSheets(t, [], { missing: true });
  await reports.createSheetWriter(config);
  assert.equal(
    requests[0].requestBody.requests[0].addSheet.properties.title,
    config.tabName,
  );
  assert.deepEqual(writes[0].requestBody.values, [reports.HEADERS]);
});

for (const existing of [
  [["Another report"]],
  [reports.HEADERS, ["2026-11-16"], ["2026-11-16"]],
  [reports.HEADERS, ["", "orphan data"]],
]) {
  test(`incompatible Sheet (${existing.length} rows) is never overwritten`, async (t) => {
    const { config, writes } = fakeSheets(t, existing);
    await assert.rejects(reports.createSheetWriter(config), {
      statusCode: 409,
    });
    assert.deepEqual(writes, []);
  });
}

test("background run rejects concurrency, surfaces per-day errors and allows explicit rerun without DB", async (t) => {
  setEnv(t, {
    CMS_API_KEY: "fixture-key",
    CMS_GOOGLE_SHEETS_SPREADSHEET_ID: "fixture-sheet",
    CMS_GOOGLE_SHEETS_TAB_NAME: "fixture",
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
