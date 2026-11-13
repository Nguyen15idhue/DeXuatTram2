import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService as service } from '../../services/api';
import { ensureDocumentResponse } from '../../utils/proposalDocuments';
import ProposalDocumentPages from './ProposalDocumentPages';
import FileUpload from '../dynamic/FileUpload';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const labels = { PENDING: 'Đang chờ convert', PROCESSING: 'Đang convert', DRAFT: 'Bản nháp',
  ACTIVE: 'Đang dùng', CONFIRMED: 'Đã xác nhận', FAILED: 'Convert thất bại' };
const valueOf = response => ensureDocumentResponse(response).data;

export default function ProposalDocumentRecoveryModal({ proposalId, document, onClose, onApplied }) {
  const { token } = useAuth();
  const [history, setHistory] = useState([]);
  const [original, setOriginal] = useState([]);
  const [row, setRow] = useState(null);
  const [signers, setSigners] = useState([]);
  const [replacements, setReplacements] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [checked, setChecked] = useState(false);
  const [preview, setPreview] = useState(false);
  const [uploads, setUploads] = useState({});
  const takeRow = data => {
    setRow(data); setSigners(data.signers || []); setDirty(false); setChecked(false);
    setReplacements({}); setPreview(!!data.preview_file_id);
  };
  const run = async action => {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err.message || 'Không phục hồi được tài liệu'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let cancelled = false;
    service.recoveryHistory(proposalId, document.id, token).then(valueOf).then(data => {
      if (cancelled) return;
      setHistory(data.history); setOriginal(data.signers);
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [proposalId, document.id, token]);
  useEffect(() => {
    if (!row || !['PENDING','PROCESSING'].includes(row.status)) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const data = valueOf(await service.recoveryStatus(proposalId, document.id, row.id, token));
        if (!cancelled) {
          takeRow(data);
          if (['PENDING','PROCESSING'].includes(data.status)) timer = setTimeout(poll, 2000);
        }
      } catch (err) { if (!cancelled) setError(err.message); }
    };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [row?.id, row?.status, proposalId, document.id, token]);
  const edit = (id, updates) => {
    setSigners(current => current.map(signer => signer.id === id ? { ...signer, ...updates } : signer));
    setDirty(true); setChecked(false); setPreview(false);
  };
  const drag = (event, signer, resize = false) => {
    if (busy || row.status !== 'DRAFT') return;
    event.preventDefault();
    const element = event.currentTarget.closest('[data-proposal-overlay-page]');
    const rect = element.getBoundingClientRect();
    const startX = event.clientX, startY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = current => {
      const dx = (current.clientX - startX) / rect.width, dy = (current.clientY - startY) / rect.height;
      const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
      edit(signer.id, resize
        ? { box_width: clamp(Number(signer.box_width) + dx, 0.03, 1 - Number(signer.pos_x)),
          box_height: clamp(Number(signer.box_height) + dy, 0.03, 1 - Number(signer.pos_y)) }
        : { pos_x: clamp(Number(signer.pos_x) + dx, 0, 1 - Number(signer.box_width)),
          pos_y: clamp(Number(signer.pos_y) + dy, 0, 1 - Number(signer.box_height)) });
    };
    const target = event.currentTarget;
    const end = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  };
  const refreshHistory = async () => setHistory(valueOf(await service.recoveryHistory(proposalId, document.id, token)).history);
  const activate = originalVersion => run(async () => {
    valueOf(await service.activateRecovery(proposalId, document.id, row?.id || history[0]?.id,
      { reason, original: originalVersion }, token));
    onClose();
    await onApplied();
  });
  const frozenImage = signer => `${API_URL}/admin/proposal-signatures/${proposalId}/documents/${document.id}/recovery/${row.id}/image/${signer.id}?token=${encodeURIComponent(token)}`;
  const uploading = Object.values(uploads).some(Boolean);
  const working = busy || uploading || ['PENDING','PROCESSING'].includes(row?.status);
  const fileId = preview && row?.preview_file_id ? row.preview_file_id : row?.base_file_id;
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-2" role="dialog" aria-modal="true" aria-label="Phục hồi BCĐX đã ký">
      <div className="bg-base-100 rounded-xl w-full max-w-7xl max-h-[96vh] overflow-auto p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-bold">Phục hồi BCĐX đã ký từ DOCX gốc</h2>
          <button aria-label="Đóng phục hồi" className="btn btn-ghost btn-sm" disabled={busy || uploading} onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-sm">Giữ nguyên người ký, thời điểm, file và cấu hình ký gốc. Chỉ bản phục hồi được đổi vị trí/ảnh thiếu. Không sửa file chủ tịch.</p>
        <a className="link text-sm" href={`${API_URL}/files/${document.source_file_id}/download?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer">Tải DOCX gốc để đối chiếu</a>
        <label className="block text-sm">Lý do phục hồi / đổi bản đang dùng
          <textarea aria-label="Lý do phục hồi" className="textarea textarea-bordered w-full" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={working} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" disabled={working || !reason.trim()} onClick={() => run(async () => {
            takeRow(valueOf(await service.createRecovery(proposalId, document.id, reason, token)));
            await refreshHistory();
          })}>Tạo bản phục hồi mới</button>
          <select aria-label="Lịch sử phục hồi" className="select select-bordered select-sm" value={row?.id || ''} disabled={working} onChange={event => run(async () =>
            takeRow(valueOf(await service.recoveryStatus(proposalId, document.id, event.target.value, token))))}>
            <option value="" disabled>Chọn bản phục hồi</option>
            {history.map(item => <option key={item.id} value={item.id}>#{item.id} · {labels[item.status]} · {new Date(item.created_at).toLocaleString('vi-VN')}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" disabled={working || !history.length || !reason.trim()} onClick={() => activate(true)}>Trở về bản gốc</button>
        </div>
        {error && <div role="alert" className="alert alert-error text-sm">{error}</div>}
        {row && <p className="text-sm font-medium">Bản #{row.id}: {labels[row.status]} {row.error && <span className="text-error">{row.error}</span>}</p>}
        {row?.reason && <p className="text-sm">Lý do bản này: {row.reason} · Người tạo #{row.created_by}
          {row.confirmed_at && ` · Xác nhận bởi #${row.confirmed_by} lúc ${new Date(row.confirmed_at).toLocaleString('vi-VN')}`}</p>}
        {row?.warnings?.map((warning, index) => <p className="text-warning text-sm" key={index}>{warning}</p>)}
        {fileId && <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <div>
            <div className="flex gap-2 mb-2">
              <button className={`btn btn-xs ${!preview ? 'btn-primary' : ''}`} onClick={() => setPreview(false)}>PDF nền / chỉnh ô ký</button>
              <button className={`btn btn-xs ${preview ? 'btn-primary' : ''}`} disabled={!row.preview_file_id || dirty} onClick={() => setPreview(true)}>PDF đã chèn chữ ký</button>
            </div>
            <ProposalDocumentPages file={{ id: fileId, mime_type: 'application/pdf', original_name: 'BCDX-phuc-hoi.pdf' }} showPageLabel
              renderPageOverlay={preview ? null : page => signers.filter(signer => Number(signer.page) === page).map(signer => {
                const image = row.images?.find(item => Number(item.config_id) === Number(signer.id));
                return <div key={signer.id} data-signer-overlay className="absolute border-2 border-primary bg-primary/10 pointer-events-auto touch-none text-[10px] overflow-hidden"
                  style={{ left: `${Number(signer.pos_x)*100}%`, top: `${Number(signer.pos_y)*100}%`, width: `${Number(signer.box_width)*100}%`, height: `${Number(signer.box_height)*100}%` }}
                  onPointerDown={event => drag(event, signer)}>
                  <div className="text-center">{signer.signer_department}</div>
                  {image && !['MISSING','MANUAL'].includes(image.source) && <img src={frozenImage(signer)} alt={`Chữ ký ${signer.full_name}`} draggable={false} className="h-1/2 max-w-full mx-auto object-contain pointer-events-none" />}
                  <div className="text-center">{signer.full_name}</div>
                  {row.status === 'DRAFT' && <button aria-label={`Đổi kích thước ${signer.full_name}`} className="absolute bottom-0 right-0 bg-primary w-4 h-4 cursor-se-resize" onPointerDown={event => { event.stopPropagation(); drag(event, signer, true); }} />}
                </div>;
              })} />
          </div>
          <div className="space-y-3">
            {signers.map(signer => {
              const image = row.images?.find(item => Number(item.config_id) === Number(signer.id));
              const editable = row.status === 'DRAFT' && !busy;
              return <fieldset key={signer.id} disabled={!editable} className="border rounded p-2 space-y-2 text-sm">
                <legend className="font-semibold">{signer.full_name}</legend>
                <p>{signer.signer_department} · {signer.signed_at ? new Date(signer.signed_at).toLocaleString('vi-VN') : 'Hoàn tất thủ công — không tạo chữ ký giả'}</p>
                <p>Nguồn ảnh: {image?.source === 'MISSING' ? 'Thiếu/hỏng — cần thay thế' : image?.source === 'MANUAL' ? 'Thủ công, không ảnh' : image?.source || 'Đang tải'}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[['page','Trang',1],['pos_x','X (0–1)',0.001],['pos_y','Y (0–1)',0.001],['box_width','Rộng (0–1)',0.001],['box_height','Cao (0–1)',0.001]].map(([key,label,step]) =>
                    <label key={key}>{label}<input aria-label={`${label} ${signer.full_name}`} type="number" step={step} className="input input-bordered input-sm w-full" value={signer[key] ?? ''} onChange={event => edit(signer.id, { [key]: event.target.value })} /></label>)}
                </div>
                <button className="btn btn-xs" onClick={() => {
                  const saved = original.find(item => Number(item.id) === Number(signer.id));
                  if (saved) edit(signer.id, { page: saved.page, pos_x: saved.pos_x, pos_y: saved.pos_y, box_width: saved.box_width, box_height: saved.box_height });
                }}>Đặt lại vị trí gốc</button>
                {image && ['MISSING','REPLACEMENT'].includes(image.source) && <>
                  <FileUpload value={replacements[signer.id]?.file || null} disabled={!editable} multiple={false} accept="image/png,image/jpeg,image/webp,image/gif"
                    fileConfig={{ maxSize: 10 }} onUploadingChange={value => setUploads(current => ({ ...current, [signer.id]: value }))} onChange={value => {
                      setReplacements(current => ({ ...current, [signer.id]: { ...current[signer.id], file: Array.isArray(value) ? value[0] : value } }));
                      setDirty(true); setChecked(false);
                    }} />
                  <textarea aria-label={`Lý do thay ảnh ${signer.full_name}`} placeholder="Bắt buộc lý do nếu chọn ảnh thay thế" className="textarea textarea-bordered w-full" value={replacements[signer.id]?.reason || ''} onChange={event =>
                    setReplacements(current => ({ ...current, [signer.id]: { ...current[signer.id], reason: event.target.value } }))} />
                </>}
              </fieldset>;
            })}
          </div>
        </div>}
        {row?.status === 'DRAFT' && <button className="btn btn-secondary btn-sm" disabled={working} onClick={() => run(async () => {
          const changedImages = Object.entries(replacements).filter(([, item]) => item.file?.id).map(([config_id,item]) =>
            ({ config_id: Number(config_id), file_id: item.file.id, reason: item.reason }));
          takeRow(valueOf(await service.recoveryPreview(proposalId, document.id, row.id, { signers, replacements: changedImages }, token)));
          await refreshHistory();
        })}>Dựng PDF xem trước có chữ ký</button>}
        {row?.preview_file_id && <label className="flex gap-2 items-center text-sm">
          <input type="checkbox" checked={checked} disabled={dirty || !preview} onChange={event => setChecked(event.target.checked)} />
          Tôi đã kiểm tra nội dung, số trang, mọi chữ ký và bố cục PDF đã chèn chữ ký.
        </label>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-sm" disabled={busy || uploading} onClick={onClose}>Đóng</button>
          <button className="btn btn-primary btn-sm" disabled={working || !row?.preview_file_id || dirty || !checked || !reason.trim()} onClick={() => activate(false)}>Xác nhận dùng bản phục hồi</button>
        </div>
      </div>
    </div>, window.document.body
  );
}
