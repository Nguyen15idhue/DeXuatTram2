const ExcelJS = require('exceljs');
const stationService = require('./chargingStationService');
const { CONTRACT_LABELS: CONTRACT, INFRA_LABELS: INFRA, financeLabel } = require('./chargingStationDisplay');

const STAGES = ['khoi-tao-hop-dong', 'xay-dung-ha-tang', 'giao-tru', 'lap-tru', 'nghiem-thu'];
const COLUMNS = [
  ['Mã trạm', 18], ['Trạng thái hợp đồng', 24], ['Hạ tầng điện', 18], ['Hạ tầng mặt bằng', 20],
  ['Trạng thái tài chính', 34], ['Trạng thái giao trụ', 30], ['Trạng thái lắp trụ', 23],
  ['Trạng thái nghiệm thu', 30], ['Trạng thái ON trạm', 25], ['Mã đề xuất', 23], ['Tên pháp nhân', 32],
  ['SĐT', 17], ['Mô hình', 30], ['Địa chỉ chi tiết', 48], ['Tỉnh/thành phố', 23], ['Vùng miền', 18],
  ['Vĩ độ', 15], ['Kinh độ', 15], ['Link Google Maps', 48], ['Người đề xuất', 25],
  ['Người phụ trách', 25], ['GĐTTKD', 25], ['Quy mô trụ chốt', 45], ['Thời gian tạo đề xuất', 25],
  ['Tổng chi phí', 20]
];
const MODELS = { NQ: 'Nhượng quyền', LK: 'Liên kết', TDT: 'Tự đầu tư', NQ_LK: 'Nhượng quyền + Liên kết' };
const REGIONS = { Bac: 'Miền Bắc', Trung: 'Miền Trung', Nam: 'Miền Nam' };
const localDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium'
});
const isFlag = (value) => Number(value) === 1;
const text = (value) => {
  const label = value && typeof value === 'object' ? value.label ?? value.full_name ?? value.name ?? value.value : value;
  return ['number', 'string'].includes(typeof label) ? String(label).trim() : '';
};
const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const number = (value) => text(value) && Number.isFinite(Number(value)) ? Number(value) : null;
const cost = (value) => {
  if (typeof value === 'number') return number(value);
  const amount = text(value).replace(/\s*(?:VNĐ|VND|₫|đ)$/i, '');
  if (/^-?\d{1,3}([., ])\d{3}(?:\1\d{3})*$/.test(amount)) return Number(amount.replace(/[., ]/g, ''));
  return number(amount);
};
const label = (options, value) => Object.hasOwn(options, value) ? options[value] : '';

const deliveryLabel = (row) => {
  if (isFlag(row.shipment_return_pending)) return 'Có chuyến chờ hoàn hàng';
  if (isFlag(row.delivery_complete)) return 'Đã giao hàng thành công';
  if (isFlag(row.delivery_partial)) return 'Đã giao một phần';
  if (isFlag(row.shipment_in_transit)) return 'Đang vận chuyển';
  if (isFlag(row.shipment_failed)) return 'Giao thất bại';
  if (isFlag(row.shipment_returned)) return 'Đã hoàn';
  if (isFlag(row.delivery_exported)) return 'Đang vận chuyển';
  return 'Chưa giao';
};

const exportRow = (row) => {
  const data = json(row.proposal_data) || {};
  const scale = json(row.chot_so_luong_tru);
  const latitude = number(row.latitude);
  const longitude = number(row.longitude);
  const mapUrl = text(data.link_google_map) || text(data.link_gg_map) || (
    latitude !== null && longitude !== null ? `https://www.google.com/maps?q=${latitude},${longitude}` : ''
  );
  const model = text(data.mo_hinh_dau_tu);
  const region = text(data.vung_mien);
  const active = row.status !== 'CANCELLED';
  const created = number(row.proposal_created_epoch);
  return [
    text(row.ma_tram), label(CONTRACT, row.contract_status), label(INFRA, row.infra_power_status), label(INFRA, row.infra_site_status),
    financeLabel(row), deliveryLabel(row),
    isFlag(row.installation_complete) ? 'Đã lắp xong' : isFlag(row.installation_started) ? 'Đang lắp trụ' : 'Chưa lắp trụ',
    isFlag(row.acceptance_complete) ? 'Đã nghiệm thu' : isFlag(row.acceptance_partial) ? 'Đã nghiệm thu một phần'
      : isFlag(row.acceptance_failed) ? 'Nghiệm thu không đạt' : 'Chưa nghiệm thu',
    !active ? 'Đã hủy' : isFlag(row.on_complete) ? 'Đã tích hợp xong' : isFlag(row.on_partial) ? 'Đã tích hợp một phần' : 'Chưa tích hợp',
    text(row.ma_de_xuat), text(data.lk_ten_phap_nhan) || text(data.nq_ten_khach_hang) || text(row.owner_name),
    text(data.lk_sdt) || text(data.nq_sdt) || text(row.owner_phone), label(MODELS, model) || model,
    text(row.address), text(data.province), label(REGIONS, region) || region, latitude, longitude, mapUrl,
    text(row.proposer_name), text(row.assignee_name) || text(data.nguoi_phu_trach),
    text(row.director_name) || text(data.nguoi_giao_phu_trach),
    (Array.isArray(scale) ? scale : []).map((item) => {
      const count = number(item?.so_luong ?? item?.quantity);
      const pole = text(item?.loai_tru) || text(item?.ten_loai_tru);
      const modelCode = text(item?.mo_hinh);
      return count > 0 && pole ? `${modelCode ? `${modelCode}_` : ''}${count} ${pole}` : '';
    }).filter(Boolean).join(' + '),
    created === null ? '' : localDateTime.format(created * 1000).replace(', ', ' '),
    cost(data.tong_chi_phi) ?? cost(data.investment_cost)
  ];
};

const buildExport = async ({ stage, tab = 'need', search = '', user }) => {
  if (!STAGES.includes(stage) || !['need', 'completed', 'all'].includes(tab) || typeof search !== 'string') {
    throw Object.assign(new Error('Bước, tab hoặc từ khóa ON trạm không hợp lệ'), { statusCode: 400 });
  }
  const rows = await stationService.listChargingStationsForExport({ stage, tab, search, user });
  if (!rows.length) throw Object.assign(new Error('Không có ON trạm phù hợp để xuất Excel'), { statusCode: 404 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ON trạm', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map(([header, width]) => ({ header, width }));
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: 'Y1' };
  sheet.getColumn(25).numFmt = '#,##0.##';
  for (const row of rows) sheet.addRow(exportRow(row));

  const stamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium'
  }).format(new Date()).replace(/[-:]/g, '').replace(' ', '_');
  return { workbook, filename: `on-tram_${stage}_${tab}_${stamp}.xlsx` };
};

module.exports = { buildExport };
