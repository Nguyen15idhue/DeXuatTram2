import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, MapPinned } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { proposalRequestService } from "../../services/api";
import DynamicForm from "../../components/dynamic/DynamicForm";
import ProposalLocationMapButton from "../../components/admin/ProposalLocationMapButton";
import { buildGoogleMapsHref as buildProposalGoogleMapsHref } from "../../components/admin/ProposalGoogleMapLink";

const REQUEST_LABELS = {
  UPDATE_INFO: "Yêu cầu cập nhật thông tin",
  SUPPLEMENT: "Yêu cầu bổ sung thông tin",
  LAYOUT_SUPPLEMENT: "Yêu cầu bổ sung thông tin để vẽ layout",
  RE_GRADE: "Yêu cầu chấm điểm lại",
  REVISE_BCDX: "Yêu cầu sửa BCĐX",
  TGD_REVIEW: "Trình Tổng giám đốc",
  OTHER: "Yêu cầu khác",
};

const AdminProposalRequestUpdatePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolutionNote, setResolutionNote] = useState(
    "Đã cập nhật thông tin theo yêu cầu.",
  );
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError("");
    try {
      const response = await proposalRequestService.getUpdateContext(id, token);
      if (!response?.success)
        throw new Error(response?.message || "Không tải được yêu cầu cập nhật");
      setContext(response.data);
    } catch (e) {
      setError(e?.message || "Không tải được yêu cầu cập nhật");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (formData) => {
    if (saving || !context?.canComplete || !resolutionNote.trim()) return;
    setSaving(true);
    setError("");
    let saved = false;
    try {
      const updateData = { ...formData };
      delete updateData.chot_so_luong_tru;
      const response = await proposalRequestService.updateProposal(id, updateData, token);
      if (!response?.success)
        throw new Error(response?.message || "Không cập nhật được đề xuất");
      saved = true;
      const completion = await proposalRequestService.complete(
        id,
        { resolution_note: resolutionNote.trim() },
        token,
      );
      if (!completion?.success)
        throw new Error(completion?.message || "Không xác nhận được yêu cầu");
      navigate("/admin/proposals?tab=requests", { replace: true });
    } catch (e) {
      const message = saved
        ? `Đã lưu thông tin nhưng chưa xác nhận hoàn thành: ${e?.message || "Không xác nhận được yêu cầu"}. Vui lòng thử lại.`
        : e?.message || "Không cập nhật được đề xuất";
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  };

  const request = context?.request;
  const proposal = context?.proposal;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <button
        type="button"
        className="btn btn-ghost btn-sm gap-2"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft size={16} /> Trở về
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cập nhật theo yêu cầu</h1>
          <p className="text-sm text-base-content/60">
            Mã đề xuất: <strong>{request?.ma_de_xuat || "-"}</strong>
          </p>
        </div>
        {proposal && (
          <div className="flex gap-2">
            {buildProposalGoogleMapsHref(proposal) && (
              <a
                href={buildProposalGoogleMapsHref(proposal)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm gap-1"
                title="Mở vị trí đề xuất trên Google Maps"
              >
                <MapPinned size={15} />
                Mở Google Maps
              </a>
            )}
            <ProposalLocationMapButton proposal={proposal} />
          </div>
        )}
      </div>

      {loading && (
        <div className="text-center py-8">
          <span className="loading loading-spinner" />
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {!loading && context && !context.canUpdate && (
        <div className="alert alert-error">
          Bạn không có quyền cập nhật đề xuất thay người tạo.
        </div>
      )}

      {!loading && context?.canUpdate && request && proposal && (
        <>
          <section className="rounded-lg border bg-base-100 p-4 space-y-2">
            <div className="font-semibold">
              {REQUEST_LABELS[request.request_type] || request.request_type}
            </div>
            <div className="text-sm whitespace-pre-wrap">
              {request.description ||
                request.note ||
                "Không có mô tả chi tiết."}
            </div>
            <div className="text-xs text-base-content/60">
              Người đề xuất: {request.owner_name || "Khách"} · Lần yêu cầu:{" "}
              {request.round_no || 1}
            </div>
          </section>

          <section className="rounded-lg border bg-base-100 p-4">
            <h2 className="font-semibold mb-3">Thông tin đề xuất</h2>
            <DynamicForm
              entity="station_proposals"
              purpose="view"
              initialData={proposal}
              htmlId="proposal-request-update-form"
              hideActions
              skipValidationKeys={["chot_so_luong_tru"]}
              onSubmit={handleSave}
            />
            <div className="flex flex-wrap items-end justify-between gap-3 mt-4">
              {context.canComplete && (
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <label className="form-control w-full sm:w-80">
                    <span className="label-text text-xs mb-1">Kết quả xử lý</span>
                    <input
                      className="input input-bordered input-sm"
                      disabled={saving}
                      value={resolutionNote}
                      onChange={(event) => setResolutionNote(event.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    form="proposal-request-update-form"
                    className="btn btn-success gap-2"
                    disabled={saving || !resolutionNote.trim()}
                  >
                    <CheckCircle2 size={16} /> {saving ? 'Đang lưu và xác nhận...' : 'Xác nhận đã cập nhật'}
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default AdminProposalRequestUpdatePage;
