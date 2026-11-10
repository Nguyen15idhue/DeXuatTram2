import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalApprovalService, proposalReportService } from '../../services/api';
import { documentFile, ensureDocumentResponse, fileName, getDocumentSigners, isDocumentAwaitingConversion, isUnsupportedSigningFile } from '../../utils/proposalDocuments';
import ProposalDocumentConversionList from './ProposalDocumentConversionList';
import FileViewer from '../dynamic/FileViewer';
import { Eye, FileText, Plus, Send, Trash2, X } from 'lucide-react';
import {
  DEFAULT_SIGNER_BOX,
  getReportFiles
} from '../../utils/proposalApproval';
import {
  getSignerBoxMinHeightRatio,
  normalizeSignerBox
} from '../../utils/proposalSignature';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ProposalSignatureConfigModal = ({ open, record, onClose, onSaved, onRequestUpdate }) => {
  const { token } = useAuth();
  const canvasRef = useRef(null);
  const [candidates, setCandidates] = useState([]);
  const [signers, setSigners] = useState([]);
  const [fileId, setFileId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [drag, setDrag] = useState(null);
  const [revisionText, setRevisionText] = useState('');
  const [showRevision, setShowRevision] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentId, setDocumentId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [canWithdraw, setCanWithdraw] = useState(false);

  const legacyFiles = useMemo(() => (record ? getReportFiles(record) : []), [record]);
  const reportFiles = documents.length ? documents.map(documentFile).filter(Boolean) : legacyFiles;
  const activeDocument = documents.find((document) => String(document.id) === String(documentId));
  const selectedFile = reportFiles.find((file) => Number(file.id) === Number(fileId));
  const minBoxHeightRatio = getSignerBoxMinHeightRatio(selectedFile);
  const code = record?.ma_de_xuat || (record?.id ? `#${record.id}` : '');

  useEffect(() => {
    if (!open || !record) return;
    setError('');
    setSaving(false);
    setLoading(true);
    setSelectedUser('');
    setRevisionText('');
    setShowRevision(false);
    setFileId(reportFiles[0] ? reportFiles[0].id : null);
    (async () => {
      try {
        const [candRes, configRes] = await Promise.all([
          proposalApprovalService.getSignerCandidates(record.id, token),
          proposalApprovalService.getSignatureConfig(record.id, token)
        ]);
        ensureDocumentResponse(candRes);
        ensureDocumentResponse(configRes);
        const nextDocuments = configRes?.data?.documents || [];
        setDocuments(nextDocuments);
        setCanWithdraw(configRes?.data?.can_withdraw ?? ((configRes?.data?.signers || []).length > 0 && !(configRes?.data?.signers || []).some((signer) => signer.status === 'SIGNED')));
        if (nextDocuments.length) {
          const nextDrafts = Object.fromEntries(nextDocuments.map((document) => [
            document.id,
            getDocumentSigners(document, configRes.data.signers).map((signer) => normalizeSignerBox(signer, getSignerBoxMinHeightRatio(documentFile(document))))
          ]));
          setCandidates(candRes?.data?.candidates || []);
          setDrafts(nextDrafts);
          setDocumentId(nextDocuments[0].id);
          setFileId(documentFile(nextDocuments[0])?.id || null);
          setSigners(nextDrafts[nextDocuments[0].id]);
          return;
        }
        setDocumentId(null);
        setDrafts({});
        const configuredFileId = configRes?.data?.signers?.[0]?.file_id
          || reportFiles[0]?.id
          || null;
        const configuredFile = reportFiles.find(
          (file) => Number(file.id) === Number(configuredFileId)
        );
        const configuredMinHeightRatio = getSignerBoxMinHeightRatio(configuredFile);
        setCandidates(candRes?.data?.candidates || []);
        setSigners((configRes?.data?.signers || []).map((signer) => normalizeSignerBox({
          user_id: signer.user_id,
          full_name: signer.full_name,
          signer_title: signer.signer_title,
          signer_department: signer.signer_department || null,
          page: signer.page || 1,
          pos_x: signer.pos_x,
          pos_y: signer.pos_y,
          box_width: signer.box_width,
          box_height: signer.box_height
        }, configuredMinHeightRatio)));
        setFileId(configuredFileId);
      } catch (err) {
        setError(err?.message || 'Không tải được danh sách người ký');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (event) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = (event.clientX - drag.startX) / rect.width;
      const dy = (event.clientY - drag.startY) / rect.height;
      setSigners((prev) => prev.map((signer, index) => {
        if (index !== drag.index) return signer;
        if (drag.mode === 'resize') {
          return {
            ...signer,
            box_width: clamp(drag.origWidth + dx, 0, 1 - signer.pos_x),
            box_height: clamp(
              drag.origHeight + dy,
              minBoxHeightRatio,
              Math.max(minBoxHeightRatio, 1 - signer.pos_y)
            )
          };
        }
        return {
          ...signer,
          pos_x: clamp(drag.origPosX + dx, 0, 1 - signer.box_width),
          pos_y: clamp(drag.origPosY + dy, 0, 1 - signer.box_height)
        };
      }));
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, minBoxHeightRatio]);

  if (!open || !record) return null;

  const addSigner = () => {
    if (isUnsupportedSigningFile(selectedFile) || isDocumentAwaitingConversion(activeDocument)) return;
    if (!selectedUser) return;
    const candidate = candidates.find((item) => String(item.id) === String(selectedUser));
    if (!candidate) return;
    if (signers.some((signer) => String(signer.user_id) === String(candidate.id))) {
      setError('Người này đã được thêm vào danh sách ký');
      return;
    }
    setError('');
    setSigners((prev) => [...prev, {
      user_id: candidate.id,
      full_name: candidate.full_name,
      signer_title: candidate.chuc_vu || candidate.department || null,
      signer_department: candidate.department || null,
      ...DEFAULT_SIGNER_BOX
    }]);
    setSelectedUser('');
  };

  const removeSigner = (userId) => {
    setSigners((prev) => prev.filter((signer) => String(signer.user_id) !== String(userId)));
  };

  const updateSigner = (userId, patch) => {
    setSigners((prev) => prev.map((signer) => (
      String(signer.user_id) === String(userId) ? { ...signer, ...patch } : signer
    )));
  };

  const submit = async () => {
    setError('');
    const allDrafts = { ...drafts, [documentId]: signers };
    if (documents.some((document) => isUnsupportedSigningFile(documentFile(document)) || isDocumentAwaitingConversion(document))) {
      setError('Định dạng .doc không hỗ trợ ký. Vui lòng yêu cầu tải lại PDF hoặc DOCX.');
      return;
    }
    if (signers.length === 0 || documents.some((document) => !allDrafts[document.id]?.length)) {
      setError('Vui lòng chọn ít nhất một người ký cho mỗi tài liệu');
      return;
    }
    setSaving(true);
    try {
      const legacyPayload = {
        file_id: fileId,
        signers: signers.map((signer) => {
          const normalized = normalizeSignerBox(signer, minBoxHeightRatio);
          return {
            user_id: signer.user_id,
            signer_title: signer.signer_title,
            signer_department: signer.signer_department,
            page: signer.page,
            pos_x: normalized.pos_x,
            pos_y: normalized.pos_y,
            box_width: normalized.box_width,
            box_height: normalized.box_height
          };
        })
      };
      const payload = documents.length ? { documents: documents.map((document) => ({
        document_id: document.id,
        file_id: documentFile(document)?.id,
        signers: allDrafts[document.id].map((signer) => normalizeSignerBox(signer, getSignerBoxMinHeightRatio(documentFile(document))))
      })) } : legacyPayload;
      const res = ensureDocumentResponse(await proposalApprovalService.configureSignature(record.id, payload, token));
      onSaved && onSaved(res?.data);
    } catch (err) {
      setError(err?.message || 'Không cấu hình được trình ký');
    } finally {
      setSaving(false);
    }
  };

  const selectDocument = (document) => {
    setDrafts((current) => ({ ...current, [documentId]: signers }));
    setDocumentId(document.id);
    setFileId(documentFile(document)?.id || null);
    setSigners(drafts[document.id] || []);
    setSelectedUser('');
    setDrag(null);
  };

  const retryConversion = async (id) => {
    setSaving(true);
    setError('');
    try {
      const response = ensureDocumentResponse(await proposalReportService.convertDocument(record.id, id, token));
      const next = response?.data?.documents || [];
      setDocuments(next);
      const active = next.find((document) => String(document.id) === String(documentId));
      if (active) setFileId(documentFile(active)?.id || null);
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  };

  const withdraw = async () => {
    setSaving(true);
    setError('');
    try {
      const response = ensureDocumentResponse(await proposalApprovalService.withdrawSignature(record.id, token));
      onSaved?.(response.data);
    } catch (err) {
      setError(err.message || 'Không thể thu hồi cấu hình ký');
    } finally { setSaving(false); }
  };

  const submitRevision = async () => {
    const description = revisionText.trim();
    if (!description) {
      setError('Vui lòng mô tả nội dung cần cập nhật');
      return;
    }
    setSaving(true);
    try {
      const res = await proposalApprovalService.requestUpdate(record.id, { description }, token);
      onRequestUpdate && onRequestUpdate(res?.data);
    } catch (err) {
      setError(err?.message || 'Không gửi được yêu cầu cập nhật');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog className="modal modal-open" style={{ zIndex: 60 }}>
      <div className="modal-box max-w-5xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-lg">Cấu hình ký BCĐX</h3>
            <p className="text-sm text-base-content/70">Mã đề xuất: {code}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose} title="Đóng" disabled={saving}>
            <X size={18} />
          </button>
        </div>

        {documents.length > 0 && <div className="space-y-2 mb-3">
          <label className="form-control">
            <span className="label-text font-semibold">Tài liệu cấu hình ký</span>
            <select aria-label="Tài liệu cấu hình ký" className="select select-bordered select-sm" value={documentId || ''} disabled={loading || saving} onChange={(event) => selectDocument(documents.find((document) => String(document.id) === event.target.value))}>
              {documents.map((document) => <option key={document.id} value={document.id}>{fileName(document.source_file || documentFile(document))} · {(String(document.id) === String(documentId) ? signers : drafts[document.id] || []).length} người ký</option>)}
            </select>
          </label>
          <ProposalDocumentConversionList documents={documents} onRetry={retryConversion} busy={saving || loading} />
          {activeDocument?.conversion_status === 'FAILED' && <p className="text-warning text-sm">Đang cấu hình trên bản Word gốc; bố cục có thể thay đổi. Nên chuyển PDF trước khi cấu hình.</p>}
        </div>}
        <fieldset disabled={saving || loading || documents.some((document) => document.has_signed)}>
        <div className="grid gap-3 lg:grid-cols-2">
          {/* File BCĐX */}
          <div className="space-y-2">
            <p className="font-semibold text-sm">File tờ trình BCĐX</p>
            {reportFiles.length === 0 ? (
              <p className="text-sm text-base-content/60">Đề xuất chưa có file tờ trình BCĐX</p>
            ) : (
              <ul className="space-y-1">
                {reportFiles.map((file) => (
                  <li key={file.id} className="flex items-center gap-2 border rounded p-2">
                    <input
                      type="radio"
                      name="bcdx-file"
                      checked={Number(fileId) === Number(file.id)}
                      disabled={documents.length > 0}
                      onChange={() => { setFileId(file.id); setSigners([]); }}
                    />
                    <FileText size={14} />
                    <span className="text-sm truncate flex-1">{file.name || `File #${file.id}`}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs gap-1"
                      onClick={() => setViewing({ id: file.id, original_name: file.name, mime_type: file.mime_type })}
                    >
                      <Eye size={14} />
                      Xem
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border rounded p-2 space-y-2">
              <p className="text-xs font-semibold text-base-content/70">
                Nếu file chưa phù hợp → yêu cầu cập nhật lại file/thông tin
              </p>
              {!showRevision ? (
                <button
                  type="button"
                  className="btn btn-outline btn-warning btn-sm"
                  onClick={() => setShowRevision(true)}
                >
                  Yêu cầu cập nhật thông tin
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    className="textarea textarea-bordered w-full min-h-20"
                    placeholder="Mô tả nội dung cần cập nhật (file BCĐX, số lượng trụ, thông tin đề xuất)..."
                    value={revisionText}
                    onChange={(e) => setRevisionText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-warning btn-sm gap-1"
                      onClick={submitRevision}
                      disabled={saving}
                    >
                      <Send size={14} />
                      Gửi yêu cầu
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRevision(false)}>
                      Hủy
                    </button>
                  </div>
                  </fieldset>
                </div>
              )}
            </div>
          </div>

          {/* Người ký + vị trí ký */}
          <div className="space-y-2">
            <p className="font-semibold text-sm">Người ký</p>
            <div className="flex gap-2">
              <select
                className="select select-bordered select-sm flex-1"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
              >
                <option value="">-- Chọn người ký --</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.full_name}{candidate.chuc_vu ? ` (${candidate.chuc_vu})` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm gap-1" onClick={addSigner} disabled={!selectedUser || isUnsupportedSigningFile(selectedFile) || isDocumentAwaitingConversion(activeDocument)}>
                <Plus size={14} />
                Thêm
              </button>
            </div>

            {signers.length > 0 && (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {signers.map((signer) => (
                  <li key={signer.user_id} className="flex items-center gap-2 border rounded p-2 text-sm">
                    <span className="flex-1 truncate">{signer.full_name}</span>
                    <input
                      type="number"
                      min={1}
                      className="input input-bordered input-xs w-16"
                      value={signer.page}
                      onChange={(e) => updateSigner(signer.user_id, { page: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      title="Trang"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => removeSigner(signer.user_id)}
                      title="Xóa"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-base-content/60">
              Kéo thả ô ký trên trang giấy để chọn vị trí (kéo góc dưới phải để đổi kích thước).
            </p>
            <div
              ref={canvasRef}
              className="relative w-full bg-white border rounded shadow-sm"
              style={{ aspectRatio: '210 / 297' }}
            >
              {signers.map((signer, index) => (
                <div
                  key={signer.user_id}
                  className="absolute border-2 border-primary bg-primary/10 cursor-move"
                  style={{
                    left: `${signer.pos_x * 100}%`,
                    top: `${signer.pos_y * 100}%`,
                    width: `${signer.box_width * 100}%`,
                    height: `${signer.box_height * 100}%`
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setDrag({
                      index,
                      mode: 'move',
                      startX: event.clientX,
                      startY: event.clientY,
                      origPosX: signer.pos_x,
                      origPosY: signer.pos_y
                    });
                  }}
                >
                  <span className="absolute -top-5 left-0 text-[10px] bg-primary text-primary-content px-1 rounded whitespace-nowrap">
                    {signer.full_name}
                  </span>
                  <span
                    className="absolute -bottom-1 -right-1 z-10 w-3 h-3 bg-primary border border-white cursor-nwse-resize"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDrag({
                        index,
                        mode: 'resize',
                        startX: event.clientX,
                        startY: event.clientY,
                        origWidth: signer.box_width,
                        origHeight: signer.box_height
                      });
                    }}
                  />
                </div>
              ))}
              {signers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-base-content/50">
                  Chưa có người ký nào được cấu hình
                </div>
              )}
            </div>
          </div>
        </div>

        {loading && <p className="text-sm text-base-content/60 mt-2">Đang tải dữ liệu...</p>}
        {error ? <div className="alert alert-error text-sm py-2 mt-2">{error}</div> : null}

        <div className="modal-action">
          {canWithdraw && <button type="button" className="btn btn-outline btn-warning" disabled={saving || loading} onClick={withdraw}>Thu hồi cấu hình ký</button>}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Đóng</button>
          <button type="button" className="btn btn-success gap-1" onClick={submit} disabled={saving || loading || documents.some((document) => document.has_signed || isUnsupportedSigningFile(documentFile(document)) || isDocumentAwaitingConversion(document))}>
            <Send size={16} />
            Xác nhận trình ký
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={saving ? undefined : onClose}>
        <button type="button">close</button>
      </form>

      {viewing && (
        <FileViewer file={viewing} onClose={() => setViewing(null)} fullScreen />
      )}
    </dialog>
  );
};

export default ProposalSignatureConfigModal;
