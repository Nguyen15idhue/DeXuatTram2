const { DEPOSIT_RECEIVED_STATUSES } = require('../../constants/chargingStations');

const MODEL_ALIASES = {
  TDT: 'TDT',
  LK: 'LK',
  NQ: 'NQ',
  NQ_LK: 'NQ_LK',
  'TU DAU TU': 'TDT',
  'LIEN KET': 'LK',
  'NHUONG QUYEN': 'NQ',
  'NHUONG QUYEN + LIEN KET': 'NQ_LK'
};

const stripAccents = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const normalizeInvestmentModel = (value) => {
  const raw = value && typeof value === 'object' ? (value.value ?? value.label) : value;
  return MODEL_ALIASES[stripAccents(raw)] || null;
};

const getFinanceRequirements = (model) => {
  const required = normalizeInvestmentModel(model) !== 'TDT';
  return { requiresDeposit: required, requiresPayment: required };
};

const isDepositReceived = (status) => DEPOSIT_RECEIVED_STATUSES.includes(status);
const isInfraPowerDone = (station) => station.infra_power_status === 'DONE';
const isInfraSiteDone = (station) => station.infra_site_status === 'DONE';
const isInfrastructureComplete = (station) => isInfraPowerDone(station) && isInfraSiteDone(station);
const isEarlyInfrastructureComplete = (station) => isInfraPowerDone(station) || isInfraSiteDone(station);
const isLegacyInfrastructureExempt = (station) => Number(station.infra_delivery_legacy_exempt) === 1;
const isDeliveryConfirmed = (station, model) => {
  const normalizedModel = normalizeInvestmentModel(model);
  return station.infra_delivery_confirmation === 'CONFIRMED'
    && normalizedModel !== null
    && normalizeInvestmentModel(station.infra_delivery_confirmation_model) === normalizedModel;
};

const requiresSetupConfirmation = (station, model) => (
  normalizeInvestmentModel(model) !== 'NQ'
  && !isLegacyInfrastructureExempt(station)
);

const confirmationCanBeGranted = (station, earlyRequested) => (
  isInfrastructureComplete(station) || Boolean(earlyRequested)
);

const parseDecimal = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const fraction = match[3] || '';
  const coefficient = BigInt(`${match[1] === '-' ? '-' : ''}${match[2]}${fraction}`);
  return { coefficient, scale: fraction.length };
};

const reachesNqPaymentThreshold = (station) => {
  const deposit = parseDecimal(station.deposit_total);
  const payment = parseDecimal(station.payment_total);
  const refund = parseDecimal(station.refund_total);
  const contract = parseDecimal(station.contract_amount);
  if (!deposit || !payment || !refund || !contract) return false;

  const scale = Math.max(deposit.scale, payment.scale, refund.scale, contract.scale);
  const toScale = ({ coefficient, scale: valueScale }) => coefficient * (10n ** BigInt(scale - valueScale));
  const netPaid = toScale(deposit) + toScale(payment) - toScale(refund);
  const total = toScale(contract);
  return total > 0n && netPaid * 10n >= total * 9n;
};

const MISSING_LABELS = {
  contract: 'Hợp đồng',
  infrastructure: 'Hạ tầng (điện và mặt bằng)',
  infrastructure_confirmation: 'Xác nhận hoàn thành hạ tầng',
  deposit: 'Tiền cọc',
  payment: 'Thanh toán (ít nhất 1 phần)',
  nq_payment_threshold: 'Thanh toán tối thiểu 90% giá trị chốt'
};

const evaluateDeliveryReadiness = (station, model) => {
  const normalizedModel = normalizeInvestmentModel(model);
  const requirements = getFinanceRequirements(normalizedModel);
  const legacyExempt = isLegacyInfrastructureExempt(station);
  const missing = [];

  if (station.contract_status !== 'DONE') missing.push('contract');

  const infrastructureReady = legacyExempt
    ? isEarlyInfrastructureComplete(station)
    : normalizedModel === 'NQ'
      ? isEarlyInfrastructureComplete(station)
      : isInfrastructureComplete(station);
  if (!infrastructureReady) missing.push('infrastructure');
  if (requiresSetupConfirmation(station, normalizedModel) && !isDeliveryConfirmed(station, normalizedModel)) {
    missing.push('infrastructure_confirmation');
  }

  if (requirements.requiresDeposit && !isDepositReceived(station.deposit_status)) missing.push('deposit');
  if (requirements.requiresPayment && !['DOING', 'DONE'].includes(station.payment_status)) {
    missing.push('payment');
  }
  if (!legacyExempt && normalizedModel === 'NQ' && !reachesNqPaymentThreshold(station)) {
    missing.push('nq_payment_threshold');
  }

  return {
    ready: missing.length === 0,
    missing,
    missingLabels: missing.map((key) => MISSING_LABELS[key]),
    requirements
  };
};

