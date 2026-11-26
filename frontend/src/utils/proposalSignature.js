import { formatProposedScale as formatProposalScale } from './proposalGrading';
import signerTextLayout from './signatureTextLayout.json';

export const SIGN_STATUS = {
  PENDING: 'PENDING',
  DOING: 'DOING',
  DONE: 'DONE',
  CEO_SIGNED: 'CEO_SIGNED'
};

export const SIGN_STATUS_LABELS = {
  PENDING: 'Cần thực hiện',
  DOING: 'Đang thực hiện',
  DONE: 'Đã hoàn thành',
  CEO_SIGNED: 'Chủ tịch đã phê duyệt'
};

export const SIGN_STATUS_COLORS = {
  PENDING: '#f59e0b',
  DOING: '#3b82f6',
  DONE: '#22c55e',
  CEO_SIGNED: '#16a34a'
};

export const SIGN_STATUS_HINTS = {
  PENDING: 'Chưa có bất kỳ ai ký',
  DOING: 'Đã có ít nhất một người ký',
  DONE: 'Tất cả đã ký, chờ trình chủ tịch ký',
  CEO_SIGNED: 'Đã tải lên file BCĐX chốt khi chủ tịch ký'
};

export const getSignStatusLabel = (code) => SIGN_STATUS_LABELS[code] || '—';

export const getSignStatusColor = (code) => SIGN_STATUS_COLORS[code] || '#64748b';

export const getSignerBoxMinHeightRatio = (file) => {
  const name = String(file?.name || file?.original_name || '').toLowerCase();
  const mime = String(file?.mime_type || '').toLowerCase();
  const isDocx = mime.includes('wordprocessingml') || name.endsWith('.docx');
  return isDocx
    ? signerTextLayout.minDocxBoxHeightRatio
    : signerTextLayout.minBoxHeightRatio;
};

export const normalizeSignerBox = (
  signer,
  minHeightRatio = signerTextLayout.minBoxHeightRatio
) => {
  const posX = Math.min(1, Math.max(0, Number(signer?.pos_x) || 0));
  const configuredWidth = Number(signer?.box_width);
  const minHeight = Math.min(1, Math.max(0, Number(minHeightRatio) || 0));
  const boxWidth = Math.min(
    1 - posX,
    Math.max(
      0,
      signer?.box_width !== null
        && signer?.box_width !== undefined
        && Number.isFinite(configuredWidth)
        ? configuredWidth
        : 0.25
    )
  );
  const configuredHeight = Number(signer?.box_height);
  const boxHeight = Math.min(
    1,
    Math.max(
      minHeight,
      signer?.box_height !== null
        && signer?.box_height !== undefined
        && Number.isFinite(configuredHeight)
        ? configuredHeight
        : 0.25
    )
  );
  const posY = Math.min(
    1 - boxHeight,
    Math.max(0, Number(signer?.pos_y) || 0)
  );
  return {
    ...signer,
    pos_x: posX,
    box_height: boxHeight,
    box_width: boxWidth,
    pos_y: posY
  };
};

export const buildSignersFromAnchors = (anchorData, existing = []) => {
  const found = (anchorData?.anchors || []).filter((anchor) => anchor.found && anchor.user_id);
  if (!found.length) return existing;
  const candidates = anchorData?.candidates || [];
  const next = [...existing];
  found.forEach((anchor) => {
    const candidate = candidates.find((item) => String(item.id) === String(anchor.user_id));
    const box = {
      page: anchor.page || 1,
      pos_x: anchor.pos_x,
      pos_y: anchor.pos_y,
      box_width: anchor.box_width,
      box_height: anchor.box_height,
      anchor_token: anchor.anchor_token
    };
    const index = next.findIndex((signer) => String(signer.user_id) === String(anchor.user_id));
    if (index >= 0) return;
    next.push({
      user_id: anchor.user_id,
      full_name: anchor.user_name || candidate?.full_name || anchor.label,
      signer_title: anchor.signer_title || candidate?.chuc_vu || candidate?.department || null,
      signer_department: candidate?.department || null,
      ...box
    });
  });
  return next;
};

export const anchorDetectionMessage = (data) => {
  if (data?.reason === 'missing_snapshot') return 'Tài liệu không có cấu hình mẫu đã lưu; vui lòng chọn người ký và vị trí thủ công.';
  if (data?.reason === 'no_anchors') return 'Mẫu không có token ô ký; vui lòng cấu hình thủ công.';
  const missingPosition = (data?.anchors || []).filter((item) => !item.found).map((item) => item.anchor_token);
  const missingUser = (data?.anchors || []).filter((item) => item.found && !item.user_id).map((item) => item.anchor_token);
  const valid = (data?.anchors || []).filter((item) => item.found && item.user_id);
  const duplicateUsers = valid.filter((item, index) => valid.findIndex((other) => String(other.user_id) === String(item.user_id)) !== index).map((item) => item.anchor_token);
  return [
    missingPosition.length && `Không tìm thấy vị trí: ${missingPosition.join(', ')}`,
    missingUser.length && `Chưa xác định người ký: ${missingUser.join(', ')}`,
    duplicateUsers.length && `Mỗi người chỉ có một ô trên tài liệu; không tự áp dụng: ${duplicateUsers.join(', ')}`
  ].filter(Boolean).join(' · ');
};

const parseRows = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const formatChotTruRows = (value) => {
  const rows = parseRows(value);
  if (rows.length === 0) return '-';
  return rows.map((row) => {
    const model = row.mo_hinh || '?';
    const quantity = Number(row.so_luong) || 0;
    const type = row.loai_tru || '?';
    return `${model} · ${quantity} × ${type}`;
  }).join(' + ');
};

export const formatChotTotal = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN')} ₫` : '-';
};

export const formatProposedScale = (row) => formatProposalScale(row);

export const formatSignedTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('hour')}:${get('minute')}:${get('second')} ${get('day')}/${get('month')}/${get('year')}`;
};
