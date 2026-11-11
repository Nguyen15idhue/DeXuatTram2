const assert = require('node:assert/strict');

async function main() {
  const { getProposalStatusFilterOptions, isRetiredProposalStatusOption } = await import('./src/utils/proposalStatus.js');
  const options = getProposalStatusFilterOptions([
    { value: 'PENDING', label: 'Nhãn tùy chỉnh', sort_order: 1 },
    { value: 'GRADING', label: 'Đang chấm điểm', sort_order: 10 }
  ]);
  const values = options.map(option => option.value);

  for (const status of [
    'PENDING', 'REVIEWING', 'PRINCIPLE_APPROVED', 'APPROVED', 'CANCELLED',
    'ARCHIVED', 'REJECTED', 'CONTRACT_SIGNED', 'CONTRACT_FAILED', 'GRADING'
  ]) {
    assert.ok(values.includes(status), `Missing filter option: ${status}`);
  }

  assert.equal(values.includes('COMPLETED'), false);
  assert.equal(values.filter(value => value === 'PENDING').length, 1);
  assert.equal(options.find(option => option.value === 'PENDING').label, 'Nhãn tùy chỉnh');
  assert.equal(options.find(option => option.value === 'PRINCIPLE_APPROVED').label, 'Duyệt chủ trương (bản ghi cũ)');
  assert.equal(isRetiredProposalStatusOption('station_proposals', 'status', 'PRINCIPLE_APPROVED'), true);

  console.log('Proposal status filter test passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