const isDeliveryEligible = (station, model, earlyRequested) => {
  if (evaluateDeliveryReadiness(station, model).ready) return true;
  return Boolean(earlyRequested) && (
    isLegacyInfrastructureExempt(station)
    || (station.contract_status === 'DONE' && (
      normalizeInvestmentModel(model) === 'NQ' || isDeliveryConfirmed(station, model)
    ))
  );
};

const modelSql = (proposalAlias = 'p') => `(
  CASE UPPER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${proposalAlias}.custom_data, '$.mo_hinh_dau_tu')), ''))) COLLATE utf8mb4_0900_ai_ci
    WHEN 'TDT' THEN 'TDT'
    WHEN 'TU DAU TU' THEN 'TDT'
    WHEN 'LK' THEN 'LK'
    WHEN 'LIEN KET' THEN 'LK'
    WHEN 'NQ' THEN 'NQ'
    WHEN 'NHUONG QUYEN' THEN 'NQ'
    WHEN 'NQ_LK' THEN 'NQ_LK'
    WHEN 'NHUONG QUYEN + LIEN KET' THEN 'NQ_LK'
    ELSE NULL
  END
)`;

const requiresSetupConfirmationSql = (stationAlias = 'cs', proposalAlias = 'p') => `(
  COALESCE(${modelSql(proposalAlias)}, '') <> 'NQ'
  AND COALESCE(${stationAlias}.infra_delivery_legacy_exempt, 0) = 0
  AND (
    COALESCE(${stationAlias}.infra_delivery_confirmation, 'NOT_CONFIRMED') <> 'CONFIRMED'
    OR ${modelSql(proposalAlias)} IS NULL
    OR UPPER(TRIM(COALESCE(${stationAlias}.infra_delivery_confirmation_model, ''))) <> ${modelSql(proposalAlias)}
  )
)`;

const sumInvoicesSql = (stationAlias, invoiceType) => `(SELECT COALESCE(SUM(i.amount), 0)
  FROM charging_station_invoices i
  WHERE i.charging_station_id = ${stationAlias}.id AND i.invoice_type = '${invoiceType}')`;

const nqPaymentThresholdMissingSql = (stationAlias = 'cs', proposalAlias = 'p') => `(
  COALESCE(${proposalAlias}.tong_gia_tri_chot, 0) <= 0
  OR (
    (${sumInvoicesSql(stationAlias, 'DEPOSIT')} + ${sumInvoicesSql(stationAlias, 'PAYMENT')}
      - ${sumInvoicesSql(stationAlias, 'REFUND')}) * 10
    < ${proposalAlias}.tong_gia_tri_chot * 9
  )
)`;

const deliveryMissingSql = (stationAlias = 'cs', proposalAlias = 'p') => {
  const model = modelSql(proposalAlias);
  const legacy = `COALESCE(${stationAlias}.infra_delivery_legacy_exempt, 0) = 1`;
  const infraPowerIncomplete = `COALESCE(${stationAlias}.infra_power_status, 'NOT') <> 'DONE'`;
  const infraSiteIncomplete = `COALESCE(${stationAlias}.infra_site_status, 'NOT') <> 'DONE'`;
  const infrastructureMissing = `(
    (${legacy} AND (${infraPowerIncomplete} AND ${infraSiteIncomplete}))
    OR (
      COALESCE(${stationAlias}.infra_delivery_legacy_exempt, 0) = 0
      AND (
        (${model} = 'NQ' AND ${infraPowerIncomplete} AND ${infraSiteIncomplete})
        OR (
          (${model} IS NULL OR ${model} <> 'NQ')
          AND (${infraPowerIncomplete} OR ${infraSiteIncomplete}
            OR COALESCE(${stationAlias}.infra_delivery_confirmation, 'NOT_CONFIRMED') <> 'CONFIRMED'
            OR ${model} IS NULL
            OR UPPER(TRIM(COALESCE(${stationAlias}.infra_delivery_confirmation_model, ''))) <> ${model})
        )
      )
    )
  )`;
  return `(
    COALESCE(${stationAlias}.contract_status, 'NOT') <> 'DONE'
    OR ${infrastructureMissing}
    OR (
      COALESCE(${model}, '') <> 'TDT'
      AND (
        COALESCE(${stationAlias}.deposit_status, 'NOT_RECEIVED') NOT IN ('RECEIVED', 'REFUND_PENDING', 'REFUNDED')
        OR COALESCE(${stationAlias}.payment_status, 'NOT') NOT IN ('DOING', 'DONE')
      )
    )
    OR (
      COALESCE(${stationAlias}.infra_delivery_legacy_exempt, 0) = 0
      AND ${model} = 'NQ'
      AND ${nqPaymentThresholdMissingSql(stationAlias, proposalAlias)}
    )
  )`;
};

