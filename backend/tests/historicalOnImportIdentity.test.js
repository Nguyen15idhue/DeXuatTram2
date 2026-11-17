const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveIdentity, resolveOwner } = require('../src/services/historicalOnImportIdentity');

test('matches by pair, keeps different proposals sharing a CMS separate', () => {
  const candidates = [
    { id: 1, legacy_code: '05-0226/Q12', cms_code: 'E.HCM0001' },
    { id: 2, legacy_code: '06-0226/HY', cms_code: 'E.HCM0001' }
  ];
  assert.equal(resolveIdentity({ legacy_code: ' 05-0226/Q12 ', cms_code: 'e.hcm0001' }, candidates).candidate.id, 1);
  assert.equal(resolveIdentity({ legacy_code: 'new', cms_code: 'E.HCM0001' }, candidates).action, 'create');
  assert.equal(resolveIdentity({ legacy_code: '05-0226/Q12', cms_code: 'other' }, candidates).action, 'create');
});

test('missing CMS matches by BCĐX, but ambiguous candidates require selection', () => {
  const candidates = [
    { id: 1, legacy_code: '02-0426', cms_code: 'E.BNI0002' },
    { id: 2, legacy_code: '02-0426', cms_code: 'E.BNI0003' }
  ];
  assert.equal(resolveIdentity({ legacy_code: '02-0426' }, candidates).action, 'choose');
  assert.equal(resolveIdentity({ legacy_code: '02-0426' }, candidates.slice(0, 1)).candidate.id, 1);
  assert.equal(resolveIdentity({ legacy_code: '02-0426' },
    [candidates[0], { id: 3, legacy_code: '02-0426', cms_code: null }]).action, 'choose');
  assert.throws(() => resolveIdentity({ cms_code: 'E.BNI0002' }, candidates), /Mã BCĐX/);
});

test('existing CMS without BCĐX requires confirmation rather than silently overwriting', () => {
  const candidate = { id: 7, legacy_code: null, cms_code: 'E.HCM0001' };
  assert.deepEqual(resolveIdentity({ legacy_code: '05-0226/Q12', cms_code: 'E.HCM0001' }, [candidate]),
    { action: 'choose', candidates: [candidate] });
  assert.equal(resolveIdentity({ legacy_code: '05-0226/Q12', cms_code: 'E.HCM0001' },
    [candidate, { id: 8, legacy_code: '05-0226/Q12', cms_code: 'E.HCM0001' }]).action, 'choose');
  assert.equal(resolveIdentity({ legacy_code: '05-0226/Q12', cms_code: 'E.HCM0001' },
    [{ id: 9, legacy_code: '05-0226/Q12', cms_code: null }]).action, 'choose');
});

test('matches active unique names, falls back to importer, and asks for duplicates', () => {
  const importer = { id: 9, full_name: 'Người nhập', role: 'SUPER_ADMIN' };
  const accounts = [
    { id: 1, full_name: 'Nguyễn A', status: 'ACTIVE', role: 'SALES' },
    { id: 2, full_name: 'Nguyễn A', status: 'ACTIVE', role: 'CTV' },
    { id: 3, full_name: 'Nguyễn B', status: 'ACTIVE', role: 'SALES' },
    { id: 4, full_name: 'Nguyễn C', status: 'LOCKED', role: 'CTV' }
  ];
  assert.equal(resolveOwner('Nguyễn A', accounts, importer).action, 'choose');
  assert.equal(resolveOwner(' nguyễn b ', accounts, importer).account.id, 3);
  assert.equal(resolveOwner('Nguyễn C', accounts, importer).account.id, 9);
  assert.equal(resolveOwner('', accounts, importer).account.id, 9);
});

test('explicit selections must be eligible reconciliation candidates', () => {
  const proposals = [
    { id: 1, legacy_code: '02-0426', cms_code: 'A' },
    { id: 2, legacy_code: '02-0426', cms_code: 'B' },
    { id: 3, legacy_code: 'OTHER', cms_code: 'C' }
  ];
  assert.equal(resolveIdentity({ legacy_code: '02-0426', existing_proposal_id: 2 }, proposals).candidate.id, 2);
  assert.throws(() => resolveIdentity({ legacy_code: '02-0426', existing_proposal_id: 3 }, proposals), /không thuộc/);
  assert.throws(() => resolveIdentity({ legacy_code: 'NEW', existing_proposal_id: 1 }, proposals), /không thuộc/);
  const accounts = [
    { id: 1, full_name: 'Nguyễn A', status: 'ACTIVE', role: 'SALES' },
    { id: 2, full_name: 'Nguyễn A', status: 'ACTIVE', role: 'CTV' },
    { id: 3, full_name: 'Nguyễn B', status: 'ACTIVE', role: 'SALES' },
    { id: 4, full_name: 'Nguyễn A', status: 'LOCKED', role: 'SALES' }
  ];
  const importer = { id: 9 };
  assert.equal(resolveOwner('Nguyễn A', accounts, importer, 2).account.id, 2);
  assert.throws(() => resolveOwner('Nguyễn A', accounts, importer, 3), /không thuộc/);
  assert.throws(() => resolveOwner('Nguyễn A', accounts, importer, 4), /không thuộc/);
  assert.throws(() => resolveOwner('Nguyễn A', accounts, importer, '2e0'), /không hợp lệ/);
});
