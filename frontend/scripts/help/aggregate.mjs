import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const lanes = [
  { id: 'A', name: 'Lane A — Người dùng + Bản đồ', imageDir: 'user' },
  { id: 'B', name: 'Lane B — Quản lý dữ liệu', imageDir: 'admin-data' },
  { id: 'C', name: 'Lane C — Cấu hình', imageDir: 'admin-config' },
];

const rows = [];
let totalImg = 0;
let totalOk = 0;
let total = 0;

for (const lane of lanes) {
  const file = join(ROOT, 'docs', '5', `41.status.${lane.id}.json`);
  if (!existsSync(file)) {
    rows.push(`| ${lane.id} | ${lane.name} | (chưa chạy) | - | - |`);
    continue;
  }
  const s = JSON.parse(readFileSync(file, 'utf8'));
  totalImg += s.ok;
  totalOk += s.ok;
  total += s.total;
  const failList = (s.failed || []).map((f) => f.id).join(', ') || '—';
  rows.push(`| ${lane.id} | ${lane.name} | ${s.ok}/${s.total} | ${s.ok} ảnh | ${failList} |`);
}

const md = `# 41. Hướng dẫn sử dụng — Tổng hợp kết quả sinh ảnh

**Sinh tự động** bởi \`frontend/scripts/help/aggregate.mjs\` — ${new Date().toISOString()}

| Lane | Nhóm | Bước OK | Ảnh | Bước lỗi |
|---|---|---|---|---|
${rows.join('\n')}

**Tổng**: ${totalOk}/${total} bước OK, ${totalImg} ảnh.

> Chạy lại: \`node frontend/scripts/help/gen-images-user.mjs\` (và -admin-data / -admin-config) rồi \`node frontend/scripts/help/aggregate.mjs\`.
`;

writeFileSync(join(ROOT, 'docs', '5', '41.HuongDan_tonghop.md'), md, 'utf8');
console.log('OK -> docs/5/41.HuongDan_tonghop.md');
