const access = require('./chargingStationAccessService');
const readiness = require('./chargingStationReadiness');

const after = (stages) => `EXISTS(SELECT 1 FROM charging_station_deployments d
  WHERE d.charging_station_id=cs.id AND d.returned_at IS NULL AND d.stage IN (${stages.map(s => `'${s}'`).join(',')}))`;
const noPortions = 'NOT EXISTS(SELECT 1 FROM charging_station_deployments d WHERE d.charging_station_id=cs.id AND d.returned_at IS NULL)';
const committed = '(SELECT COALESCE(SUM(c.quantity),0) FROM charging_station_commitments c WHERE c.charging_station_id=cs.id)';
const noCommitments = `${committed}=0`;
const everyReceived = `NOT EXISTS(SELECT 1 FROM charging_station_commitments c
  WHERE c.charging_station_id=cs.id AND c.quantity >
    (SELECT COALESCE(SUM(i.received_quantity),0) FROM warehouse_export_items i WHERE i.commitment_id=c.id))`;
const everyOperating = `NOT EXISTS(SELECT 1 FROM charging_station_commitments c
  WHERE c.charging_station_id=cs.id AND c.quantity >
    (SELECT COALESCE(SUM(d.on_quantity),0) FROM charging_station_deployments d
      JOIN warehouse_export_items i ON i.id=d.export_item_id
      WHERE i.commitment_id=c.id AND d.charging_station_id=cs.id AND d.returned_at IS NULL))`;
const overridden = "(cs.status='OPERATING' AND COALESCE(JSON_EXTRACT(cs.workflow_override,'$.completed')=true,0))";
const deliveryComplete = `(${overridden} OR (${committed}>0 AND cs.fulfillment_review_required=0 AND ${everyReceived})
  OR (${noCommitments} AND cs.fulfillment_review_required=0 AND cs.status IN ('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING')))`;
const allOperating = `(${overridden} OR (${committed}>0 AND cs.fulfillment_review_required=0
  AND (SELECT COUNT(*) FROM charging_station_commitments c WHERE c.charging_station_id=cs.id)=JSON_LENGTH(p.chot_so_luong_tru)
  AND ${everyOperating})
  OR (${noCommitments} AND cs.fulfillment_review_required=0 AND ${noPortions} AND cs.status='OPERATING'))`;
const financialOpen = `(cs.deposit_status IN ('NOT_RECEIVED','REFUND_PENDING')
  OR cs.payment_status IN ('NOT','DOING')
  OR (cs.deposit_refund_required=1 AND
    (SELECT COALESCE(SUM(CASE WHEN i.invoice_type='DEPOSIT' THEN i.amount
      WHEN i.invoice_type='REFUND' THEN -i.amount ELSE 0 END),0)
     FROM charging_station_invoices i WHERE i.charging_station_id=cs.id)>0))`;
const complete = `(${allOperating} AND cs.contract_status='DONE'
  AND cs.infra_power_status='DONE' AND cs.infra_site_status='DONE' AND NOT ${financialOpen})`;
const availablePortion = `d.returned_at IS NULL AND NOT EXISTS(
  SELECT 1 FROM warehouse_export_items return_item JOIN warehouse_exports return_export ON return_export.id=return_item.export_id
  WHERE return_item.id=d.export_item_id AND (return_export.transport_status IN ('RETURN_PENDING','RETURNED')
    OR return_item.return_pending_quantity>0))`;
const installationExists = `EXISTS(SELECT 1 FROM charging_station_deployments d WHERE d.charging_station_id=cs.id
  AND ${availablePortion} AND d.stage IN ('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING'))`;
const allInstalled = `(${overridden} OR (
  ${committed}>0 AND cs.fulfillment_review_required=0
  AND (SELECT COUNT(*) FROM charging_station_commitments c WHERE c.charging_station_id=cs.id)=JSON_LENGTH(p.chot_so_luong_tru)
  AND NOT EXISTS(SELECT 1 FROM charging_station_commitments c WHERE c.charging_station_id=cs.id AND c.quantity >
    (SELECT COALESCE(SUM(d.quantity),0) FROM charging_station_deployments d
      JOIN warehouse_export_items i ON i.id=d.export_item_id
      WHERE i.commitment_id=c.id AND d.charging_station_id=cs.id AND d.returned_at IS NULL AND d.installation_status='DONE'))))`;
const acceptancePending = `EXISTS(SELECT 1 FROM charging_station_deployments d WHERE d.charging_station_id=cs.id
  AND ${availablePortion} AND d.installation_status='DONE' AND d.acceptance_status<>'PASSED')`;
const onPending = `EXISTS(SELECT 1 FROM charging_station_deployments d WHERE d.charging_station_id=cs.id
  AND ${availablePortion} AND d.installation_status='DONE' AND d.on_quantity<d.quantity)`;
const onStarted = `EXISTS(SELECT 1 FROM charging_station_deployments d WHERE d.charging_station_id=cs.id
  AND ${availablePortion} AND (d.installation_status='DONE' OR d.on_quantity>0))`;
const allAccepted = `(${committed}>0 AND cs.fulfillment_review_required=0
  AND (SELECT COUNT(*) FROM charging_station_commitments c WHERE c.charging_station_id=cs.id)=JSON_LENGTH(p.chot_so_luong_tru)
  AND NOT EXISTS(SELECT 1 FROM charging_station_commitments c WHERE c.charging_station_id=cs.id AND c.quantity >
    (SELECT COALESCE(SUM(d.quantity),0) FROM charging_station_deployments d
      JOIN warehouse_export_items i ON i.id=d.export_item_id
      WHERE i.commitment_id=c.id AND d.charging_station_id=cs.id AND d.returned_at IS NULL AND d.acceptance_status='PASSED')))`;

