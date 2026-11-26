const test = require('node:test');
const assert = require('node:assert/strict');
const readiness = require('../src/services/chargingStation/chargingStationReadiness.js');
const work = require('../src/services/chargingStation/chargingStationWorkService.js');
const stationService = require('../src/services/chargingStation/chargingStationService.js');

const readyStation = (overrides = {}) => ({
  contract_status: 'DONE',
  infra_power_status: 'DONE',
  infra_site_status: 'DONE',
  infra_delivery_confirmation: 'CONFIRMED',
  infra_delivery_confirmation_model: 'LK',
  infra_delivery_legacy_exempt: 0,
  deposit_status: 'RECEIVED',
  payment_status: 'DOING',
  contract_amount: '100.00',
  deposit_total: '30.00',
  payment_total: '65.00',
  refund_total: '5.00',
  ...overrides
});

test('model normalization and confirmation snapshot invalidation use canonical codes', () => {
  const station = readyStation({ infra_delivery_confirmation_model: 'NQ_LK' });
  assert.equal(readiness.normalizeInvestmentModel({ value: 'nq_lk' }), 'NQ_LK');
  assert.equal(readiness.isDeliveryConfirmed(station, 'NQ_LK'), true);
  assert.equal(readiness.isDeliveryConfirmed(station, 'LK'), false);
  assert.equal(readiness.requiresSetupConfirmation(station, 'LK'), true);
  assert.equal(readiness.requiresSetupConfirmation(station, 'NQ_LK'), true);
  assert.equal(readiness.requiresSetupConfirmation(station, 'NQ'), false);
  assert.equal(readiness.requiresSetupConfirmation({ ...station, infra_delivery_legacy_exempt: 1 }, 'LK'), false);
});

test('confirmation can be granted only after both infrastructure types are done or an early request exists', () => {
  const station = readyStation({ infra_site_status: 'DOING' });
  assert.equal(readiness.confirmationCanBeGranted(station, false), false);
  assert.equal(readiness.confirmationCanBeGranted(station, true), true);
  assert.equal(readiness.confirmationCanBeGranted(readyStation(), false), true);
});

test('revokes confirmation when an infrastructure rollback removes its last valid basis', async () => {
  const statements = [];
  let early = 0;
  const connection = { query: async (sql, params) => {
    statements.push([sql, params]);
    if (sql.includes(' AS early_delivery_requested')) return [[{ early_delivery_requested: early }]];
    return [[]];
  } };
  const station = readyStation({ id: 1, infra_site_status: 'NOT' });
  await stationService.revokeInvalidInfrastructureConfirmation(connection, station, { actorId: 1 });
  assert.ok(statements.some(([sql]) => sql.includes("infra_delivery_confirmation = 'NOT_CONFIRMED'")));
  assert.ok(statements.some(([sql]) => sql.includes('INSERT INTO charging_station_activity_logs')));
  statements.length = 0;
  early = 1;
  await stationService.revokeInvalidInfrastructureConfirmation(connection, station, { actorId: 1 });
  assert.equal(statements.some(([sql]) => sql.startsWith('UPDATE')), false);
  statements.length = 0;
  await stationService.revokeInvalidInfrastructureConfirmation(connection, { ...station, contract_status: 'DOING' }, { actorId: 1 });
  assert.ok(statements.some(([sql]) => sql.startsWith('UPDATE')));
});

test('normal delivery readiness enforces both infrastructure confirmations for non-NQ models', () => {
  assert.equal(readiness.evaluateDeliveryReadiness(readyStation(), 'LK').ready, true);
  const changedModel = readyStation({ infra_delivery_confirmation_model: 'TDT' });
  const changedResult = readiness.evaluateDeliveryReadiness(changedModel, 'LK');
  assert.equal(changedResult.ready, false);
  assert.ok(changedResult.missing.includes('infrastructure_confirmation'));

  const undoneInfrastructure = readyStation({ infra_site_status: 'DOING' });
  assert.ok(readiness.evaluateDeliveryReadiness(undoneInfrastructure, 'LK').missing.includes('infrastructure'));
});

test('NQ delivery allows one completed infrastructure type but requires exact 90 percent net payment', () => {
  const base = readyStation({
    infra_site_status: 'NOT',
    infra_delivery_confirmation: 'NOT_CONFIRMED',
    infra_delivery_confirmation_model: null,
    contract_amount: '1.00',
    deposit_total: '0.10',
    payment_total: '0.80',
    refund_total: '0.00'
  });
  assert.equal(readiness.evaluateDeliveryReadiness(base, 'NQ').ready, true);

  const belowThreshold = { ...base, payment_total: '0.7999' };
  const result = readiness.evaluateDeliveryReadiness(belowThreshold, 'NQ');
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes('nq_payment_threshold'));

  assert.equal(readiness.evaluateDeliveryReadiness({
    ...base,
    contract_amount: '0',
    deposit_total: '1',
    payment_total: '0',
    refund_total: '0'
  }, 'NQ').ready, false);
  assert.equal(readiness.evaluateDeliveryReadiness({
    ...base,
    payment_total: undefined
  }, 'NQ').ready, false);
});

