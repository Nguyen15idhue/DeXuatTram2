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
const earlyDeliveryRequested = `EXISTS(SELECT 1 FROM charging_station_activity_logs delivery_log
  WHERE delivery_log.charging_station_id=cs.id AND delivery_log.action='early_delivery_requested')`;
const infrastructureIncomplete = `(COALESCE(cs.infra_power_status,'NOT')<>'DONE'
  OR COALESCE(cs.infra_site_status,'NOT')<>'DONE')`;
const infrastructureBothDone = `(cs.infra_power_status='DONE' AND cs.infra_site_status='DONE')`;
const setupConfirmationRequired = readiness.requiresSetupConfirmationSql('cs', 'p');
const infrastructureSetupConfirmationTask = `(NOT ${deliveryComplete}
  AND ${setupConfirmationRequired}
  AND (${infrastructureBothDone} OR (cs.contract_status='DONE' AND ${earlyDeliveryRequested})))`;
const infrastructureCompleted = `(${infrastructureBothDone}
  AND (
    ${readiness.modelSql('p')} = 'NQ'
    OR COALESCE(cs.infra_delivery_legacy_exempt, 0) = 1
    OR (
      cs.infra_delivery_confirmation = 'CONFIRMED'
      AND UPPER(TRIM(COALESCE(cs.infra_delivery_confirmation_model, ''))) = ${readiness.modelSql('p')}
    )
  ))`;
const deliveryTask = `(NOT ${deliveryComplete}
  AND ${readiness.deliveryEligibleSql('cs', 'p', earlyDeliveryRequested)})`;
const canReceiveDeliveryTask = (user, permissions) => user?.role === 'SUPER_ADMIN' || permissions.back_office;
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
    need: `(${infrastructureIncomplete} AND cs.contract_status='DONE')`,
    completed: infrastructureCompleted, all: '1=1'
  },
  'giao-tru': {
    need: deliveryTask,
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
  const expressions = {
    contract: permissions.back_office ? stageFilters['khoi-tao-hop-dong'].need : '0',
    infrastructure: `((${stageFilters['xay-dung-ha-tang'].need} AND (${infrastructureScope.sql}))
      OR (${permissions.setup ? infrastructureSetupConfirmationTask : '0'}))`,
    delivery: canReceiveDeliveryTask(user, permissions) ? deliveryTask : '0',
    installation: permissions.setup ? stageFilters['lap-tru'].need : '0',
    acceptance: permissions.setup ? stageFilters['nghiem-thu'].need : '0',
    on_station: permissions.setup ? stageFilters['on-tram'].need : '0',
    finance: permissions.finance ? financialOpen : '0'
  };
  return { expressions, params: infrastructureScope.params, permissions };
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
  const sql = definition[tab];
  if (stage === 'xay-dung-ha-tang' && tab === 'need') {
    const permissions = await access.permissions(user);
    const scope = await access.buildInfrastructureTaskScope(user, permissions);
    return {
      sql: `cs.status<>'CANCELLED' AND (
        ((${sql}) AND (${scope.sql}))
        OR (${permissions.setup ? infrastructureSetupConfirmationTask : '0'})
      )`,
      params: scope.params
    };
  }
  if (stage === 'giao-tru' && tab === 'need' && !canReceiveDeliveryTask(user, await access.permissions(user))) {
    return { sql: '0', params: [] };
  }
  return { sql: tab === 'all' ? sql : `cs.status<>'CANCELLED' AND (${sql})`, params: [] };
};

module.exports = {
  getFilter,
  actionable,
  stageFilters,
  allOperating,
  complete,
  earlyDeliveryRequested,
  deliveryComplete,
  infrastructureSetupConfirmationTask,
  infrastructureCompleted,
  deliveryTask,
  setupConfirmationRequired
};
