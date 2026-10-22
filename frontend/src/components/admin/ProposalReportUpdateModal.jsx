import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { dataListService, proposalReportService } from '../../services/api';
import FileUpload from '../dynamic/FileUpload';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import {
  getReportFiles,
  RE_CREATING_STATUS,
  UPDATING_STATUS
} from '../../utils/proposalReport';
import { getProposalLegalName } from '../../utils/proposalGrading';

const FILE_ACCEPT = 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,image/*';
const TRU_LIST_ID = 18;
const MODEL_OPTIONS = [
  { value: 'TDT', label: 'Tự đầu tư (TDT)' },
  { value: 'LK', label: 'Liên kết (LK)' },
  { value: 'NQ', label: 'Nhượng quyền (NQ)' },
  { value: 'NQ_LK', label: 'Nhượng quyền + Liên kết (NQ_LK)' }
];

const emptyRow = () => ({ mo_hinh: '', so_luong: '', loai_tru: '', gia_chot: '' });

const toUploadValue = (row) => getReportFiles(row)
  .filter((file) => file.id)
  .map((file) => ({
    id: file.id,
    original_name: file.name || `File #${file.id}`,
    mime_type: file.mime_type || null
  }));

const parseRows = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const formatMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN')} ₫` : '—';
};

const ProposalReportUpdateModal = ({ open, record, onClose, onSaved, onUpload }) => {
  const { token } = useAuth();
  const [files, setFiles] = useState([]);
  const [existingFileIds, setExistingFileIds] = useState([]);
  const [chotRows, setChotRows] = useState([emptyRow()]);
  const [truTypes, setTruTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const code = record?.ma_de_xuat || (record?.id ? `#${record.id}` : '');
  const legalName = useMemo(() => (record ? getProposalLegalName(record) : ''), [record]);
  const pricesByName = useMemo(() => new Map(truTypes.map((item) => [String(item.ten), Number(item.gia)])), [truTypes]);
  const totalValue = useMemo(() => chotRows.reduce((sum, row) => {
    const quantity = Number(row.so_luong);
    const price = Number(row.gia_chot);
    return Number.isFinite(quantity) && Number.isFinite(price) ? sum + quantity * price : sum;
  }, 0), [chotRows]);
  const hasCompleteRows = chotRows.length > 0 && chotRows.every((row) => (
    row.mo_hinh
    && Number.isInteger(Number(row.so_luong))
    && Number(row.so_luong) > 0
    && row.loai_tru
    && Number.isFinite(pricesByName.get(String(row.loai_tru)))
  ));

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const previousFiles = toUploadValue(record);
    setFiles(previousFiles);
    setExistingFileIds(previousFiles.map((file) => Number(file.id)).filter(Number.isFinite));
    setChotRows(parseRows(record?.chot_so_luong_tru).length > 0
      ? parseRows(record?.chot_so_luong_tru).map((row) => ({
        mo_hinh: row.mo_hinh || '',
        so_luong: row.so_luong ?? '',
        loai_tru: row.loai_tru || '',
        gia_chot: row.gia_chot ?? ''
      }))
      : [emptyRow()]);
    setError('');
    setSaving(false);
    setLoadingTypes(true);
    dataListService.getById(TRU_LIST_ID)
      .then((res) => {
        if (cancelled) return;
        const cols = res?.data?.columns_config || [];
        const rows = (res?.data?.rows || []).map((item) => item.data || {});
        const nameKey = cols.find((col) => col.key === 'ten')?.key || 'ten';
        const priceKey = cols.find((col) => col.key === 'gia')?.key || 'gia';
        const nextTypes = rows
          .filter((item) => item[nameKey] && Number.isFinite(Number(item[priceKey])))
          .map((item) => ({ ten: String(item[nameKey]), gia: Number(item[priceKey]) }));
        setTruTypes(nextTypes);
        setChotRows((current) => current.map((row) => (
          row.loai_tru && nextTypes.some((item) => item.ten === row.loai_tru)
            ? { ...row, gia_chot: nextTypes.find((item) => item.ten === row.loai_tru).gia }
            : row
        )));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Không tải được danh mục giá trụ');
      })
      .finally(() => {
        if (!cancelled) setLoadingTypes(false);
      });
    return () => { cancelled = true; };
  }, [open, record?.id, token]);

  if (!open || !record) return null;

  const updateRow = (index, patch) => {
    setChotRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'loai_tru')) {
        next.gia_chot = pricesByName.get(String(patch.loai_tru)) ?? '';
      }
      return next;
    }));
  };

  const validate = () => {
    if (!files || files.length === 0) return 'Vui lòng tải lên file tờ trình BCĐX';
    if ([RE_CREATING_STATUS, UPDATING_STATUS].includes(record.status)
      && !files.some((file) => file.id && !existingFileIds.includes(Number(file.id)))) {
      return 'Vui lòng tải lên file BCĐX mới theo yêu cầu cập nhật';
    }
    if (chotRows.length === 0) return 'Vui lòng nhập ít nhất một dòng số lượng trụ chốt';
    for (let index = 0; index < chotRows.length; index += 1) {
      const row = chotRows[index];
      if (!row.mo_hinh) return `Dòng ${index + 1}: vui lòng chọn mô hình liên kết`;
      if (!Number.isInteger(Number(row.so_luong)) || Number(row.so_luong) <= 0) {
        return `Dòng ${index + 1}: số lượng phải là số nguyên lớn hơn 0`;
      }
      if (!row.loai_tru) return `Dòng ${index + 1}: vui lòng chọn loại trụ`;
      if (!Number.isFinite(pricesByName.get(String(row.loai_tru)))) {
        return `Dòng ${index + 1}: loại trụ chưa có giá hiện tại`;
      }
    }
    return '';
  };

  const submit = async () => {
    const validationMessage = validate();
    setError(validationMessage);
    if (validationMessage) return;

    setSaving(true);
    try {
      const payload = {
        files,
        chot_so_luong_tru: chotRows.map((row) => ({
          mo_hinh: row.mo_hinh,
          so_luong: Number(row.so_luong),
          loai_tru: row.loai_tru,
          gia_chot: Number(row.gia_chot)
        }))
      };
      const res = onUpload
        ? await onUpload(payload)
        : await proposalReportService.upload(record.id, payload, token);
      onSaved && onSaved(res?.data);
    } catch (err) {
      setError(err?.message || 'Không tải lên được tờ trình BCĐX');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog className="modal modal-open" style={{ zIndex: 60 }}>
      <div className="modal-box max-w-5xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-lg">Cập nhật tờ trình BCĐX</h3>
            <p className="text-sm text-base-content/70">Mã đề xuất: {code}</p>
            <p className="text-sm text-base-content/70">Pháp nhân: {legalName}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng" disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <section>
            <label className="label py-1">
              <span className="label-text font-semibold">File tờ trình BCĐX *</span>
            </label>
            <FileUpload
              value={files}
              onChange={(value) => setFiles(Array.isArray(value) ? value : (value ? [value] : []))}
              entityId={record.id}
              entityType="station_proposals"
              multiple
              accept={FILE_ACCEPT}
              disabled={saving}
              fileConfig={{ maxSize: 20 }}
            />
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-semibold">Số lượng trụ chốt *</h4>
                <p className="text-xs text-base-content/60">Giá chốt được lấy từ giá hiện tại trong danh mục loại trụ.</p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-primary btn-sm gap-1"
                onClick={() => setChotRows((current) => [...current, emptyRow()])}
                disabled={saving || chotRows.length >= 50}
              >
                <Plus size={15} />
                Thêm dòng
              </button>
            </div>

            {loadingTypes ? (
              <div className="flex justify-center py-4"><span className="loading loading-spinner loading-sm" /></div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Mô hình liên kết *</th>
                      <th>Số lượng *</th>
                      <th>Loại trụ *</th>
                      <th>Giá chốt hiện tại</th>
                      <th>Thành tiền</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chotRows.map((row, index) => {
                      const price = pricesByName.get(String(row.loai_tru));
                      const quantity = Number(row.so_luong);
                      const lineTotal = Number.isInteger(quantity) && quantity > 0 && Number.isFinite(price)
                        ? quantity * price
                        : null;
                      return (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>
                            <select
                              className="select select-bordered select-xs min-w-44"
                              value={row.mo_hinh}
                              onChange={(event) => updateRow(index, { mo_hinh: event.target.value })}
                              disabled={saving}
                            >
                              <option value="">Chọn mô hình</option>
                              {MODEL_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              className="input input-bordered input-xs w-24"
                              value={row.so_luong}
                              onChange={(event) => updateRow(index, { so_luong: event.target.value })}
                              disabled={saving}
                            />
                          </td>
                          <td>
                            <select
                              className="select select-bordered select-xs min-w-44"
                              value={row.loai_tru}
                              onChange={(event) => updateRow(index, { loai_tru: event.target.value })}
                              disabled={saving}
                            >
                              <option value="">Chọn loại trụ</option>
                              {truTypes.map((item) => (
                                <option key={item.ten} value={item.ten}>{item.ten}</option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap">{price === undefined ? '—' : formatMoney(price)}</td>
                          <td className="whitespace-nowrap font-medium">{lineTotal === null ? '—' : formatMoney(lineTotal)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-error"
                              title="Xóa dòng"
                              onClick={() => setChotRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                              disabled={saving || chotRows.length <= 1}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={5} className="text-right">Tổng giá trị chốt</th>
                      <th className="whitespace-nowrap">{hasCompleteRows ? formatMoney(totalValue) : '—'}</th>
                      <th></th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {error ? <div className="alert alert-error text-sm py-2">{error}</div> : null}
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Hủy</button>
          <button type="button" className="btn btn-primary gap-1" onClick={submit} disabled={saving || loadingTypes}>
            <Upload size={16} />
            Tải lên và gửi duyệt
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={saving ? undefined : onClose}>
        <button type="button">close</button>
      </form>

    </dialog>
  );
};

export default ProposalReportUpdateModal;
