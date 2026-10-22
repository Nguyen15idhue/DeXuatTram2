import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalApprovalService } from '../../services/api';
import FileViewer from '../dynamic/FileViewer';
import { Eye, FileText, Plus, Send, Trash2, X } from 'lucide-react';
import {
  DEFAULT_SIGNER_BOX,
  getReportFiles
} from '../../utils/proposalApproval';

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

  const reportFiles = useMemo(() => (record ? getReportFiles(record) : []), [record]);
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
        setCandidates(candRes?.data?.candidates || []);
        setSigners((configRes?.data?.signers || []).map((signer) => ({
          user_id: signer.user_id,
          full_name: signer.full_name,
          signer_title: signer.signer_title,
          page: signer.page || 1,
          pos_x: signer.pos_x,
          pos_y: signer.pos_y,
          box_width: signer.box_width,
          box_height: signer.box_height
        })));
        if (configRes?.data?.signers?.[0]?.file_id) {
          setFileId(configRes.data.signers[0].file_id);
        }
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
            box_width: clamp(signer.box_width + dx, 0.05, 1),
            box_height: clamp(signer.box_height + dy, 0.02, 0.5)
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
  }, [drag]);

  if (!open || !record) return null;

  const addSigner = () => {
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
    if (signers.length === 0) {
      setError('Vui lòng chọn ít nhất một người ký');
      return;
    }
    setSaving(true);
    try {
      const res = await proposalApprovalService.configureSignature(record.id, {
        file_id: fileId,
        signers: signers.map((signer) => ({
          user_id: signer.user_id,
          signer_title: signer.signer_title,
          page: signer.page,
          pos_x: signer.pos_x,
          pos_y: signer.pos_y,
          box_width: signer.box_width,
          box_height: signer.box_height
        }))
      }, token);
      onSaved && onSaved(res?.data);
    } catch (err) {
      setError(err?.message || 'Không cấu hình được trình ký');
    } finally {
      setSaving(false);
    }
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
                      onChange={() => setFileId(file.id)}
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
              <button type="button" className="btn btn-primary btn-sm gap-1" onClick={addSigner} disabled={!selectedUser}>
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
                    className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary border border-white cursor-nwse-resize"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDrag({
                        index,
                        mode: 'resize',
                        startX: event.clientX,
                        startY: event.clientY
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
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Đóng</button>
          <button type="button" className="btn btn-success gap-1" onClick={submit} disabled={saving || loading}>
            <Send size={16} />
            Xác nhận trình ký
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={saving ? undefined : onClose}>
        <button type="button">close</button>
      </form>

      {viewing && (
        <FileViewer file={viewing} onClose={() => setViewing(null)} />
      )}
    </dialog>
  );
};

export default ProposalSignatureConfigModal;
