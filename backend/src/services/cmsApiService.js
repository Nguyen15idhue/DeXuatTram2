const { setTimeout: sleep } = require('node:timers/promises');

const BASE_URL = 'https://api.tmt-egreen.com/api/v1';
const fail = message => Object.assign(new Error(message), { statusCode: 502 });

const createClient = () => {
  const key = String(process.env.CMS_API_KEY || '').trim().replace(/^Bearer\s+/i, '');
  if (!key) throw Object.assign(new Error('Chưa cấu hình CMS_API_KEY'), { statusCode: 503 });

  const get = async (endpoint, params = {}) => {
    const url = new URL(`${BASE_URL}${endpoint}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetch(url, {
          headers: { accept: 'application/json', authorization: `Bearer ${key}` },
          redirect: 'error',
          signal: AbortSignal.timeout(30000)
        });
      } catch {
        if (attempt === 2) throw fail(`Không kết nối được CMS (${endpoint}) sau 3 lần thử`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw fail('CMS từ chối key hoặc key đã hết hạn. Hãy cập nhật CMS_API_KEY ở backend.');
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = response.status === 429
          ? Math.min(60000, Math.max(1000, (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30) * 1000))
          : 1000 * 2 ** attempt;
        await response.body?.cancel();
        await sleep(delay);
        continue;
      }
      if (!response.ok) throw fail(`CMS trả HTTP ${response.status} (${endpoint})`);
      let body;
      try {
        body = await response.json();
      } catch {
        throw fail(`CMS trả JSON không hợp lệ (${endpoint})`);
      }
      if (!body || body.result !== 'success') throw fail(`CMS báo xử lý không thành công (${endpoint})`);
      return body;
    }
  };

  const list = async (endpoint, arrayKey, idKey, params, project) => {
    const items = [];
    const seen = new Set();
    let expectedTotal;
    for (let page = 0; ; page++) {
      const body = await get(endpoint, { ...params, limit: 100, page });
      const rows = body[arrayKey];
      if (!Array.isArray(rows) || !Number.isSafeInteger(body.total) || body.total < 0
        || body.page !== page || !Number.isSafeInteger(body.limit) || body.limit <= 0) {
        throw fail(`CMS trả phân trang không hợp lệ (${endpoint})`);
      }
      if (expectedTotal === undefined) expectedTotal = body.total;
      if (expectedTotal !== body.total) throw fail(`Dữ liệu CMS thay đổi khi phân trang (${endpoint}); hãy chạy lại`);
      for (const row of rows) {
        const id = row?.[idKey];
        if ((typeof id !== 'number' && typeof id !== 'string') || String(id).trim() === '' || seen.has(String(id))) {
          throw fail(`CMS trả ID thiếu hoặc trùng giữa các trang (${endpoint}); hãy chạy lại`);
        }
        seen.add(String(id));
        items.push(project(row));
      }
      if (items.length === expectedTotal) return items;
      if (rows.length === 0 || items.length > expectedTotal) {
        throw fail(`CMS trả thiếu hoặc thừa dữ liệu phân trang (${endpoint})`);
      }
    }
  };

  return {
    async renewKey() {
      const body = await get('/admin/user/profile');
      if (!body.profile || !Number.isFinite(Date.parse(body.profile.expirationDate))) {
        throw fail('CMS không trả hạn sử dụng key hợp lệ');
      }
      if (body.profile.token && body.profile.token !== key) {
        throw fail('CMS đã thay key; cần cập nhật CMS_API_KEY trước khi đồng bộ tiếp');
      }
    },
    getPoints: () => list('/admin/cp', 'chargePoints', 'pointId', { isTestChargePoint: 0 },
      row => ({ id: String(row.pointId), createdAt: row.createdAt, connected: row.connected })),
    getCustomers: () => list('/admin/driver', 'drivers', 'userId', {},
      row => ({ createdAt: row.createdAt })),
    getTransactions: date => list('/admin/ct', 'chargeTransactions', 'transactionId', {
      from: date, to: date, isTestTransaction: 0, exclusionZeroCost: false
    }, row => ({
      id: String(row.transactionId),
      pointId: row.chargeConnector?.pointId == null ? null : String(row.chargeConnector.pointId),
      status: row.status, startTime: row.startTime, endTime: row.endTime, totalCost: row.totalCost
    }))
  };
};

module.exports = { createClient };
