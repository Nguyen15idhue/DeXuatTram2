import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import { Button, Input, Loading, Select } from '../../components/ui';
import PageHeader from '../../components/ui/PageHeader';
import FileUpload from '../../components/dynamic/FileUpload';
import UserField from '../../components/dynamic/UserField';
import ChargingStationInstallationModal from '../../components/admin/ChargingStationInstallationModal';
import ChargingStationAcceptanceFields, { acceptancePayload } from '../../components/admin/ChargingStationAcceptanceFields';
import { ACCEPTANCE_LABELS } from '../../utils/chargingFulfillment';
import { CS_CONTRACT_LABELS, CS_FLOW_LABELS, CS_PAYMENT_LABELS, CS_DEPOSIT_LABELS, CS_STATUS_LABELS,
  CS_SUB_STATUS_BY_STATUS, CS_SUB_STATUS_LABELS } from '../../utils/chargingStation';

const GROUPS = [
  { title: 'Thông tin chung', fields: [['description', 'Mô tả'], ['note', 'Ghi chú nội bộ']] },
  { title: 'Hợp đồng', fields: [
    ['contract_status', 'Trạng thái hợp đồng', CS_CONTRACT_LABELS],
    ['contract_effective_date', 'Ngày hiệu lực', 'date'], ['contract_expiry_date', 'Ngày hết hạn', 'date'],
    ['contract_note', 'Ghi chú hợp đồng']
  ] },
  { title: 'Hạ tầng', fields: [
    ['infra_power_status', 'Hạ tầng điện', CS_FLOW_LABELS], ['infra_power_date', 'Ngày hạ tầng điện', 'date'],
    ['infra_power_note', 'Ghi chú hạ tầng điện'], ['infra_site_status', 'Hạ tầng mặt bằng', CS_FLOW_LABELS],
    ['infra_site_date', 'Ngày hạ tầng mặt bằng', 'date'], ['infra_site_note', 'Ghi chú hạ tầng mặt bằng']
  ] },
  { title: 'Nghiệm thu và ON trạm', fields: [
    ['acceptance_user_id', 'Người nghiệm thu', 'user'], ['acceptance_date', 'Ngày nghiệm thu', 'date'],
    ['cms_station_code', 'Mã trạm trên CMS', 'text'], ['on_date', 'Ngày ON thực tế', 'date']
  ] },
  { title: 'Tài chính — điều chỉnh trạng thái, không sửa hóa đơn', fields: [
    ['payment_status', 'Thanh toán', CS_PAYMENT_LABELS], ['deposit_status', 'Tiền cọc / hoàn cọc', CS_DEPOSIT_LABELS]
  ] },
  { title: 'Hạn xử lý', fields: [
    ['contract_deadline_at', 'Hạn hợp đồng', 'datetime-local'], ['infra_deadline_at', 'Hạn hạ tầng', 'datetime-local'],
    ['finance_deadline_at', 'Hạn tài chính', 'datetime-local'], ['deadline_extension_count', 'Số lần gia hạn (0–3)', 'number']
  ] }
];