const normalDeliveryEligibleSql = (stationAlias = 'cs', proposalAlias = 'p') => (
  `NOT ${deliveryMissingSql(stationAlias, proposalAlias)}`
);

const isDeliveryEligibleSql = (
  stationAlias = 'cs',
  proposalAlias = 'p',
  earlyRequestedSql = `EXISTS(SELECT 1 FROM charging_station_activity_logs delivery_log
    WHERE delivery_log.charging_station_id=${stationAlias}.id AND delivery_log.action='early_delivery_requested')`
) => {
  const model = modelSql(proposalAlias);
  const earlyApprovalGate = `(
    COALESCE(${stationAlias}.infra_delivery_legacy_exempt, 0) = 1
    OR (${stationAlias}.contract_status = 'DONE' AND (
      ${model} = 'NQ'
      OR (
        ${model} IS NOT NULL
        AND ${stationAlias}.infra_delivery_confirmation = 'CONFIRMED'
        AND UPPER(TRIM(COALESCE(${stationAlias}.infra_delivery_confirmation_model, ''))) = ${model}
      )
    ))
  )`;
  return `(
    ${normalDeliveryEligibleSql(stationAlias, proposalAlias)}
    OR (${earlyRequestedSql} AND ${earlyApprovalGate})
  )`;
};

const deliveryEligibleSql = isDeliveryEligibleSql;

const MAX_DEADLINE_EXTENSIONS = 3;
const DEADLINE_EXTENSION_DAYS = 3;
const ONBOARDING_AUTO_CANCEL_ENABLED = false;

const isDeadlineActive = (station) => {
  if (station.status !== 'ONBOARDING') return false;
  const requirements = getFinanceRequirements(station.mo_hinh_dau_tu);
  const contractComplete = station.contract_status === 'DONE';
  const infrastructureComplete = isEarlyInfrastructureComplete(station);
  const depositComplete = !requirements.requiresDeposit || isDepositReceived(station.deposit_status);
  const paymentComplete = !requirements.requiresPayment || ['DOING', 'DONE'].includes(station.payment_status);
  return !(contractComplete && infrastructureComplete && depositComplete && paymentComplete);
};

const deadlineActiveSql = (stationAlias = 'cs', proposalAlias = 'p') => {
  const model = `UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${proposalAlias}.custom_data, '$.mo_hinh_dau_tu')), ''))`;
  return `(
    ${stationAlias}.status = 'ONBOARDING'
    AND NOT (
      COALESCE(${stationAlias}.contract_status, 'NOT') = 'DONE'
      AND (COALESCE(${stationAlias}.infra_power_status, 'NOT') = 'DONE'
        OR COALESCE(${stationAlias}.infra_site_status, 'NOT') = 'DONE')
      AND (
        ${model} = 'TDT'
        OR (
          ${stationAlias}.deposit_status IN ('RECEIVED', 'REFUND_PENDING', 'REFUNDED')
          AND COALESCE(${stationAlias}.payment_status, 'NOT') IN ('DOING', 'DONE')
        )
      )
    )
  )`;
};

module.exports = {
  normalizeInvestmentModel,
  modelSql,
  getFinanceRequirements,
  isDepositReceived,
  isDeliveryConfirmed,
  requiresSetupConfirmation,
  confirmationCanBeGranted,
  evaluateDeliveryReadiness,
  isDeliveryEligible,
  deliveryMissingSql,
  deliveryEligibleSql,
  normalDeliveryEligibleSql,
  isDeliveryEligibleSql,
  requiresSetupConfirmationSql,
  isDeadlineActive,
  deadlineActiveSql,
  MAX_DEADLINE_EXTENSIONS,
  DEADLINE_EXTENSION_DAYS,
  ONBOARDING_AUTO_CANCEL_ENABLED,
  MISSING_LABELS
};