const stageFilters = {
  'khoi-tao-hop-dong': {
    need: "cs.contract_status IN ('NOT','DOING')",
    completed: "cs.contract_status='DONE'", all: '1=1'
  },
  'xay-dung-ha-tang': {
    need: "(cs.contract_status='DONE' AND (COALESCE(cs.infra_power_status,'NOT')<>'DONE' OR COALESCE(cs.infra_site_status,'NOT')<>'DONE'))",
    completed: "(cs.infra_power_status='DONE' AND cs.infra_site_status='DONE')", all: '1=1'
  },
  'giao-tru': {
    need: `NOT ${deliveryComplete}`,
    completed: deliveryComplete, all: '1=1'
  },
  'lap-tru': {
    need: `(NOT ${allInstalled} AND (${installationExists} OR (${noCommitments} AND cs.status IN ('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING'))))`,
    completed: allInstalled,
    all: `(${after(['INSTALLING', 'ACCEPTANCE', 'CONFIGURING', 'OPERATING'])} OR cs.status IN ('INSTALLING','ACCEPTANCE','CONFIGURING','OPERATING'))`
  },
  'nghiem-thu': {
    need: `(NOT ${overridden} AND (${acceptancePending} OR (${noPortions} AND cs.status='ACCEPTANCE')))`,
    completed: `(${overridden} OR ${allAccepted}
      OR (${noCommitments} AND ${noPortions} AND cs.fulfillment_review_required=0 AND cs.status IN ('CONFIGURING','OPERATING')))`,
    all: `(${after(['ACCEPTANCE', 'CONFIGURING', 'OPERATING'])} OR cs.status IN ('ACCEPTANCE','CONFIGURING','OPERATING'))`
  },
  'on-tram': {
    need: `(NOT ${allOperating} AND (${onPending} OR ${onStarted} OR (${noPortions} AND cs.status='CONFIGURING')))`,
    completed: `(${allOperating})`,
    all: `(${after(['ACCEPTANCE', 'CONFIGURING', 'OPERATING'])} OR cs.status IN ('CONFIGURING','OPERATING'))`
  },
  'tai-chinh': {
    need: financialOpen,
    completed: `(NOT ${financialOpen} AND NOT (cs.deposit_status='NOT_REQUIRED' AND cs.payment_status='NOT_REQUIRED'))`,
    all: '1=1'
  }
};

const actionable = async (user) => {
  const permissions = await access.permissions(user);
  const infrastructureScope = await access.buildInfrastructureTaskScope(user, permissions);
  const owner = permissions.request_early
    ? await require('./proposalAccessService').buildOwnerScopeSql(user)
    : { sql: '1 = 0', params: [] };
  const expressions = {
    contract: permissions.back_office ? stageFilters['khoi-tao-hop-dong'].need : '0',
    infrastructure: `(${stageFilters['xay-dung-ha-tang'].need} AND (${infrastructureScope.sql}))`,
    delivery: `(${permissions.back_office ? "(cs.status<>'ONBOARDING' AND NOT " + deliveryComplete + ')' : '0'}
      OR (${permissions.request_early ? '1' : '0'} AND cs.status='ONBOARDING'
        AND (${owner.sql}) AND ${readiness.deliveryMissingSql('cs', 'p')}))`,
    installation: permissions.setup ? stageFilters['lap-tru'].need : '0',
    acceptance: permissions.setup ? stageFilters['nghiem-thu'].need : '0',
    on_station: permissions.setup ? stageFilters['on-tram'].need : '0',
    finance: permissions.finance ? financialOpen : '0'
  };
  return { expressions, params: [...infrastructureScope.params, ...owner.params], permissions };
};

const getFilter = async (stage, tab, user) => {
  if (!['need', 'completed', 'all'].includes(tab)) throw Object.assign(new Error('Tab không hợp lệ'), { statusCode: 400 });
  if (stage === 'thong-tin-chung') {
    if (tab === 'all') return { sql: '1=1', params: [] };
    if (tab === 'completed') return { sql: `cs.status<>'CANCELLED' AND ${allOperating}`, params: [] };
    return { sql: `cs.status<>'CANCELLED' AND NOT ${allOperating}`, params: [] };
  }
  const definition = stageFilters[stage];
  if (!definition) throw Object.assign(new Error('Bước ON trạm không hợp lệ'), { statusCode: 400 });
  let sql = definition[tab];
  if (stage === 'xay-dung-ha-tang' && tab === 'need') {
    const scope = await access.buildInfrastructureTaskScope(user);
    return { sql: `cs.status<>'CANCELLED' AND (${sql}) AND (${scope.sql})`, params: scope.params };
  }
  if (stage === 'giao-tru' && tab !== 'completed') {
    const permission = await access.permissions(user);
    if (permission.back_office && user.role !== 'SUPER_ADMIN') sql = `(${sql}) AND cs.status<>'ONBOARDING'`;
  }
  return { sql: tab === 'all' ? sql : `cs.status<>'CANCELLED' AND (${sql})`, params: [] };
};

module.exports = { getFilter, actionable, stageFilters, allOperating, complete };
