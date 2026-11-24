import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalReportService } from '../../services/api';
import { ensureDocumentResponse } from '../../utils/proposalDocuments';

const ProposalReportPreviewModal = ({ record, onClose }) => {
  const { token } = useAuth();
  const mounted = useRef(false);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState({});
  const [inputs, setInputs] = useState({});
  const [previewUrl, setPreviewUrl] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

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
        if (active) setTemplates(response.data?.templates || []);
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
    setRendering(true);
    setError('');
    setPreviewUrl('');
    setWarnings([]);
    try {
      const result = await proposalReportService.previewGeneration(record.id, {
        template_id: Number(templateId), values,
        ...(template?.input_fields?.length ? { inputs } : {})
      }, token);
      if (!mounted.current) return;
      setPreviewUrl(URL.createObjectURL(result.blob));
      setWarnings(result.warnings);
    } catch (cause) {
      if (mounted.current) setError(cause.message || 'Không tạo được bản xem thử');
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
          Bản xem thử chưa lưu dữ liệu, chưa gửi duyệt và chưa hỗ trợ cấu hình chữ ký tự động. Để gửi duyệt, tiếp tục dùng chức năng tải tờ trình.
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
                <p className="text-sm text-base-content/70">Thông tin từ đề xuất: có thể sửa tạm để xem thử, không ghi ngược vào đề xuất.</p>
                <div className="grid gap-3 md:grid-cols-2 max-h-72 overflow-y-auto">
                  {template.fields.map((field) => (
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
                  {rendering ? 'Đang tạo bản xem thử...' : 'Xem thử PDF'}
                </button>
              </>
            )}
            {warnings.length > 0 && <div className="alert alert-warning text-sm"><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            {previewUrl && <iframe title="Xem thử BCĐX" src={previewUrl} className="w-full h-[65vh] border border-base-300" />}
          </div>
        )}
      </div>
      <div className="modal-backdrop" />
    </dialog>
  );
};

export default ProposalReportPreviewModal;
