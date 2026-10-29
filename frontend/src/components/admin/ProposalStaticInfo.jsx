import { FileText, Paperclip } from 'lucide-react';
import { getFieldValue, getLegalDocFiles, getProposalModelCode } from '../../utils/proposalGrading';

const COMMON_FIELDS = [
  { key: 'province', label: 'Tỉnh / thành phố' },
  { key: 'xa_phuong', label: 'Xã / phường' },
  { key: 'vung_mien', label: 'Vùng miền' },
  { key: 'land_type', label: 'Loại đất' },
  { key: 'area', label: 'Diện tích khu đất' },
  { key: 'dien_tich_mat_bang', label: 'Diện tích mặt bằng', unit: 'm²' },
  { key: 'nguon_dien', label: 'Nguồn điện' },
  { key: 'thoi_gian_lap_dat', label: 'Thời gian lắp đặt' },
  { key: 'thoi_gian_nghiem_thu', label: 'Thời gian nghiệm thu' },
  { key: 'phap_ly_dat', label: 'Pháp lý đất' },
  { key: 'ngay_du_kien_on', label: 'Ngày dự kiến ON', format: 'date' },
  { key: 'description', label: 'Mô tả đề xuất' }
];

const MODEL_FIELDS = {
  TDT: [
    { key: 'tdt_tong_cong', label: 'Tổng chi phí tự đầu tư', format: 'currency' }
  ],
  NQ: [
    { key: 'nq_mst', label: 'Mã số thuế' },
    { key: 'nq_nguoi_dai_dien', label: 'Người đại diện' },
    { key: 'nq_so_tai_khoan', label: 'Số tài khoản' },
    { key: 'nq_gia_niem_yet', label: 'Giá niêm yết', format: 'currency' },
    { key: 'nq_gia_uu_dai', label: 'Giá ưu đãi', format: 'currency' },
    { key: 'nq_chia_loi_nhuan_tmt', label: 'Chia lợi nhuận TMT' },
    { key: 'nq_chia_loi_nhuan_nq', label: 'Chia lợi nhuận nhượng quyền' },
    { key: 'nq_thanh_toan_lan_1', label: 'Thanh toán đợt 1', unit: '%' },
    { key: 'nq_thanh_toan_lan_2', label: 'Thanh toán đợt 2', unit: '%' },
    { key: 'nq_thanh_toan_lan_3', label: 'Thanh toán đợt 3', unit: '%' },
    { key: 'chinh_sach_nq', label: 'Chính sách nhượng quyền' }
  ],
  LK: [
    { key: 'lk_mst', label: 'Mã số thuế' },
    { key: 'lk_nguoi_dai_dien', label: 'Người đại diện' },
    { key: 'lk_dia_chi_dkkd', label: 'Địa chỉ đăng ký kinh doanh' },
    { key: 'lk_ty_le_tmt', label: 'Tỷ lệ TMT', unit: '%' },
    { key: 'lk_ty_le_doi_tac', label: 'Tỷ lệ đối tác', unit: '%' },
    { key: 'lk_chia_loi_nhuan_tmt', label: 'Chia lợi nhuận TMT' },
    { key: 'lk_chia_loi_nhuan_lk', label: 'Chia lợi nhuận liên kết' },
    { key: 'chinh_sach_lk', label: 'Chính sách liên kết' }
  ],
  NQ_LK: [
    { key: 'nq_mst', label: 'Mã số thuế nhượng quyền' },
    { key: 'nq_nguoi_dai_dien', label: 'Người đại diện nhượng quyền' },
    { key: 'nq_so_tai_khoan', label: 'Số tài khoản nhượng quyền' },
    { key: 'nq_gia_niem_yet', label: 'Giá niêm yết', format: 'currency' },
    { key: 'nq_gia_uu_dai', label: 'Giá ưu đãi', format: 'currency' },
    { key: 'nq_chia_loi_nhuan_tmt', label: 'Chia lợi nhuận TMT (NQ)' },
    { key: 'nq_chia_loi_nhuan_nq', label: 'Chia lợi nhuận đối tác (NQ)' },
    { key: 'lk_mst', label: 'Mã số thuế liên kết' },
    { key: 'lk_nguoi_dai_dien', label: 'Người đại diện liên kết' },
    { key: 'lk_dia_chi_dkkd', label: 'Địa chỉ đăng ký kinh doanh' },
    { key: 'lk_ty_le_tmt', label: 'Tỷ lệ TMT', unit: '%' },
    { key: 'lk_ty_le_doi_tac', label: 'Tỷ lệ đối tác', unit: '%' },
    { key: 'lk_chia_loi_nhuan_tmt', label: 'Chia lợi nhuận TMT (LK)' },
    { key: 'lk_chia_loi_nhuan_lk', label: 'Chia lợi nhuận đối tác (LK)' },
    { key: 'chinh_sach_nq', label: 'Chính sách nhượng quyền' },
    { key: 'chinh_sach_lk', label: 'Chính sách liên kết' },
    { key: 'dat_coc', label: 'Tiền đặt cọc', format: 'currency' },
    { key: 'ghi_chu_dat_coc', label: 'Ghi chú đặt cọc' }
  ]
};

