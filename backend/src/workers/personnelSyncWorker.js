const apiConfigService = require('../services/apiConfigService');
const personnelSyncService = require('../services/personnelSyncService');
const cronMatcher = require('../utils/cronMatcher');

const TICK_MS = 20 * 1000;
const running = new Set();
const lastRunMinute = {};

const minuteKey = (d) =>
  `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;

const runSync = async (config) => {
  const key = String(config.id);
  if (running.has(key)) return;
  running.add(key);
  try {
    const stats = await personnelSyncService.syncFrom1Office(config.id);
    console.log(`[PersonnelSync] config ${config.id} OK:`, JSON.stringify(stats));
  } catch (err) {
    if (err.statusCode === 409) {
      console.log(`[PersonnelSync] config ${config.id} dang dong bo, bo qua.`);
    } else {
      console.error(`[PersonnelSync] config ${config.id} loi: ${err.message}`);
    }
  } finally {
    running.delete(key);
  }
};

const tick = async () => {
  let configs = [];
  try {
    configs = await apiConfigService.getSyncableConfigs();
  } catch (err) {
    console.error('[PersonnelSync] load configs error:', err.message);
    return;
  }

  const now = new Date();
  const key = minuteKey(now);
  for (const config of configs) {
    const expr = (config.sync_cron || '').trim();
    if (!expr) continue;
    if (!cronMatcher.validate(expr)) {
      console.warn(`[PersonnelSync] config ${config.id} cron khong hop le: "${expr}"`);
      continue;
    }
    if (!cronMatcher.matches(expr, now)) continue;
    if (lastRunMinute[config.id] === key) continue;
    lastRunMinute[config.id] = key;
    runSync(config);
  }
};

exports.start = async () => {
  await tick();
  setInterval(() => { tick().catch((err) => console.error('[PersonnelSync] tick error:', err.message)); }, TICK_MS);
};

exports.tick = tick;
