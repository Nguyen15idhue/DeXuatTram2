import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NUMBERED_PROPOSAL_STATUSES,
  getNumberedProposalStatusLabel,
  getNumberedProposalStatusOptions,
  getProposalStatusFilterOptions
} from './src/utils/proposalStatus.js';

test('all 16 workflow codes have stable sequential labels', () => {
  assert.equal(NUMBERED_PROPOSAL_STATUSES.length, 16);
  NUMBERED_PROPOSAL_STATUSES.forEach((option, index) => {
    assert.ok(option.label.startsWith(`${index + 1}. `));
    assert.equal(option.sort_order, index + 1);
  });
  assert.equal(getNumberedProposalStatusLabel('PENDING', 'Đang đề xuất'), '1. Mới đề xuất');
  assert.equal(getNumberedProposalStatusLabel('ACTIVE'), '16. Hoạt động');
});

test('configured styling survives, legacy options remain last, obsolete COMPLETED stays removed', () => {
  const configured = [
    { value: 'ACTIVE', label: 'Old', color: '#123456', icon: 'evStation', borderRadius: 'square', sort_order: -1 },
    { value: 'PENDING', label: 'Đang đề xuất', color: '#abcdef', sort_order: 999 },
    { value: 'CUSTOM', label: 'Custom status' },
    { value: 'COMPLETED', label: 'Obsolete' }
  ];
  const before = JSON.stringify(configured);
  const options = getProposalStatusFilterOptions(getNumberedProposalStatusOptions(configured, true));
  assert.deepEqual(options.slice(0, 16).map(option => option.value), NUMBERED_PROPOSAL_STATUSES.map(option => option.value));
  assert.equal(options.find(option => option.value === 'ACTIVE').color, '#123456');
  assert.equal(options.find(option => option.value === 'ACTIVE').icon, 'evStation');
  assert.equal(options.find(option => option.value === 'ACTIVE').borderRadius, 'square');
  assert.equal(options.find(option => option.value === 'PRINCIPLE_APPROVED').label, 'Duyệt chủ trương');
  assert.equal(options.some(option => option.value === 'COMPLETED'), false);
  assert.equal(options.at(-1).label, 'Custom status');
  assert.equal(JSON.stringify(configured), before);
});

test('restricted editor options are not expanded and unscoped legacy behavior is unchanged', () => {
  const options = getNumberedProposalStatusOptions([{ value: 'PENDING' }]);
  assert.equal(options.length, 1);
  assert.equal(options[0].value, 'PENDING');
  assert.equal(getNumberedProposalStatusLabel('UNKNOWN', 'Configured label'), 'Configured label');
  assert.equal(getProposalStatusFilterOptions([{ value: 'PENDING', label: 'Đang đề xuất' }])
    .find(option => option.value === 'PENDING').label, 'Đang đề xuất');
});
