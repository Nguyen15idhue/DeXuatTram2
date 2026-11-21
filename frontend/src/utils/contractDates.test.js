import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateContractExpiry, getContractTermYears } from './contractDates.js';

test('calculates whole calendar years and clamps leap day', () => {
  assert.equal(calculateContractExpiry('2024-02-29', '1'), '2025-02-28');
  assert.equal(calculateContractExpiry('2024-02-29', '4'), '2028-02-29');
  assert.equal(calculateContractExpiry('2026-11-12', '5'), '2031-11-12');
  assert.equal(getContractTermYears('2024-02-29', '2025-02-28'), '1');
  assert.equal(getContractTermYears('2024-03-01', '2025-09-01'), '');
});

test('rejects malformed dates, nonpositive or fractional terms and overflow', () => {
  for (const [date, years] of [
    ['2026-02-29', '1'], ['', '1'], ['2026-01-01', '0'],
    ['2026-01-01', '-1'], ['2026-01-01', '1.5'], ['9999-12-31', '1']
  ]) assert.equal(calculateContractExpiry(date, years), '');
});
