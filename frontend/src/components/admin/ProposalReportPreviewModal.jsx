import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalReportService } from '../../services/api';
import { ensureDocumentResponse } from '../../utils/proposalDocuments';
import ProposalReportUpdateModal from './ProposalReportUpdateModal';
import ConfirmDialog from '../ConfirmDialog';
import ProposalPreviewSignatureEditor from './ProposalPreviewSignatureEditor';
import { anchorDetectionMessage, buildSignersFromAnchors, normalizeSignerBox } from '../../utils/proposalSignature';
import { DEFAULT_SIGNER_BOX } from '../../utils/proposalApproval';

const ProposalReportPreviewModal = ({ record, onClose, onSaved }) => {
  const { token } = useAuth();
  const mounted = useRef(false);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState({});
  const [inputs, setInputs] = useState({});
  const [previewUrl, setPreviewUrl] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [blocking, setBlocking] = useState([]);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [proof, setProof] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [poleRows, setPoleRows] = useState(null);
  const [expectedOnDate, setExpectedOnDate] = useState('');
  const [draftRevision, setDraftRevision] = useState('');
  const [editingPoles, setEditingPoles] = useState(false);
  const [signers, setSigners] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [signatureWarning, setSignatureWarning] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    proposalReportService.getGenerationOptions(record.id, token)
      .then((response) => {
        ensureDocumentResponse(response);
        if (active) {
          setTemplates(response.data?.templates || []);
          const draft = response.data?.draft;
          setPoleRows(Array.isArray(draft?.chot_so_luong_tru) && draft.chot_so_luong_tru.length ? draft.chot_so_luong_tru : null);
          setExpectedOnDate(draft?.ngay_du_kien_on || '');
          setDraftRevision(draft?.revision || '');
        }
      })
      .catch((cause) => { if (active) setError(cause.message || 'Không tải được mẫu BCĐX'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [record.id, token]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const template = templates.find((item) => String(item.id) === templateId);

  const chooseTemplate = (id) => {
    const next = templates.find((item) => String(item.id) === id);
    setTemplateId(id);
    setValues(Object.fromEntries((next?.fields || []).map((field) => [field.key, String(field.value ?? '')])));
    setInputs(Object.fromEntries((next?.input_fields || []).map((field) => [field.key, String(field.value ?? '')])));
    setPreviewUrl('');
    setWarnings([]);
    setError('');
  };

  const renderPreview = async () => {
    if (!poleRows?.length || !expectedOnDate || !draftRevision) {
      setError('Vui lòng nhập trụ chốt và ngày dự kiến ON trước khi xem thử.');
      return;
    }
    setRendering(true);
    setError('');
    setPreviewUrl('');
    setWarnings([]);
    let saved = false;
    try {
      const draftResponse = await proposalReportService.saveGenerationDraft(record.id, {
        chot_so_luong_tru: poleRows, ngay_du_kien_on: expectedOnDate, revision: draftRevision
      }, token);
      ensureDocumentResponse(draftResponse);
      saved = true;
      if (!mounted.current) return;
      setDraftRevision(draftResponse.data.revision);
      setPoleRows(draftResponse.data.chot_so_luong_tru);
      const result = await proposalReportService.previewGeneration(record.id, {
        template_id: Number(templateId),
        values: Object.hasOwn(values, 'ngay_du_kien_on') ? { ...values, ngay_du_kien_on: expectedOnDate } : values,
        saved_draft_revision: draftResponse.data.revision,
        ...(template?.input_fields?.length ? { inputs } : {})
      }, token);
      if (!mounted.current) return;
      setPreviewUrl(URL.createObjectURL(result.blob));
      setWarnings(result.warnings);
      setBlocking(result.blocking);
      setPreviewBlob(result.blob);
      setProof(result.proof || '');
      setSigners(buildSignersFromAnchors(result.signatureAnchors).map((signer) => normalizeSignerBox(signer)));
      setCandidates(result.signatureAnchors?.candidates || []);
      setSelectedUser('');
      setSignatureWarning(anchorDetectionMessage(result.signatureAnchors));
    } catch (cause) {
      if (mounted.current) setError(`${saved ? 'Đã lưu trụ chốt và ngày ON. ' : ''}${cause.message || 'Không tạo được bản xem thử'}`);
    } finally {
      if (mounted.current) setRendering(false);
    }
  };

  const candidateDetails = (candidate) => ({
    user_id: candidate.id,
    full_name: candidate.full_name,
    signer_title: candidate.chuc_vu || candidate.department || null,
    signer_department: candidate.department || null,
    anchor_token: null
  });

  const addSigner = () => {
    const candidate = candidates.find((item) => String(item.id) === selectedUser);
    if (!candidate || signers.some((signer) => Number(signer.user_id) === Number(candidate.id))) return;
    setSigners((current) => [...current, { ...DEFAULT_SIGNER_BOX, ...candidateDetails(candidate) }]);
    setSelectedUser('');
  };

  const replaceSigner = (userId, nextId) => {
    const candidate = candidates.find((item) => String(item.id) === nextId);
    if (!candidate || signers.some((signer) => Number(signer.user_id) === Number(candidate.id))) return;
    setSigners((current) => current.map((signer) => Number(signer.user_id) === Number(userId)
      ? { ...signer, ...candidateDetails(candidate) } : signer));
  };

  const sendReport = async () => {
    setConfirming(false);
    setRendering(true);
    setError('');
    try {
      const result = await proposalReportService.generate(record.id, previewBlob, proof, token, signers);
      ensureDocumentResponse(result);
      if (mounted.current) onSaved?.(result.data);
    } catch (cause) {
      if (mounted.current) setError(cause.message || 'Không gửi được BCĐX');
    } finally {
      if (mounted.current) setRendering(false);
    }
  };

  return (
    <dialog className="modal modal-open" onCancel={(event) => event.preventDefault()}>
      <div className="modal-box max-w-6xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-lg">Xem thử BCĐX từ mẫu</h3>
            <p className="text-sm">Đề xuất: {record.ma_de_xuat || `#${record.id}`}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} disabled={rendering} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="alert alert-warning my-3 text-sm">
          Khi xem thử, hệ thống lưu trụ chốt và ngày ON vào đề xuất trước. Vị trí ký chỉ lưu tạm khi cửa sổ này mở và được gửi cùng PDF khi xác nhận.
        </div>
        {error && <div className="alert alert-error mb-3 text-sm">{error}</div>}
        {loading ? <span className="loading loading-spinner" /> : (
          <div className="space-y-3">
            <label className="form-control">
              <span className="label-text mb-1">Mẫu BCĐX</span>
              <select className="select select-bordered" value={templateId} onChange={(event) => chooseTemplate(event.target.value)} disabled={rendering}>
                <option value="">Chọn mẫu</option>
                {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            {!templates.length && <p className="text-sm">Chưa có mẫu hoạt động phù hợp với mô hình đề xuất.</p>}
            {template && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" className="btn btn-outline btn-sm" disabled={rendering} onClick={() => setEditingPoles(true)}>
                    Nhập số lượng trụ chốt
                  </button>
                  <span className="text-sm">{poleRows ? `Đã nhập ${poleRows.length} dòng cho bản xem thử` : 'Chưa thay đổi bảng trụ chốt của đề xuất'}</span>
                </div>
                <label className="form-control max-w-sm">
                  <span className="label-text mb-1">Ngày dự kiến ON (bắt buộc)</span>
                  <input className="input input-bordered" type="date" value={expectedOnDate} disabled={rendering} onChange={(event) => {
                    setExpectedOnDate(event.target.value);
                    setPreviewUrl('');
                    setWarnings([]);
                  }} />
                </label>
                <p className="text-sm text-base-content/70">Thông tin từ đề xuất: có thể sửa tạm để xem thử, không ghi ngược vào đề xuất.</p>
                <div className="grid gap-3 md:grid-cols-2 max-h-72 overflow-y-auto">
                  {template.fields.filter((field) => field.key !== 'ngay_du_kien_on').map((field) => (
                    <label className="form-control" key={field.key}>
                      <span className="label-text mb-1">{field.label}</span>
                      {field.type === 'textarea' ? (
                        <textarea className="textarea textarea-bordered" value={values[field.key] || ''} disabled={rendering} onChange={(event) => {
                          setValues((current) => ({ ...current, [field.key]: event.target.value }));
                          setPreviewUrl('');
                          setWarnings([]);
                        }} />
                      ) : (
                        <input className="input input-bordered" type={field.type === 'date' ? 'date' : 'text'} value={values[field.key] || ''} disabled={rendering} onChange={(event) => {
                          setValues((current) => ({ ...current, [field.key]: event.target.value }));
                          setPreviewUrl('');
                          setWarnings([]);
                        }} />
                      )}
                    </label>
                  ))}
                </div>
                {!!template.input_fields?.length && (
                  <>
                    <h4 className="font-semibold text-sm">Thông tin bổ sung BCĐX</h4>
                    <p className="text-xs text-base-content/70">Chỉ dùng cho bản xem thử. Trường bắt buộc còn trống được đánh dấu và cảnh báo; đóng cửa sổ sẽ mất dữ liệu nhập.</p>
                    <div className="grid gap-3 md:grid-cols-2 max-h-72 overflow-y-auto">
                      {template.input_fields.map((field) => {
                        const change = (event) => {
                          setInputs((current) => ({ ...current, [field.key]: event.target.value }));
                          setPreviewUrl('');
                          setWarnings([]);
                        };
                        return (
                          <label className="form-control" key={field.key}>
                            <span className="label-text mb-1">{field.label}{field.required ? ' (bắt buộc)' : ''}</span>
                            {field.type === 'textarea' ? (
                              <textarea className="textarea textarea-bordered" value={inputs[field.key] ?? ''} disabled={rendering} maxLength={10000} onChange={change} />
                            ) : (
                              <input className="input input-bordered" type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={inputs[field.key] ?? ''} disabled={rendering} maxLength={10000} onChange={change} />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
                <button type="button" className="btn btn-primary btn-sm" onClick={renderPreview} disabled={rendering}>
                  {rendering ? 'Đang lưu và tạo bản xem thử...' : 'Lưu trụ, ngày ON và xem thử PDF'}
                </button>
              </>
            )}
            {warnings.length > 0 && <div className="alert alert-warning text-sm"><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            {previewUrl && blocking.length > 0 && <div className="alert alert-error text-sm"><div>Không thể gửi duyệt:<ul>{blocking.map((item) => <li key={item}>{item}</li>)}</ul></div></div>}
            {previewUrl && signatureWarning && <div className="alert alert-warning text-sm">{signatureWarning}</div>}
            {previewUrl && (
              <section className="space-y-2" aria-label="Cấu hình ô ký">
                <h4 className="font-semibold">Cấu hình ô ký</h4>
                <p className="text-sm">Chọn người ký, kéo hoặc đổi kích thước ô trên PDF. Tạo lại PDF sẽ dò lại vị trí.</p>
                <div className="flex gap-2">
                  <select aria-label="Chọn người ký" className="select select-bordered select-sm flex-1"
                    value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} disabled={rendering}>
                    <option value="">-- Chọn người ký --</option>
                    {candidates.filter((candidate) => !signers.some((signer) => Number(signer.user_id) === Number(candidate.id))).map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.full_name}{candidate.chuc_vu ? ` (${candidate.chuc_vu})` : ''}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-primary btn-sm" onClick={addSigner} disabled={rendering || !selectedUser || !pageCount}>Thêm người ký</button>
                </div>
                {signers.map((signer) => (
                  <div key={signer.user_id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
                    <label className="flex-1">
                      <span className="sr-only">Người ký {signer.full_name}</span>
                      <select aria-label={`Người ký ${signer.full_name}`} className="select select-bordered select-sm w-full" value={signer.user_id}
                        disabled={rendering} onChange={(event) => replaceSigner(signer.user_id, event.target.value)}>
                        <option value={signer.user_id}>{signer.full_name}</option>
                        {candidates.filter((candidate) => !signers.some((item) => Number(item.user_id) === Number(candidate.id))).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.full_name}{candidate.chuc_vu ? ` (${candidate.chuc_vu})` : ''}</option>
                        ))}
                      </select>
                    </label>
                    <label>Trang <input aria-label={`Trang ký của ${signer.full_name}`} type="number" min="1" max={pageCount || 1}
                      className="input input-bordered input-sm w-20" value={signer.page} disabled={rendering || !pageCount}
                      onChange={(event) => {
                        const page = Math.min(pageCount, Math.max(1, Number.parseInt(event.target.value, 10) || 1));
                        setSigners((current) => current.map((item) => item.user_id === signer.user_id ? { ...item, page } : item));
                      }} /></label>
                    <button type="button" className="btn btn-ghost btn-sm text-error" disabled={rendering}
                      onClick={() => setSigners((current) => current.filter((item) => item.user_id !== signer.user_id))}
                      aria-label={`Xóa người ký ${signer.full_name}`}>Xóa</button>
                  </div>
                ))}
                <ProposalPreviewSignatureEditor url={previewUrl} signers={signers} onChange={setSigners} onPageCount={setPageCount} disabled={rendering} />
              </section>
            )}
            {previewUrl && <button type="button" className="btn btn-primary" disabled={rendering || !proof || blocking.length > 0} onClick={() => setConfirming(true)}>
              {rendering ? 'Đang gửi duyệt...' : 'Xác nhận gửi duyệt'}
            </button>}
          </div>
        )}
      </div>
      <div className="modal-backdrop" />
      <ConfirmDialog isOpen={confirming} type="warning" title="Gửi duyệt BCĐX"
        message="Gửi bản PDF đang xem sang bước duyệt BCĐX?" confirmText="Gửi duyệt"
        onCancel={() => setConfirming(false)} onConfirm={sendReport} />
      {editingPoles && <ProposalReportUpdateModal
        open
        record={{ ...record, chot_so_luong_tru: poleRows || record.chot_so_luong_tru }}
        initialChotRows={poleRows}
        onClose={() => setEditingPoles(false)}
        onSelectPoles={(rows) => {
          setPoleRows(rows);
          setPreviewUrl('');
          setWarnings([]);
          setEditingPoles(false);
        }}
      />}
    </dialog>
  );
};

export default ProposalReportPreviewModal;
