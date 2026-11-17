const text = value => String(value ?? '').trim();
const canonical = value => text(value).toLocaleLowerCase('vi-VN');
const fail = message => Object.assign(new Error(message), { statusCode: 400 });

const selectedId = (value, label) => {
  if (value === undefined || value === null || text(value) === '') return null;
  if (!/^[1-9]\d*$/.test(text(value)) || !Number.isSafeInteger(Number(value))) {
    throw fail(`${label} không hợp lệ`);
  }
  return Number(value);
};

const resolveIdentity = (source, candidates) => {
  const legacyCode = canonical(source.legacy_code);
  const cmsCode = canonical(source.cms_code);
  if (!legacyCode) throw fail('Mã BCĐX là bắt buộc');
  if (!Array.isArray(candidates)) throw new TypeError('Danh sách hồ sơ đối chiếu không hợp lệ');
  const chosenId = selectedId(source.existing_proposal_id, 'ID đề xuất');
  const choose = result => {
    if (chosenId === null) return result;
    const options = result.action === 'choose' ? result.candidates
      : result.action === 'update' ? [result.candidate] : [];
    const chosen = options.find(candidate => Number(candidate.id) === chosenId);
    if (!chosen) throw fail('ID đề xuất không thuộc các hồ sơ đối chiếu phù hợp');
    return { action: 'update', candidate: chosen };
  };

  const sameLegacy = candidates.filter(candidate => canonical(candidate.legacy_code) === legacyCode);
  if (!cmsCode) {
    if (sameLegacy.length === 1) return choose({ action: 'update', candidate: sameLegacy[0] });
    if (sameLegacy.length > 1) return choose({ action: 'choose', candidates: sameLegacy });
    return choose({ action: 'create' });
  }

  const samePair = sameLegacy.filter(candidate => canonical(candidate.cms_code) === cmsCode);
  const unlinkedCms = candidates.filter(candidate => canonical(candidate.cms_code) === cmsCode
    && !canonical(candidate.legacy_code));
  const missingCms = sameLegacy.filter(candidate => !canonical(candidate.cms_code));
  if (samePair.length + unlinkedCms.length + missingCms.length > 1) {
    return choose({ action: 'choose', candidates: [...samePair, ...unlinkedCms, ...missingCms] });
  }
  if (samePair.length === 1) return choose({ action: 'update', candidate: samePair[0] });
  if (unlinkedCms.length) return choose({ action: 'choose', candidates: unlinkedCms });
  if (missingCms.length) return choose({ action: 'choose', candidates: missingCms });
  return choose({ action: 'create' });
};

const resolveOwner = (name, accounts, importer, ownerId = null) => {
  if (!Array.isArray(accounts)) throw new TypeError('Danh sách tài khoản không hợp lệ');
  if (!Number.isSafeInteger(Number(importer?.id)) || Number(importer.id) < 1) {
    throw new TypeError('Người import không hợp lệ');
  }
  const key = canonical(name);
  const matches = key ? accounts.filter(account => canonical(account.full_name) === key
    && account.status === 'ACTIVE' && account.role !== 'MKT') : [];
  const chosenId = selectedId(ownerId, 'ID người đề xuất');
  if (chosenId !== null) {
    const chosen = (key ? matches : accounts.filter(account =>
      account.status === 'ACTIVE' && account.role !== 'MKT'))
      .find(account => Number(account.id) === chosenId);
    if (!chosen) throw fail('ID người đề xuất không thuộc các tài khoản phù hợp');
    return { action: 'matched', account: chosen };
  }
  if (matches.length === 1) return { action: 'matched', account: matches[0] };
  if (matches.length > 1) return { action: 'choose', candidates: matches };
  return { action: 'fallback', account: importer };
};

module.exports = { resolveIdentity, resolveOwner };