const AdminChargingStationEditPage = () => {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState({});
  const [installationOpen, setInstallationOpen] = useState(false);
  const [portions, setPortions] = useState([]);
  const setPortionData = data => setPortions((data || []).map(row => ({
    ...row, reports: row.acceptance_reports || {}, date: row.on_date || '', note: row.on_note || '',
    editReports: false
  })));
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    chargingStationService.getDetail(id, token).then(response => {
      if (!active) return;
      if (!response.success) throw new Error(response.message || 'Không tải được ON trạm');
      const data = response.data;
      setRecord(data);
      setPortionData(data.deployments);
      setForm({ ...Object.fromEntries(GROUPS.flatMap(group => group.fields.map(([key, , type]) => [key,
        type === 'datetime-local' ? (data[key] || '').replace(' ', 'T').slice(0, 16) : data[key] ?? '']))),
        sub_status: data.sub_status || '',
        contract_files: data.contract_files || [], acceptance_file: data.acceptance_file_id
          ? { id: data.acceptance_file_id, original_name: data.acceptance_file_name } : null,
        images: data.images || [], reason: '' });
    }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token]);
  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = async event => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const payload = Object.fromEntries(GROUPS.flatMap(group => group.fields.map(([key]) => [key, form[key] || null])));
      const deploymentUpdates = portions.filter(row => row.editReports
        || row.date !== (row.on_date || '') || row.note !== (row.on_note || '')).map(row => ({
        id: row.id, expected_version: row.workflow_version,
        ...(row.editReports ? acceptancePayload(row.reports) : {}),
        ...(row.stage === 'OPERATING' ? { on_date: row.date, on_note: row.note || null } : {})
      }));
      const response = await chargingStationService.update(id, {
        ...payload, expected_token: record.edit_token, reason: form.reason.trim(),
        sub_status: form.sub_status || null,
        contract_file_ids: form.contract_files.map(file => file.id),
        acceptance_file_id: form.acceptance_file?.id || null, image_ids: form.images.map(file => file.id),
        ...(deploymentUpdates.length ? { deployment_updates: deploymentUpdates } : {})
      }, token);
      if (!response.success) throw new Error(response.message || 'Không lưu được ON trạm');
      navigate(`/admin/on-tram/thong-tin-chung/${id}`, { replace: true });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); saving.current = false; }
  };
  const patchPortion = (id, values) => setPortions(current => current.map(row => row.id === id ? { ...row, ...values } : row));
  if (loading) return <Loading />;
  return <div className="space-y-4">
    <PageHeader title={`Sửa ON trạm · ${record?.ma_tram || id}`} subtitle="SUPER_ADMIN điều chỉnh hồ sơ; không sửa đề xuất nguồn, giao dịch kho hoặc hóa đơn." />
    {error && <div role="alert" className="alert alert-error">{error}</div>}
    {record && <form onSubmit={save} className="space-y-4">
      <div className="rounded-lg border border-base-300 p-4 flex flex-wrap gap-6">
        <span>ID: {record.id}</span><span>Mã trạm: {record.ma_tram}</span>
        <span>Trạng thái quy trình: {CS_STATUS_LABELS[record.status]}</span>
        <Link className="link link-primary" to="/admin/on-tram/thong-tin-chung">Đổi trạng thái tại menu ba chấm</Link>
        <Select label="Trạng thái chi tiết" value={form.sub_status} disabled={busy}
          placeholder={(CS_SUB_STATUS_BY_STATUS[record.status] || []).length ? null : 'Không có trạng thái chi tiết'}
          options={(CS_SUB_STATUS_BY_STATUS[record.status] || []).map(value => ({ value, label: CS_SUB_STATUS_LABELS[value] }))}
          onChange={event => setField('sub_status', event.target.value)} />
      </div>
      {GROUPS.map(group => <section key={group.title} className="rounded-lg border border-base-300 p-4 space-y-3">
        <h2 className="font-semibold">{group.title}</h2>
        {group.title.startsWith('Tài chính') && <p className="text-sm text-warning">Đây là ghi đè nghiệp vụ. Không tự tạo chứng từ, không thay đổi số tiền hóa đơn, không phát sinh hoàn cọc.</p>}
        <div className="grid gap-3 md:grid-cols-2">{group.fields.map(([key, label, type]) =>
          typeof type === 'object' ? <Select key={key} label={label} value={form[key]} disabled={busy}
            placeholder={null} options={Object.entries(type).map(([value, name]) => ({ value, label: name }))}
            onChange={event => setField(key, event.target.value)} />
            : type === 'user' ? <label key={key} className="block text-sm">{label}<UserField value={form[key]}
              disabled={busy} onChange={value => setField(key, value?.id || '')} /></label>
              : type ? <Input key={key} label={label} type={type} value={form[key]} disabled={busy}
              onChange={event => setField(key, event.target.value)} />
              : <label key={key} className="block text-sm">{label}<textarea className="textarea textarea-bordered w-full mt-1"
                disabled={busy} value={form[key]} onChange={event => setField(key, event.target.value)} /></label>
        )}</div>
      </section>)}
      <section className="rounded-lg border border-base-300 p-4 space-y-3">
        <h2 className="font-semibold">Hồ sơ nghiệm thu và ON từng phần trụ</h2>
        <p className="text-sm text-warning">Điều chỉnh kết quả đã lưu, bắt buộc lý do ở cuối trang. Không sửa số lượng hay giao dịch kho.</p>
        {!portions.length && <p className="text-sm text-base-content/60">Chưa có phần trụ.</p>}
        {portions.map(row => <details key={row.id} className="rounded-lg border border-base-300 p-3">
          <summary className="cursor-pointer font-medium">Phiếu #{row.export_id} · Phần #{row.id} · {row.pole_name} · {row.supplier_name || '—'} · {row.quantity} trụ</summary>
          <div className="mt-3 space-y-3">
            <p>{ACCEPTANCE_LABELS[row.acceptance_status]} · {row.stage === 'OPERATING' ? 'Đã ON' : 'Chưa ON'}</p>
            {row.acceptance_status === 'PASSED' && <>
              {Boolean(row.acceptance_legacy) && <p className="text-warning">Hồ sơ legacy: nếu thay bằng mẫu mới phải bổ sung đủ hai bộ file và ảnh.</p>}
              <label className="flex items-center gap-2"><input type="checkbox" className="checkbox checkbox-sm"
                disabled={busy || Object.values(uploads).some(Boolean)} checked={row.editReports}
                onChange={event => patchPortion(row.id, { editReports: event.target.checked })} /> Điều chỉnh hồ sơ nghiệm thu</label>
              <ChargingStationAcceptanceFields value={row.reports} disabled={busy} readOnly={!row.editReports}
                onChange={updater => setPortions(current => current.map(item => item.id === row.id
                  ? { ...item, reports: updater(item.reports) } : item))}
                onUploadingChange={(key, value) => setUploads(current => ({ ...current, [`${row.id}_${key}`]: value }))} />
            </>}
            {row.stage === 'OPERATING' && <div className="grid gap-3 md:grid-cols-2">
              <Input label="Ngày ON của phần trụ" required type="date" disabled={busy} value={row.date}
                onChange={event => patchPortion(row.id, { date: event.target.value })} />
              <Input label="Ghi chú ON" maxLength={5000} disabled={busy} value={row.note}
                onChange={event => patchPortion(row.id, { note: event.target.value })} />
            </div>}
          </div>
        </details>)}
      </section>
      <section className="rounded-lg border border-base-300 p-4 space-y-3">
        <h2 className="font-semibold">Tài liệu và hình ảnh</h2>
        {[
          ['contract_files', 'File hợp đồng (PDF/DOCX)', true, '.pdf,.docx'],
          ['acceptance_file', 'Biên bản nghiệm thu (PDF)', false, '.pdf'],
          ['images', 'Ảnh nghiệm thu', true, 'image/*']
        ].map(([key, label, multiple, accept]) => <div key={key}><h3 className="text-sm mb-1">{label}</h3>
          <FileUpload value={form[key]} onChange={value => setField(key, value)} multiple={multiple} accept={accept}
            disabled={busy} onUploadingChange={value => setUploads(current => ({ ...current, [key]: value }))} />
        </div>)}
      </section>
      <section className="rounded-lg border border-base-300 p-4 space-y-3">
        <h2 className="font-semibold">Lắp đặt từng phần trụ</h2>
        <p className="text-sm">Lưu riêng trong modal; lùi lắp đặt không xóa kết quả nghiệm thu/cấu hình/ON.</p>
        <Button type="button" variant="outline" onClick={() => setInstallationOpen(true)}>Cập nhật lắp trụ</Button>
      </section>
      <label className="block text-sm">Lý do điều chỉnh *
        <textarea required minLength={3} maxLength={5000} className="textarea textarea-bordered w-full mt-1"
          disabled={busy} value={form.reason} onChange={event => setField('reason', event.target.value)} />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => navigate(-1)}>Hủy</Button>
        <Button type="submit" loading={busy} disabled={busy || Object.values(uploads).some(Boolean) || form.reason.trim().length < 3}>Lưu thông tin</Button>
      </div>
    </form>}
    {installationOpen && <ChargingStationInstallationModal station={record} onClose={() => setInstallationOpen(false)}
      onChanged={async () => {
        const response = await chargingStationService.getDetail(id, token);
        if (!response.success) throw new Error(response.message || 'Không tải lại được ON trạm');
        setRecord(response.data);
        setPortionData(response.data.deployments);
      }} />}
  </div>;
};

export default AdminChargingStationEditPage;