const FILE_FIELDS = [
  { key: 'legal_document', label: 'Giấy chứng nhận quyền sử dụng đất' },
  { key: 'dkkd_cccd_hkd', label: 'Đăng ký kinh doanh / CCCD' },
  { key: 'site_images', label: 'Hình ảnh hiện trường' }
];

const isEmpty = (value) => value === null || value === undefined || value === '';

const formatDate = (value) => {
  const text = String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('vi-VN');
};

const formatValue = (value, field) => {
  if (isEmpty(value)) return '';
  if (field.format === 'date') return formatDate(value);
  if (field.format === 'currency' && Number.isFinite(Number(value))) {
    return `${Number(value).toLocaleString('vi-VN')} ₫`;
  }
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.map((item) => formatValue(item, {})).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const text = value.label || value.name || value.full_name || value.value;
    return text ? formatValue(text, field) : JSON.stringify(value);
  }
  return `${value}${field.unit ? ` ${field.unit}` : ''}`;
};

const FieldGroup = ({ title, fields, record }) => {
  const visibleFields = fields
    .map((field) => ({ ...field, value: formatValue(getFieldValue(record, field.key), field) }))
    .filter((field) => field.value);
  if (!visibleFields.length) return null;

  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleFields.map((field) => (
          <div key={field.key} className="min-w-0">
            <dt className="text-xs text-base-content/60">{field.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const ProposalStaticInfo = ({ record, onViewFile }) => {
  const model = getProposalModelCode(record);
  const modelFields = MODEL_FIELDS[model] || [];
  const documents = FILE_FIELDS.map((field) => ({
    ...field,
    files: getLegalDocFiles(record, field.key)
  })).filter((field) => field.files.length);

  return (
    <div className="space-y-3">
      <FieldGroup title="Địa điểm và hiện trạng" fields={COMMON_FIELDS} record={record} />
      <FieldGroup title="Thông tin phương án đầu tư" fields={modelFields} record={record} />
      {documents.length > 0 && (
        <section className="rounded-xl border border-base-300 bg-base-100 p-4">
          <h3 className="mb-3 text-sm font-semibold">Hồ sơ đính kèm</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {documents.map((group) => (
              <div key={group.key} className="rounded-lg border border-base-200 p-3">
                <h4 className="mb-2 text-xs font-semibold text-base-content/70">{group.label}</h4>
                <div className="flex flex-wrap gap-2">
                  {group.files.map((file, index) => (
                    <button
                      key={`${file.id || file.name || group.key}-${index}`}
                      type="button"
                      className="btn btn-ghost btn-sm max-w-full justify-start gap-2"
                      onClick={() => onViewFile?.({
                        ...file,
                        original_name: file.name || file.original_name || group.label
                      })}
                      disabled={!file.id && !file.url}
                    >
                      {file.mime_type?.startsWith('image/') ? <Paperclip size={14} /> : <FileText size={14} />}
                      <span className="truncate">{file.name || `${group.label} ${index + 1}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProposalStaticInfo;