test('NQ threshold uses exact decimal arithmetic and subtracts refunds', () => {
  assert.equal(readiness.evaluateDeliveryReadiness(readyStation({
    deposit_total: '10.01',
    payment_total: '89.99',
    refund_total: '10.00'
  }), 'NQ').ready, true);
  assert.equal(readiness.evaluateDeliveryReadiness(readyStation({
    deposit_total: '10.01',
    payment_total: '89.99',
    refund_total: '10.01'
  }), 'NQ').ready, false);
});

test('legacy exemption keeps old OR-infrastructure rule and skips NQ ratio', () => {
  const station = readyStation({
    infra_power_status: 'DONE',
    infra_site_status: 'NOT',
    infra_delivery_confirmation: 'NOT_CONFIRMED',
    infra_delivery_confirmation_model: null,
    infra_delivery_legacy_exempt: 1,
    deposit_total: '0',
    payment_total: '0',
    refund_total: '0'
  });
  const result = readiness.evaluateDeliveryReadiness(station, 'NQ');
  assert.equal(result.ready, true);
  assert.equal(result.missing.includes('nq_payment_threshold'), false);
});

test('SQL readiness mirrors model snapshot, legacy, and NQ money rules', () => {
  const sql = readiness.deliveryMissingSql('cs', 'p');
  assert.match(sql, /infra_delivery_confirmation_model/);
  assert.match(sql, /infra_delivery_legacy_exempt/);
  assert.match(sql, /'NQ'/);
  assert.match(sql, /charging_station_invoices/);
  assert.match(sql, /tong_gia_tri_chot \* 9/);
  assert.match(readiness.normalDeliveryEligibleSql('cs', 'p'), /^NOT /);
  assert.match(readiness.deliveryEligibleSql('cs', 'p'), /early_delivery_requested/);
  assert.match(readiness.modelSql('p'), /'NQ_LK'/);
});

test('infrastructure lists split owner incomplete work from setup confirmation and completion', () => {
  const need = work.stageFilters['xay-dung-ha-tang'].need;
  const completed = work.stageFilters['xay-dung-ha-tang'].completed;
  assert.match(need, /contract_status='DONE'/);
  assert.match(need, /infra_power_status/);
  assert.match(work.infrastructureSetupConfirmationTask, /infra_delivery_confirmation_model/);
  assert.match(work.infrastructureSetupConfirmationTask, /early_delivery_requested/);
  assert.match(completed, /infra_power_status='DONE' AND cs\.infra_site_status='DONE'/);
  assert.match(completed, /infra_delivery_legacy_exempt/);
  assert.match(completed, /infra_delivery_confirmation_model/);
});

test('early delivery bypass is restricted to NQ, legacy exemption, or matching confirmation', () => {
  assert.match(work.deliveryTask, /tong_gia_tri_chot/);
  assert.match(work.deliveryTask, /early_delivery_requested/);
  assert.match(readiness.isDeliveryEligibleSql('cs', 'p'), /infra_delivery_confirmation_model/);
  assert.match(readiness.isDeliveryEligibleSql('cs', 'p'), /infra_delivery_legacy_exempt/);
  assert.match(readiness.isDeliveryEligibleSql('cs', 'p'), /'NQ'/);
});

test('early delivery eligibility bypasses normal readiness only with the model-specific approval gate', () => {
  const incomplete = readyStation({
    contract_status: 'DONE',
    infra_power_status: 'NOT',
    infra_site_status: 'NOT',
    infra_delivery_confirmation: 'NOT_CONFIRMED',
    infra_delivery_confirmation_model: null,
    deposit_status: 'NOT_RECEIVED',
    payment_status: 'NOT'
  });
  assert.equal(readiness.isDeliveryEligible(incomplete, 'NQ', true), true);
  assert.equal(readiness.isDeliveryEligible({ ...incomplete, contract_status: 'NOT' }, 'NQ', true), false);
  assert.equal(readiness.isDeliveryEligible({
    ...incomplete,
    infra_delivery_legacy_exempt: 1
  }, 'LK', true), true);
  assert.equal(readiness.isDeliveryEligible(incomplete, 'LK', true), false);
  assert.equal(readiness.isDeliveryEligible({
    ...incomplete,
    infra_delivery_confirmation: 'CONFIRMED',
    infra_delivery_confirmation_model: 'TDT'
  }, 'LK', true), false);
  assert.equal(readiness.isDeliveryEligible({
    ...incomplete,
    infra_delivery_confirmation: 'CONFIRMED',
    infra_delivery_confirmation_model: 'LK'
  }, 'LK', true), true);
});
