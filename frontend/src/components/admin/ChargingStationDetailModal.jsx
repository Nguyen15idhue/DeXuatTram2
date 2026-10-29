import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_URL, chargingStationService } from '../../services/api';
import { Badge, Button, ConfirmDialog, Dialog, Input, Loading, Select } from '../ui';
import {
  CS_CONTRACT_LABELS,
  CS_FLOW_LABELS,
  CS_NEXT_STATUS,
  CS_PAYMENT_LABELS,
  CS_ROLLBACK_STATUS,
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  CS_SUB_STATUS_BY_STATUS,
  CS_SUB_STATUS_LABELS,
  formatCsDate
} from '../../utils/chargingStation';

const CLOSED_CONFIRM = { open: false, title: '', message: '', onConfirm: null };
const TEXTAREA_CLASS = 'textarea textarea-bordered w-full';

const toForm = (record) => ({
  on_date: record.on_date || '',
  contract_status: record.contract_status || 'NOT',
  infra_power_status: record.infra_power_status || 'NOT',
  infra_site_status: record.infra_site_status || 'NOT',
  payment_status: record.payment_status || 'NOT',
  description: record.description || '',
  note: record.note || '',
  sub_status: record.sub_status || '',
  acceptance_user_id: record.acceptance_user_id ? String(record.acceptance_user_id) : '',
  acceptance_date: record.acceptance_date || ''
});

const toOptions = (labels) => Object.keys(labels).map((value) => ({ value, label: labels[value] }));

const CONTRACT_OPTIONS = toOptions(CS_CONTRACT_LABELS);
const FLOW_OPTIONS = toOptions(CS_FLOW_LABELS);
const PAYMENT_OPTIONS = toOptions(CS_PAYMENT_LABELS);

const Card = ({ title, children }) => (
  <section className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
    <h3 className="font-semibold text-base text-primary">{title}</h3>
    {children}
  </section>
);

const ACTION_LABELS = {
  created: 'Tạo bản ghi ON trạm từ đề xuất đã ký',
  updated: 'Cập nhật thông tin',
  status_changed: 'Chuyển trạng thái',
  status_rolled_back: 'Lùi bước',
  acceptance_updated: 'Cập nhật nghiệm thu',
  acceptance_file_uploaded: 'Tải biên bản nghiệm thu',
  image_added: 'Thêm ảnh nghiệm thu',
  image_removed: 'Gỡ ảnh nghiệm thu'
};

const describeLog = (log) => {
  const base = ACTION_LABELS[log.action] || log.action;
  if (log.from_status && log.to_status) {
    return `${base}: ${CS_STATUS_LABELS[log.from_status] || log.from_status} → ${CS_STATUS_LABELS[log.to_status] || log.to_status}`;
  }
  const fields = log.changed_fields ? Object.values(log.changed_fields).map((f) => f.label).filter(Boolean) : [];
  return fields.length > 0 ? `${base} (${fields.join(', ')})` : base;
};

