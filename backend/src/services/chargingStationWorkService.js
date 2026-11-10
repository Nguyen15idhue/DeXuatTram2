const access = require('./chargingStationAccessService');
const readiness = require('./chargingStationReadiness');

const portion = (stage) => `EXISTS(SELECT 1 FROM charging_station_deployments d
  WHERE d.charging_station_id=cs.id AND d.stage='${stage}')`;
const after = (stages) => `EXISTS(SELECT 1 FROM charging_station_deployments d
  WHERE d.charging_station_id=cs.id AND d.stage IN (${stages.map(s => `'${s}'`).join(',')}))`;
const noPortions = 'NOT EXISTS(SELECT 1 FROM charging_station_deployments d WHERE d.charging_station_id=cs.id)';
const committed = '(SELECT COALESCE(SUM(c.quantity),0) FROM charging_station_commitments c WHERE c.charging_station_id=cs.id)';
const noCommitments = `${committed}=0`;
const everyReceived = `NOT EXISTS(SELECT 1 FROM charging_station_commitments c
  WHERE c.charging_station_id=cs.id AND c.quantity >
    (SELECT COALESCE(SUM(i.received_quantity),0) FROM warehouse_export_items i WHERE i.commitment_id=c.id))`;
const everyOperating = `NOT EXISTS(SELECT 1 FROM charging_station_commitments c
  WHERE c.charging_station_id=cs.id AND c.quantity >
    (SELECT COALESCE(SUM(d.quantity),0) FROM charging_station_deployments d
      JOIN warehouse_export_items i ON i.id=d.export_item_id
      WHERE i.commitment_id=c.id AND d.charging_station_id=cs.id AND d.stage='OPERATING'))`;
const deliveryComplete = `((${committed}>0 AND cs.fulfillment_review_required=0 AND ${everyReceived})
  OR (${noCommitments} AND cs.fulfillment_review_required=0 AND cs.status IN ('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING')))`;
const allOperating = `((${committed}>0 AND cs.fulfillment_review_required=0 AND ${everyOperating})
  OR (${noCommitments} AND cs.fulfillment_review_required=0 AND ${noPortions} AND cs.status='OPERATING'))`;
const financialOpen = `(cs.deposit_status IN ('NOT_RECEIVED','REFUND_PENDING')
  OR cs.payment_status IN ('NOT','DOING'))`;
const complete = `(${allOperating} AND cs.contract_status='DONE'
  AND cs.infra_power_status='DONE' AND cs.infra_site_status='DONE' AND NOT ${financialOpen})`;

const stageFilters = {
  'khoi-tao-hop-dong': {
    need: "cs.contract_status IN ('NOT','DOING')",
    completed: "cs.contract_status='DONE'", all: '1=1'
  },
  'xay-dung-ha-tang': {
    need: "(COALESCE(cs.infra_power_status,'NOT')<>'DONE' OR COALESCE(cs.infra_site_status,'NOT')<>'DONE')",
    completed: "(cs.infra_power_status='DONE' AND cs.infra_site_status='DONE')", all: '1=1'
  },
  'giao-tru': {
    need: `NOT ${deliveryComplete}`,
    completed: deliveryComplete, all: '1=1'
  },
  'lap-tru': {
    need: `(${portion('INSTALLING')} OR (${noPortions} AND cs.status='INSTALLING'))`,
    completed: `(${after(['ACCEPTANCE', 'CONFIGURING', 'OPERATING'])} AND NOT ${portion('INSTALLING')})`,
    all: `(${after(['INSTALLING', 'ACCEPTANCE', 'CONFIGURING', 'OPERATING'])} OR cs.status IN ('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING'))`
  },
  'nghiem-thu': {
    need: `(${portion('ACCEPTANCE')} OR (${noPortions} AND cs.status='ACCEPTANCE'))`,
    completed: `(${after(['CONFIGURING', 'OPERATING'])} AND NOT ${portion('ACCEPTANCE')})`,
    all: `(${after(['ACCEPTANCE', 'CONFIGURING', 'OPERATING'])} OR cs.status IN ('ACCEPTANCE','CONFIGURING','OPERATING'))`
  },
  'on-tram': {
    need: `(${portion('CONFIGURING')} OR (${noPortions} AND cs.status='CONFIGURING'))`,
    completed: `(${allOperating})`,
    all: `(${after(['CONFIGURING', 'OPERATING'])} OR cs.status IN ('CONFIGURING','OPERATING'))`
  },
  'tai-chinh': {
    need: financialOpen,
    completed: `(NOT ${financialOpen} AND NOT (cs.deposit_status='NOT_REQUIRED' AND cs.payment_status='NOT_REQUIRED'))`,
    all: '1=1'
  }
};

const actionable = async (user) => {
  const permissions = await access.permissions(user);
  const owner = permissions.request_early
    ? await require('./proposalAccessService').buildOwnerScopeSql(user)
    : { sql: '1 = 0', params: [] };
  const expressions = {
    contract: permissions.back_office ? stageFilters['khoi-tao-hop-dong'].need : '0',
    infrastructure: permissions.back_office ? stageFilters['xay-dung-ha-tang'].need : '0',
    delivery: `(${permissions.back_office ? "(cs.status<>'ONBOARDING' AND NOT " + deliveryComplete + ')' : '0'}
      OR (${permissions.request_early ? '1' : '0'} AND cs.status='ONBOARDING'
        AND (${owner.sql}) AND ${readiness.deliveryMissingSql('cs', 'p')}))`,
    installation: permissions.setup ? stageFilters['lap-tru'].need : '0',
    acceptance: permissions.setup ? stageFilters['nghiem-thu'].need : '0',
    on_station: permissions.setup ? stageFilters['on-tram'].need : '0',
    finance: permissions.finance ? financialOpen : '0'
  };
  return { expressions, params: owner.params, permissions };
};

const getFilter = async (stage, tab, user) => {
  if (!['need', 'completed', 'all'].includes(tab)) throw Object.assign(new Error('Tab không hợp lệ'), { statusCode: 400 });
  if (stage === 'thong-tin-chung') {
    if (tab === 'all') return { sql: '1=1', params: [] };
    if (tab === 'completed') return { sql: `cs.status<>'CANCELLED' AND ${complete}`, params: [] };
    const tasks = await actionable(user);
    return { sql: `cs.status<>'CANCELLED' AND (${Object.values(tasks.expressions).join(' OR ')})`, params: tasks.params };
  }
  const definition = stageFilters[stage];
  if (!definition) throw Object.assign(new Error('Bước ON trạm không hợp lệ'), { statusCode: 400 });
  let sql = definition[tab];
  if (stage === 'giao-tru' && tab !== 'completed') {
    const permission = await access.permissions(user);
    if (permission.back_office && user.role !== 'SUPER_ADMIN') sql = `(${sql}) AND cs.status<>'ONBOARDING'`;
  }
  return { sql: tab === 'all' ? sql : `cs.status<>'CANCELLED' AND (${sql})`, params: [] };
};

module.exports = { getFilter, actionable, stageFilters, allOperating, complete };
