const { DEPOSIT_RECEIVED_STATUSES } = require('../constants/chargingStations');

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

// Chỉ Tự đầu tư (công ty đầu tư 100%) được miễn cọc và thanh toán.
const getFinanceRequirements = (model) => {
  const required = normalizeInvestmentModel(model) !== 'TDT';
  return { requiresDeposit: required, requiresPayment: required };
};

const isDepositReceived = (status) => DEPOSIT_RECEIVED_STATUSES.includes(status);

const MISSING_LABELS = {
  contract: 'Hợp đồng',
  infrastructure: 'Hạ tầng (điện hoặc mặt bằng)',
  deposit: 'Tiền cọc',
  payment: 'Thanh toán (ít nhất 1 phần)'
};

const evaluateDeliveryReadiness = (station, model) => {
  const requirements = getFinanceRequirements(model);
  const missing = [];
  if (station.contract_status !== 'DONE') missing.push('contract');
  if (station.infra_power_status !== 'DONE' && station.infra_site_status !== 'DONE') {
    missing.push('infrastructure');
  }
  if (requirements.requiresDeposit && !isDepositReceived(station.deposit_status)) missing.push('deposit');
  if (requirements.requiresPayment && !['DOING', 'DONE'].includes(station.payment_status)) {
    missing.push('payment');
  }
  return {
    ready: missing.length === 0,
    missing,
    missingLabels: missing.map((key) => MISSING_LABELS[key]),
    requirements
  };
};

// Điều kiện SQL tương ứng với evaluateDeliveryReadiness, dùng cho đếm/lọc danh sách.
const modelSql = (proposalAlias = 'p') => (
  `UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${proposalAlias}.custom_data, '$.mo_hinh_dau_tu')), ''))`
);

const deliveryMissingSql = (stationAlias = 'cs', proposalAlias = 'p') => `(
  COALESCE(${stationAlias}.contract_status, 'NOT') <> 'DONE'
  OR (COALESCE(${stationAlias}.infra_power_status, 'NOT') <> 'DONE' AND COALESCE(${stationAlias}.infra_site_status, 'NOT') <> 'DONE')
  OR (
    ${modelSql(proposalAlias)} <> 'TDT'
    AND (
      ${stationAlias}.deposit_status NOT IN ('RECEIVED', 'REFUND_PENDING', 'REFUNDED')
      OR COALESCE(${stationAlias}.payment_status, 'NOT') NOT IN ('DOING', 'DONE')
    )
  )
)`;

const MAX_DEADLINE_EXTENSIONS = 3;
const DEADLINE_EXTENSION_DAYS = 3;

const isDeadlineActive = (station) => {
  if (station.status !== 'ONBOARDING') return false;
  const requirements = getFinanceRequirements(station.mo_hinh_dau_tu);
  const contractComplete = station.contract_status === 'DONE';
  const infrastructureComplete = station.infra_power_status === 'DONE' || station.infra_site_status === 'DONE';
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
  getFinanceRequirements,
  isDepositReceived,
  evaluateDeliveryReadiness,
  deliveryMissingSql,
  isDeadlineActive,
  deadlineActiveSql,
  MAX_DEADLINE_EXTENSIONS,
  DEADLINE_EXTENSION_DAYS,
  MISSING_LABELS
};