const ChargingStationDetailModal = ({ id, token, canEdit, onClose, onChanged, onToast }) => {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [confirm, setConfirm] = useState(CLOSED_CONFIRM);

  const reload = useCallback(async () => {
    const res = await chargingStationService.getDetail(id, token);
    setRecord(res.data);
    setForm(toForm(res.data));
    return res.data;
  }, [id, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
        if (canEdit) {
          const res = await api.getWithAuth('/admin/users/options/all', token);
          if (!cancelled) setUsers(res?.data || []);
        }
      } catch (error) {
        onToast?.(error?.message || 'Không tải được chi tiết ON trạm', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, token, canEdit]);

  const run = async (action, successMessage) => {
    setBusy(true);
    try {
      await action();
      await reload();
      onChanged?.();
      onToast?.(successMessage, 'success');
    } catch (error) {
      onToast?.(error?.message || 'Thao tác thất bại', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveInfo = () => run(
    () => chargingStationService.update(id, {
      on_date: form.on_date || null,
      contract_status: form.contract_status,
      infra_power_status: form.infra_power_status,
      infra_site_status: form.infra_site_status,
      payment_status: form.payment_status,
      description: form.description,
      note: form.note
    }, token),
    'Đã lưu thông tin'
  );

  const saveSubStatus = () => run(
    () => chargingStationService.update(id, { sub_status: form.sub_status || null }, token),
    'Đã cập nhật trạng thái phụ'
  );

  const advance = (toStatus) => run(
    () => chargingStationService.changeStatus(id, { to_status: toStatus }, token),
    `Đã chuyển sang ${CS_STATUS_LABELS[toStatus]}`
  );

  const rollback = async () => {
    await run(
      () => chargingStationService.changeStatus(id, { to_status: CS_ROLLBACK_STATUS[record.status], reason: rollbackReason }, token),
      'Đã lùi bước'
    );
    setRollbackReason('');
  };

  const saveAcceptance = () => run(
    () => chargingStationService.updateAcceptance(id, {
      acceptance_user_id: form.acceptance_user_id ? Number(form.acceptance_user_id) : null,
      acceptance_date: form.acceptance_date || null
    }, token),
    'Đã lưu thông tin nghiệm thu'
  );

  const uploadOne = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('originalName', file.name);
    const res = await api.uploadWithAuth('/files/upload', formData, token);
    if (!res?.success) throw new Error(res?.message || 'Tải file thất bại');
    return res.data.id;
  };

  const uploadPdf = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      onToast?.('Biên bản nghiệm thu phải là file PDF', 'error');
      return;
    }
    await run(async () => {
      const fileId = await uploadOne(file);
      await chargingStationService.setAcceptanceFile(id, fileId, token);
    }, 'Đã tải biên bản nghiệm thu');
  };

  const uploadImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    if (files.some((file) => !file.type.startsWith('image/'))) {
      onToast?.('Chỉ được chọn file ảnh', 'error');
      return;
    }
    await run(async () => {
      const ids = [];
      for (const file of files) {
        ids.push(await uploadOne(file));
      }
      await chargingStationService.addAcceptanceImages(id, ids, token);
    }, `Đã thêm ${files.length} ảnh nghiệm thu`);
  };

  const closeConfirm = () => setConfirm(CLOSED_CONFIRM);

  const confirmAdvance = (toStatus) => setConfirm({
    open: true,
    title: `Chuyển sang ${CS_STATUS_LABELS[toStatus]}`,
    message: 'Xác nhận chuyển bước cho ON trạm này?',
    onConfirm: () => { closeConfirm(); advance(toStatus); }
  });

  const confirmRemoveImage = (fileId) => setConfirm({
    open: true,
    title: 'Gỡ ảnh nghiệm thu',
    message: 'Ảnh sẽ được gỡ khỏi bản ghi ON trạm. Bạn có chắc chắn?',
    onConfirm: () => {
      closeConfirm();
      run(() => chargingStationService.removeAcceptanceImage(id, fileId, token), 'Đã gỡ ảnh');
    }
  });

  const nextStatus = record ? CS_NEXT_STATUS[record.status] : null;
  const rollbackStatus = record ? CS_ROLLBACK_STATUS[record.status] : null;
  const subOptions = useMemo(
    () => toOptions(Object.fromEntries((record ? CS_SUB_STATUS_BY_STATUS[record.status] || [] : []).map((key) => [key, CS_SUB_STATUS_LABELS[key]]))),
    [record]
  );
  const userOptions = useMemo(
    () => users.map((u) => ({ value: String(u.id), label: u.full_name })),
    [users]
  );
  const disabled = !canEdit || busy;
  const acceptanceReady = record?.sub_status === 'ACCEPT_PASSED' && !!record?.acceptance_file_id;

  return (
    <>
      <Dialog isOpen onClose={onClose} title={record ? `ON trạm ${record.ma_tram || `#${record.id}`}` : 'ON trạm'} size="full">
        {loading || !record || !form ? (
          <Loading message="Đang tải chi tiết ON trạm..." />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={CS_STATUS_VARIANT[record.status]} className="whitespace-normal h-auto py-1">{CS_STATUS_LABELS[record.status]}</Badge>
              {record.sub_status && <Badge variant="ghost" outline className="whitespace-normal h-auto py-1">{CS_SUB_STATUS_LABELS[record.sub_status]}</Badge>}
              <Link
                to={`/admin/proposals/chi-tiet/${record.proposal_id}`}
                className="link link-primary text-sm"
                onClick={onClose}
              >
                Đề xuất {record.ma_de_xuat || `#${record.proposal_id}`}
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Thông tin chung">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-base-content/60">Chủ trạm</div>
                    <div>{record.owner_name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-base-content/60">SĐT</div>
                    <div>{record.owner_phone || '—'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-base-content/60">Địa chỉ</div>
                    <div>{record.address || '—'}</div>
                  </div>
                </div>
                <Input
                  type="date"
                  label="Ngày ON thực tế"
                  value={form.on_date}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, on_date: e.target.value })}
                />
                <div className="form-control w-full">
                  <span className="label-text font-medium mb-1">Mô tả</span>
                  <textarea className={TEXTAREA_CLASS} rows={2} value={form.description} disabled={disabled}
                    onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-control w-full">
                  <span className="label-text font-medium mb-1">Ghi chú nội bộ</span>
                  <textarea className={TEXTAREA_CLASS} rows={2} value={form.note} disabled={disabled}
                    onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
                {canEdit && (
                  <div className="flex justify-end">
                    <Button size="sm" loading={busy} disabled={disabled} onClick={saveInfo}>Lưu thông tin</Button>
                  </div>
                )}
              </Card>

              <Card title="Hợp đồng, hạ tầng, thanh toán">
                <Select
                  label="Trạng thái hợp đồng"
                  options={CONTRACT_OPTIONS}
                  placeholder={null}
                  value={form.contract_status}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, contract_status: e.target.value })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Select
                    label="Hạ tầng điện"
                    options={FLOW_OPTIONS}
                    placeholder={null}
                    value={form.infra_power_status}
                    disabled={disabled}
                    onChange={(e) => setForm({ ...form, infra_power_status: e.target.value })}
                  />
                  <Select
                    label="Hạ tầng mặt bằng"
                    options={FLOW_OPTIONS}
                    placeholder={null}
                    value={form.infra_site_status}
                    disabled={disabled}
                    onChange={(e) => setForm({ ...form, infra_site_status: e.target.value })}
                  />
                  <Select
                    label="Thanh toán"
                    options={PAYMENT_OPTIONS}
                    placeholder={null}
                    value={form.payment_status}
                    disabled={disabled}
                    onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
                  />
                </div>
                {canEdit && (
                  <div className="flex justify-end">
                    <Button size="sm" loading={busy} disabled={disabled} onClick={saveInfo}>Lưu hợp đồng</Button>
                  </div>
                )}
              </Card>

              <Card title="Tiến trình">
                <div className="text-sm">
                  Trạng thái hiện tại: <strong>{CS_STATUS_LABELS[record.status]}</strong>
                </div>
                {canEdit && subOptions.length > 0 && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Select
                        label="Trạng thái phụ"
                        options={subOptions}
                        placeholder={null}
                        value={form.sub_status}
                        disabled={disabled}
                        onChange={(e) => setForm({ ...form, sub_status: e.target.value })}
                      />
                    </div>
                    <Button variant="outline" size="md" loading={busy} disabled={disabled} onClick={saveSubStatus}>Cập nhật</Button>
                  </div>
                )}
                {canEdit && nextStatus && (
                  <Button className="w-full" disabled={disabled} onClick={() => confirmAdvance(nextStatus)}>
                    Chuyển sang: {CS_STATUS_LABELS[nextStatus]}
                  </Button>
                )}
                {record.status === 'OPERATING' && (
                  <Badge variant="success" outline>Trạm đã đưa vào hoạt động</Badge>
                )}
                {canEdit && rollbackStatus && (
                  <div className="space-y-2 border-t border-base-300 pt-3">
                    <div className="form-control w-full">
                      <span className="label-text font-medium mb-1">
                        Lùi về {CS_STATUS_LABELS[rollbackStatus]} (bắt buộc nhập lý do)
                      </span>
                      <textarea className={TEXTAREA_CLASS} rows={2} value={rollbackReason} disabled={disabled}
                        onChange={(e) => setRollbackReason(e.target.value)} />
                    </div>
                    <Button variant="outline-warning" className="w-full" disabled={disabled || !rollbackReason.trim()} onClick={rollback}>
                      Lùi bước
                    </Button>
                  </div>
                )}
              </Card>

              <Card title="Nghiệm thu">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Người nghiệm thu"
                    options={userOptions}
                    placeholder="— Chưa chọn —"
                    value={form.acceptance_user_id}
                    disabled={disabled}
                    onChange={(e) => setForm({ ...form, acceptance_user_id: e.target.value })}
                  />
                  <Input
                    type="date"
                    label="Ngày nghiệm thu"
                    value={form.acceptance_date}
                    disabled={disabled}
                    onChange={(e) => setForm({ ...form, acceptance_date: e.target.value })}
                  />
                </div>
                {canEdit && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" loading={busy} disabled={disabled} onClick={saveAcceptance}>Lưu nghiệm thu</Button>
                  </div>
                )}

                <div className="border-t border-base-300 pt-3 space-y-2">
                  <div className="font-medium text-sm">Biên bản nghiệm thu (PDF)</div>
                  {record.acceptance_file_id ? (
                    <a
                      className="link link-primary text-sm break-all"
                      href={`${API_URL}/files/${record.acceptance_file_id}/download?token=${token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {record.acceptance_file_name || `File #${record.acceptance_file_id}`}
                    </a>
                  ) : (
                    <div className="text-sm text-base-content/60">Chưa có biên bản</div>
                  )}
                  {canEdit && (
                    <input
                      type="file"
                      accept="application/pdf"
                      className="file-input file-input-bordered file-input-sm w-full"
                      disabled={disabled}
                      onChange={uploadPdf}
                    />
                  )}
                </div>

                <div className="border-t border-base-300 pt-3 space-y-2">
                  <div className="font-medium text-sm">Ảnh nghiệm thu ({record.images.length}/20)</div>
                  {record.images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {record.images.map((img) => (
                        <div key={img.id} className="relative group">
                          <a href={`${API_URL}/files/${img.id}/image?token=${token}`} target="_blank" rel="noreferrer">
                            <img
                              src={`${API_URL}/files/${img.id}/image?token=${token}`}
                              alt={img.original_name}
                              className="h-24 w-full object-cover rounded-lg border border-base-300"
                            />
                          </a>
                          {canEdit && (
                            <Button
                              variant="error"
                              size="xs"
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                              disabled={disabled}
                              onClick={() => confirmRemoveImage(img.id)}
                            >
                              Gỡ
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="file-input file-input-bordered file-input-sm w-full"
                      disabled={disabled}
                      onChange={uploadImages}
                    />
                  )}
                </div>

                {!acceptanceReady && record.status === 'ACCEPTANCE' && (
                  <Badge variant="warning" outline className="whitespace-normal h-auto py-1">
                    Cần nghiệm thu đạt và có biên bản để chuyển sang On trạm
                  </Badge>
                )}
              </Card>

              <Card title="Nhật ký hoạt động">
                <div className="max-h-80 overflow-y-auto space-y-3 text-sm pr-1">
                  {record.timeline.length === 0 && <div className="text-base-content/60">Chưa có hoạt động</div>}
                  {record.timeline.map((log) => (
                    <div key={log.id} className="border-l-2 border-primary/40 pl-3">
                      <div className="text-xs text-base-content/60">
                        {new Date(log.created_at).toLocaleString('vi-VN')} · {log.actor_name || 'Hệ thống'}
                      </div>
                      <div>{describeLog(log)}</div>
                      {log.reject_reason && <div className="text-xs text-base-content/70">Lý do: {log.reject_reason}</div>}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        isOpen={confirm.open}
        title={confirm.title}
        message={confirm.message}
        type="warning"
        confirmText="Xác nhận"
        onConfirm={confirm.onConfirm}
        onCancel={closeConfirm}
      />
    </>
  );
};

export default ChargingStationDetailModal;
