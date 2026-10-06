const apiConfigService = require('./apiConfigService');

const sessions = new Map();

const webBaseUrl = async () => {
  try {
    const cfg = await apiConfigService.getDefaultPushConfig();
    if (cfg && cfg.base_url) return String(cfg.base_url).replace(/\/$/, '');
  } catch { /* silent */ }
  return 'https://egr.1office.vn';
};

const cookieOf = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

const doWebLogin = async (base, username, password) => {
  const jar = {};
  const store = (res) => {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const kv = c.split(';')[0];
      const i = kv.indexOf('=');
      if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
  };
  let r = await fetch(`${base}/login`, { redirect: 'manual' });
  store(r);
  await r.text();
  r = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: cookieOf(jar), Referer: `${base}/login` },
    body: new URLSearchParams({ username: String(username), userpwd: String(password), url_login: `${base}/login`, lang: 'vi' }).toString(),
  });
  store(r);
  await r.text();
  if (r.status !== 302) throw Object.assign(new Error('Sai tai khoan hoac mat khau 1Office'), { statusCode: 401 });
  return jar;
};

exports.fetchDialogValues = async (auto, processId) => {
  const base = await webBaseUrl();
  let username = auto.username;
  let passwordEnc = auto.password_enc;
  if (!username || !passwordEnc) {
    const workAutomationService = require('./workAutomationService');
    const main = await workAutomationService.getByKey('auto_assign_process');
    if (main && main.username && main.password_enc) {
      username = main.username;
      passwordEnc = main.password_enc;
    }
  }
  if (!username || !passwordEnc) throw Object.assign(new Error('Automation chua cau hinh tai khoan 1Office'), { statusCode: 400 });
  const workAutomationService = require('./workAutomationService');
  const password = workAutomationService.decryptSecret(passwordEnc);
  let jar = sessions.get(auto.id);
  const get = async (j) => fetch(    `${base}/apps/work-task-task/moveprocess?ID=${processId}&app_ctx=list&_json=1&reloadCsrfToken=1&inlineLogin=1&_=${Date.now()}`,
    { headers: { Cookie: cookieOf(j), Referer: `${base}/`, 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(30000) }
  );
  let d = await get(jar || {});
  if (d.status === 200) {
    const t = await d.text();
    if (!t.includes('error_login')) {
      if (jar) return parseValues(t);
      jar = await doWebLogin(base, auto.username, password);
      sessions.set(auto.id, jar);
      d = await get(jar);
      return parseValues(await d.text());
    }
  }
  jar = await doWebLogin(base, username, password);
  sessions.set(auto.id, jar);
  d = await get(jar);
  return parseValues(await d.text());
};

const parseValues = (t) => {
  const j = JSON.parse(t);
  const content = (j.dialog && j.dialog.content) || '';
  const m = content.match(/data-props='(\{.*?\})' data-atts/);
  if (!m) throw new Error('Khong doc duoc dialog 1Office');
  const unesc = m[1].replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return JSON.parse(unesc).values;
};

exports.fetchTaskprocess = async (auto, processId) => {
  const vals = await exports.fetchDialogValues(auto, processId);
  return { values: vals, nodes: JSON.parse(vals.taskprocess).nodes };
};

exports.clearSession = (automationId) => sessions.delete(automationId);
