import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, FileText, Plus, Send, Trash2 } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import ProposalDocumentPages from "../../components/admin/ProposalDocumentPages";
import { useAuth } from "../../contexts/AuthContext";
import { proposalApprovalService } from "../../services/api";
import {
  DEFAULT_SIGNER_BOX,
  getReportFiles,
} from "../../utils/proposalApproval";
import { normalizeSignerBox } from "../../utils/proposalSignature";
import signerTextLayout from "../../utils/signatureTextLayout.json";
import SignerDetailsText from "../../components/admin/SignerDetailsText";
import ProposalLocationMapButton from "../../components/admin/ProposalLocationMapButton";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ProposalSignatureConfigPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const docPagesRef = useRef(null);
  const [proposal, setProposal] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [signers, setSigners] = useState([]);
  const [fileId, setFileId] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [drag, setDrag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError("");
    try {
      const [proposalResponse, candidateResponse, configResponse] =
        await Promise.all([
          proposalApprovalService.getProposal(id, token),
          proposalApprovalService.getSignerCandidates(id, token),
          proposalApprovalService.getSignatureConfig(id, token),
        ]);
      const loadedProposal = proposalResponse?.data || null;
      const loadedSigners = (configResponse?.data?.signers || []).map((signer) => normalizeSignerBox({
          user_id: signer.user_id,
          full_name: signer.full_name,
          signer_title: signer.signer_title,
          page: signer.page || 1,
          pos_x: signer.pos_x,
          pos_y: signer.pos_y,
          box_width: signer.box_width,
          box_height: signer.box_height ?? DEFAULT_SIGNER_BOX.box_height,
        }));
      setProposal(loadedProposal);
      setCandidates(candidateResponse?.data?.candidates || []);
      setSigners(loadedSigners);
      setFileId(
        configResponse?.data?.signers?.[0]?.file_id ||
          getReportFiles(loadedProposal)[0]?.id ||
          null,
      );
      setActivePage(loadedSigners[0]?.page || 1);
    } catch (loadError) {
      setError(loadError?.message || "Không tải được dữ liệu cấu hình ký");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (event) => {
      const targetPage = drag.mode === "move"
        ? document.elementFromPoint(event.clientX, event.clientY)
          ?.closest?.("[data-proposal-page]")
        : null;
      const pageElement = targetPage || drag.pageElement;
      const rect = pageElement?.getBoundingClientRect();
      const pageWidth = rect?.width || drag.pageWidth || 1;
      const pageHeight = rect?.height || drag.pageHeight || 1;
      const dx = (event.clientX - drag.startX) / (drag.pageWidth || 1);
      const dy = (event.clientY - drag.startY) / (drag.pageHeight || 1);
      setSigners((current) =>
        current.map((signer) => {
          if (Number(signer.user_id) !== Number(drag.userId)) return signer;
          const currentBox = normalizeSignerBox(signer);
          if (drag.mode === "resize") {
            return {
              ...currentBox,
              box_width: clamp(drag.origWidth + dx, 0, 1 - currentBox.pos_x),
              box_height: clamp(drag.origHeight + dy, 0, 1 - currentBox.pos_y),
            };
          }
          const page = Number(pageElement?.dataset?.proposalPage) || signer.page;
          return {
            ...currentBox,
            page,
            pos_x: clamp(
              (event.clientX - (rect?.left || 0)) / pageWidth - drag.grabOffsetX * currentBox.box_width,
              0,
              1 - currentBox.box_width,
            ),
            pos_y: clamp(
              (event.clientY - (rect?.top || 0)) / pageHeight - drag.grabOffsetY * currentBox.box_height,
              0,
              1 - currentBox.box_height,
            ),
          };
        }),
      );
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  const reportFiles = useMemo(() => getReportFiles(proposal), [proposal]);
  const selectedFile = reportFiles.find(
    (file) => Number(file.id) === Number(fileId),
  );
  const candidateGroups = useMemo(() => {
    const groups = new Map();
    candidates.forEach((candidate) => {
      const category = candidate.category || "Người liên quan";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(candidate);
    });
    return [...groups.entries()];
  }, [candidates]);

  const startDrag = (event, signer, mode) => {
    event.preventDefault();
    event.stopPropagation();
    const pageEl = event.currentTarget.closest?.("[data-proposal-page]") || null;
    const rect = pageEl?.getBoundingClientRect();
    const overlay = event.currentTarget.closest?.("[data-signer-overlay]") || null;
    const overlayRect = overlay?.getBoundingClientRect();
    setDrag({
      userId: signer.user_id,
      page: signer.page,
      pageElement: pageEl,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      pageWidth: rect?.width || 1,
      pageHeight: rect?.height || 1,
      grabOffsetX: overlayRect?.width
        ? clamp((event.clientX - overlayRect.left) / overlayRect.width, 0, 1)
        : 0.5,
      grabOffsetY: overlayRect?.height
        ? clamp((event.clientY - overlayRect.top) / overlayRect.height, 0, 1)
        : 0.5,
      origPosX: signer.pos_x,
      origPosY: signer.pos_y,
      origWidth: signer.box_width,
      origHeight: signer.box_height,
    });
  };

  const addSigner = (candidateId) => {
    const candidate = candidates.find(
      (item) => String(item.id) === String(candidateId),
    );
    if (!candidate) return;
    if (
      signers.some((signer) => Number(signer.user_id) === Number(candidate.id))
    ) {
      setError("Người này đã được thêm vào danh sách ký");
      return;
    }
    setError("");
    setSigners((current) => [
      ...current,
      {
        user_id: Number(candidate.id),
        full_name: candidate.full_name,
        signer_title: candidate.chuc_vu || candidate.department || null,
        ...DEFAULT_SIGNER_BOX,
        page: activePage,
      },
    ]);
  };

  const submit = async () => {
    setError("");
    if (!fileId) {
      setError("Đề xuất chưa có file tờ trình BCĐX");
      return;
    }
    if (signers.length === 0) {
      setError("Vui lòng chọn ít nhất một người ký");
      return;
    }
    setSaving(true);
    try {
      await proposalApprovalService.configureSignature(
        proposal.id,
        {
          file_id: fileId,
          signers: signers.map((signer) => {
            const normalized = normalizeSignerBox(signer);
            return {
              user_id: signer.user_id,
              signer_title: signer.signer_title,
              page: signer.page,
              pos_x: normalized.pos_x,
              pos_y: normalized.pos_y,
              box_width: normalized.box_width,
              box_height: normalized.box_height,
            };
          }),
        },
        token,
      );
      navigate(`/admin/proposals/duyet-bcdx/${proposal.id}`);
    } catch (submitError) {
      setError(submitError?.message || "Không cấu hình được trình ký");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="space-y-4">
        <div className="alert alert-error">{error}</div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} /> Đóng
        </button>
      </div>
    );
  }

  if (!proposal) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Cấu hình ký BCĐX — ${proposal.ma_de_xuat || `#${proposal.id}`}`}
        actions={<ProposalLocationMapButton proposal={proposal} />}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(500px,1.4fr)]">
        <section className="space-y-3 rounded-lg border bg-base-100 p-4">
          <div>
            <h2 className="font-semibold">Danh sách người ký</h2>
            <p className="mt-1 text-xs text-base-content/60">
              Chọn người thuộc Ban Tổng giám đốc, Phòng Tài chính, Back Office, người đề xuất hoặc quản lý phía trên.
              Người ký mới sẽ được gắn vào trang đang chỉnh.
            </p>
          </div>

          {candidateGroups.length === 0 ? (
            <div className="alert">Không tìm thấy người ký phù hợp.</div>
          ) : (
            candidateGroups.map(([category, groupCandidates]) => (
              <div key={category} className="space-y-1">
                <h3 className="text-xs font-semibold uppercase text-base-content/60">
                  {category}
                </h3>
                {groupCandidates.map((candidate) => {
                  const isAdded = signers.some(
                    (signer) => Number(signer.user_id) === Number(candidate.id),
                  );
                  return (
                    <div
                      key={candidate.id}
                      className="flex items-center gap-2 rounded border px-2 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {candidate.full_name}
                        </p>
                        <p className="truncate text-xs text-base-content/60">
                          {candidate.chuc_vu ||
                            candidate.department ||
                            candidate.role}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`btn btn-xs gap-1 ${isAdded ? "btn-success" : "btn-outline"}`}
                        disabled={isAdded}
                        onClick={() => addSigner(candidate.id)}
                      >
                        {isAdded ? <Check size={13} /> : <Plus size={13} />}
                        {isAdded ? "Đã thêm" : "Thêm ô ký"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}

          <div className="border-t pt-3">
            <h3 className="mb-2 text-sm font-semibold">
              Đã chọn ({signers.length})
            </h3>
            {signers.length === 0 ? (
              <p className="text-sm text-base-content/60">Chưa có người ký.</p>
            ) : (
              <ul className="space-y-2">
                {signers.map((signer) => (
                  <li
                    key={signer.user_id}
                    className="flex items-center gap-2 rounded border p-2"
                  >
                    <button
                      type="button"
                      className={`min-w-0 flex-1 truncate text-left text-sm ${Number(signer.page) === activePage ? "font-semibold text-primary" : ""}`}
                      onClick={() => docPagesRef.current?.scrollToOverlay?.(Number(signer.page) || 1, signer.user_id)}
                    >
                      {signer.full_name}
                      <span className="ml-1 text-xs text-base-content/60">
                        — trang {signer.page}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Xóa người ký"
                      onClick={() =>
                        setSigners((current) =>
                          current.filter(
                            (item) =>
                              Number(item.user_id) !== Number(signer.user_id),
                          ),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border bg-base-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText size={18} />
              <h2 className="font-semibold">Bản xem trước và vị trí ký</h2>
            </div>
            <label className="flex items-center gap-2 text-sm">
              File BCĐX
              <select
                className="select select-bordered select-sm w-auto pr-10"
                value={fileId || ""}
                onChange={(event) =>
                  setFileId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">-- Chọn file --</option>
                {reportFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name || `File #${file.id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <span className="text-sm text-base-content/70">Đang xem trang {activePage}</span>

          {!selectedFile ? (
            <div className="flex min-h-80 items-center justify-center rounded border border-dashed text-sm text-base-content/60">
              Đề xuất chưa có file tờ trình BCĐX để xem trước.
            </div>
          ) : (
            <>
              <p className="text-xs text-base-content/60">
                Kéo khung để đổi vị trí hoặc đưa sang trang khác; kéo nút ở góc
                dưới bên phải để đổi kích thước. Ô ký sẽ tự theo dõi trang đang xem.
              </p>
              <ProposalDocumentPages
                ref={docPagesRef}
                file={{
                  id: selectedFile.id,
                  original_name: selectedFile.name,
                  mime_type: selectedFile.mime_type,
                }}
                showPageLabel
                activePage={activePage}
                onActivePageChange={setActivePage}
                renderPageOverlay={(pageNumber) => {
                  return signers
                    .filter((signer) => Number(signer.page) === pageNumber)
                    .map((sourceSigner) => {
                      const signer = normalizeSignerBox(sourceSigner);
                      return (
                      <div
                        key={signer.user_id}
                        data-signer-overlay=""
                        data-signer-overlay-id={signer.user_id}
                        className="pointer-events-auto absolute z-30 flex cursor-move flex-col items-start justify-start overflow-visible border-2 border-primary bg-white/90 px-1 py-0.5 text-left leading-tight"
                        style={{
                          left: `${signer.pos_x * 100}%`,
                          top: `${signer.pos_y * 100}%`,
                          width: `${signer.box_width * 100}%`,
                          height: `${signer.box_height * 100}%`,
                          boxSizing: "border-box",
                          touchAction: "none",
                        }}
                        onPointerDown={(event) =>
                          startDrag(event, signer, "move")
                        }
                      >
                        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-primary px-1 text-[10px] text-primary-content">
                          {signer.full_name}
                        </span>
                        <div
                          className="w-full flex-none overflow-hidden pb-1 text-left text-[10px] text-base-content/50"
                          style={{ height: `${signerTextLayout.imageHeightRatio * 100}%` }}
                        >
                          Ảnh chữ ký
                        </div>
                        <div className="min-h-0 w-full flex-1 overflow-hidden text-left">
                          <SignerDetailsText signer={signer} timeText="Thời gian ký" />
                        </div>
                        <span
                          className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize border border-white bg-primary"
                          onPointerDown={(event) =>
                            startDrag(event, signer, "resize")
                          }
                        />
                      </div>
                      );
                    });
                }}
              />
            </>
          )}
        </section>
      </div>

      {error && <div className="alert alert-error py-2">{error}</div>}
      <div className="flex justify-end gap-2 border-t pt-4">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate(`/admin/proposals/duyet-bcdx/${proposal.id}`)}
          disabled={saving}
        >
          <ArrowLeft size={16} /> Đóng
        </button>
        <button
          type="button"
          className="btn btn-success gap-2"
          onClick={submit}
          disabled={
            saving ||
            !selectedFile ||
            signers.length === 0 ||
            proposal.status !== "PROPOSAL_REPORT_REVIEWING"
          }
        >
          {saving ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            <Send size={16} />
          )}
          Xác nhận trình ký
        </button>
      </div>
    </div>
  );
};

export default ProposalSignatureConfigPage;
