import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { chargingStationService } from "../../services/api";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import { Badge, Button, Dialog, FilterBar, Input, PageHeader, Pagination } from "../ui";
import ChargingStationTable from "./ChargingStationTable";
import ChargingStationFulfillment from "./ChargingStationFulfillment";
import ChargingStationGroupedProgress from "./ChargingStationGroupedProgress";
import ChargingStationOnModal from "./ChargingStationOnModal";
import { formatProposalScale } from "../../utils/proposalGrading";
import { acceptanceSummary, ACCEPTANCE_SUMMARY_LABELS, onStationStatus, INTEGRATION_LABELS } from "../../utils/chargingFulfillment";
import {
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  getStageConfig,
} from "../../utils/chargingStation";
import { CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT } from "../../utils/chargingStationTaskCounts";
import { CS_TASK_KEY } from "./ChargingStationNeedBadge";
import ChargingStationInstallationModal, {
  INSTALLATION_LABELS,
} from "./ChargingStationInstallationModal";

const TABS = [
  { key: "need", label: "Trạm sạc cần thực hiện" },
  { key: "completed", label: "Trạm sạc đã hoàn thành" },
  { key: "all", label: "Tất cả trạm sạc" },
];

const BulkAcceptanceAction = ({ token, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const loadPreview = async () => {
    if (running.current) return;
    running.current = true;
    setOpen(true);
    setBusy(true);
    setPreview(null);
    setReason("");
    setSubmitted(false);
    setResults(null);
    setError("");
    try {
      const response = await chargingStationService.previewBulkAcceptance(token);
      if (!response.success) throw new Error(response.message || "Không tải được bản xem trước");
      setPreview(response.data);
    } catch (failure) {
      setError(failure.message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const stations = preview?.stations || [];
  const pending = stations.filter(({ id }) => !results?.has(id) || results.get(id).retryable);
  const submit = async (event) => {
    event.preventDefault();
    if (running.current || !pending.length) return;
    const cleanReason = reason.trim();
    if (cleanReason.length < 3 || cleanReason.length > 5000) {
      setError("Lý do bắt buộc từ 3–5000 ký tự");
      return;
    }
    running.current = true;
    setSubmitted(true);
    setBusy(true);
    setError("");
    try {
      const batchSize = preview.batch_size || 20;
      for (let start = 0; start < pending.length; start += batchSize) {
        const response = await chargingStationService.executeBulkAcceptance({
          request_id: preview.request_id,
          reason: cleanReason,
          stations: pending.slice(start, start + batchSize).map(({ id, token: stationToken }) => ({ id, token: stationToken })),
        }, token);
        if (!response.success) throw new Error(response.message || "Không thể hoàn tất nghiệm thu");
        setResults(previous => {
          const merged = new Map(previous);
          for (const result of response.data.stations) merged.set(result.id, result);
          return merged;
        });
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      running.current = false;
      setBusy(false);
      onChanged();
    }
  };
  const close = () => { if (!running.current) setOpen(false); };
  const summary = results && [...results.values()].reduce((counts, item) => {
    counts[item.status]++;
    if (item.status === "updated") {
      counts.portions += item.portions;
      counts.quantity += item.quantity;
    }
    return counts;
  }, { updated: 0, skipped: 0, failed: 0, portions: 0, quantity: 0 });

  return (
    <>
      <Button onClick={loadPreview}>Nghiệm thu hàng loạt</Button>
      <Dialog isOpen={open} onClose={close} title="Nghiệm thu hàng loạt" size="lg" portal>
        <form onSubmit={submit} className="space-y-4">
          <p>Áp dụng cho mọi trang và không phụ thuộc tab hay bộ lọc đang chọn.</p>
          <p className="text-sm">Chỉ đánh dấu nghiệm thu đạt; giữ nguyên hồ sơ, lắp đặt và kết quả ON. Không tạo biên bản hay ảnh.</p>
          {!preview && busy && <p role="status">Đang tải bản xem trước…</p>}
          {preview && !stations.length && <p>Không có trạm đủ điều kiện nghiệm thu.</p>}
          {!!stations.length && (
            <>
              {summary ? <p role="status" className="font-semibold">
                Đã cập nhật: {summary.updated} trạm ({summary.portions} phần trụ / {summary.quantity} trụ) · Bỏ qua: {summary.skipped} · Lỗi: {summary.failed} · Chưa có kết quả: {stations.length - results.size}
              </p> : <p className="font-semibold">
                {stations.length} trạm · {stations.reduce((sum, row) => sum + row.portions, 0)} phần trụ · {stations.filter(row => row.legacy).length} trạm theo quy trình cũ
              </p>}
              <ul aria-label="Danh sách trạm nghiệm thu" className="max-h-48 overflow-auto rounded border border-base-300 p-2 text-sm">
                {stations.map(station => {
                  const result = results?.get(station.id);
                  return <li key={station.id} className="py-1">
                    <strong>{station.ma_tram || `#${station.id}`}</strong>
                    {" · "}{station.legacy ? "Quy trình cũ" : `${station.portions} phần trụ / ${station.quantity} trụ`}
                    {result && ` · ${result.status === "updated" ? "Đã cập nhật" : result.message}`}
                  </li>;
                })}
              </ul>
              <label className="form-control">
                <span className="label-text mb-1">Lý do nghiệm thu hàng loạt</span>
                <textarea className="textarea textarea-bordered" value={reason} maxLength={5000}
                  onChange={event => setReason(event.target.value)} disabled={submitted || busy} />
              </label>
            </>
          )}
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div className="modal-action">
            <Button type="button" variant="ghost" onClick={close} disabled={busy}>Đóng</Button>
            {!preview && error && <Button type="button" onClick={loadPreview}>Tải lại bản xem trước</Button>}
            {!!pending.length && <Button type="submit" disabled={busy}>
              {busy ? "Đang cập nhật…" : submitted ? "Thử lại" : "Xác nhận nghiệm thu đạt"}
            </Button>}
          </div>
        </form>
      </Dialog>
    </>
  );
};

const ChargingStationWorklist = ({ stage }) => {
  const { token, user } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((item) => item.key === params.get("tab"))
    ? params.get("tab")
    : "need";
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 400);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [counts, setCounts] = useState({});
  const [deliveryStation, setDeliveryStation] = useState(null);
  const [deliveryReason, setDeliveryReason] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const savingDelivery = useRef(false);
  const load = useCallback(
    async (targetPage = 1) => {
      setLoading(true);
      try {
        const response = await chargingStationService.getAll(
          new URLSearchParams({
            stage,
            tab,
            page: targetPage,
            limit: 20,
            search: query,
          }).toString(),
          token,
        );
        if (!response.success) throw new Error(response.message || "Không tải được danh sách ON trạm");
        setItems(response.data || []);
        setPagination(response.pagination || {});
        setError("");
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    },
    [stage, tab, query, token],
  );
  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      chargingStationService
        .getTaskCounts(token)
        .then((response) => {
          if (active) setCounts(response.data?.counts || response.data || {});
        })
        .catch(() => {});
    refresh();
    window.addEventListener(
      CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT,
      refresh,
    );
    return () => {
      active = false;
      window.removeEventListener(
        CHARGING_STATION_TASK_COUNTS_CHANGED_EVENT,
        refresh,
      );
    };
  }, [token]);
  const completeDelivery = async (event) => {
    event.preventDefault();
    if (savingDelivery.current) return;
    const reason = deliveryReason.trim();
    if (reason.length < 3 || reason.length > 5000) {
      setDeliveryError("Lý do bắt buộc từ 3–5000 ký tự");
      return;
    }
    savingDelivery.current = true;
    setDeliveryBusy(true);
    setDeliveryError("");
    try {
      const response = await chargingStationService.update(deliveryStation.id, {
        delivery_completed: true,
        expected_token: deliveryStation.edit_token,
        reason,
      }, token);
      if (!response.success) throw new Error(response.message || "Không đánh dấu hoàn thành Giao trụ được");
      setDeliveryStation(null);
      await load(page);
    } catch (failure) {
      setDeliveryError(failure.message);
      await load(page);
    } finally {
      savingDelivery.current = false;
      setDeliveryBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {stage === "nghiem-thu" && (
        <PageHeader title={getStageConfig(stage).title} subtitle="Quản lý ON trạm từ đề xuất đã ký"
          actions={user?.role === "SUPER_ADMIN" ? <BulkAcceptanceAction token={token} onChanged={() => load(page)} /> : undefined}
        />
      )}
      <div role="tablist" className="tabs tabs-boxed w-fit">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            className={`tab ${tab === item.key ? "tab-active" : ""}`}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("tab", item.key);
              setParams(next);
            }}
          >
            {item.label}
            {item.key === "need" &&
              Number(counts[CS_TASK_KEY[stage]] || 0) > 0 && (
                <span className="badge badge-sm badge-error ml-2">
                  {counts[CS_TASK_KEY[stage]]}
                </span>
              )}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      <FilterBar>
        <Input
          placeholder="Tìm mã trạm, mã đề xuất, chủ trạm, địa chỉ…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="!mb-0 flex-1"
        />
      </FilterBar>
      <ChargingStationTable
        loading={loading}
        data={items}
        startIndex={(page - 1) * 20}
        columns={[
          {
            key: "ma_tram",
            label: "Mã trạm",
            render: (value, row) => (
              <Link
                className="link link-primary underline text-left"
                to={`/admin/on-tram/${stage}/${row.id}`}
                state={{ returnTo: location.pathname + location.search }}
              >
                {value || `#${row.id}`}
              </Link>
            ),
          },
          { key: "owner_name", label: "Chủ trạm" },
          { key: "owner_phone", label: "SĐT" },
          {
            key: "address",
            label: "Địa chỉ",
            render: (value) => (
              <span className="block max-w-56 truncate" title={value}>
                {value || "—"}
              </span>
            ),
          },
          ...(!["nghiem-thu", "on-tram"].includes(stage) ? [{
            key: "status",
            label: "Trạng thái quy trình",
            render: (value, row) => (
              <div>
                <Badge size="sm" variant={CS_STATUS_VARIANT[value]}>
                  {CS_STATUS_LABELS[value] || value}
                </Badge>
                {row.workflow_override?.completed && (
                  <span className="block text-xs text-info">
                    Hoàn tất bằng ghi đè
                  </span>
                )}
              </div>
            ),
          },
          {
            key: "fulfillment",
            label: "Trụ đã ON / chốt",
            render: (value) =>
              value?.needs_review ? (
                <span
                  role="alert"
                  className="text-warning"
                  title={value.review_message}
                >
                  Cần đối soát trụ
                </span>
              ) : value?.totals ? (
                `${value.totals.operating || 0} / ${value.totals.committed || 0}`
              ) : (
                "—"
              ),
          }] : [
            ...(stage === "nghiem-thu" ? [{
              key: "chot_so_luong_tru", label: "Quy mô trụ chốt", width: 260,
              render: (_, row) => formatProposalScale(row)
            }] : []),
            {
              key: "workflow_summary",
              label: stage === "nghiem-thu" ? "Trạng thái nghiệm thu" : "Trạng thái ON trạm",
              width: 230,
              render: (_, row) => {
                const status = stage === "nghiem-thu" ? acceptanceSummary(row) : onStationStatus(row);
                if (stage === "on-tram") return <button type="button"
                  className={`badge cursor-pointer gap-1 ${status === "DONE" ? "badge-success" : status === "DOING" ? "badge-info" : "badge-ghost"}`}
                  onClick={() => setSelected(row)}>{INTEGRATION_LABELS[status]} <span aria-hidden>▾</span></button>;
                return <Badge variant={status === "DONE" ? "success" : status === "DOING" ? "info" : "ghost"}>
                  {(stage === "nghiem-thu" ? ACCEPTANCE_SUMMARY_LABELS : INTEGRATION_LABELS)[status]}
                </Badge>;
              }
            }
          ]),
          ...(stage === "lap-tru"
            ? [
                {
                  key: "installation_status",
                  label: "Trạng thái lắp trụ",
                  render: (value, row) => (
                    <button
                      type="button"
                      className={`badge cursor-pointer gap-1 ${value === "DONE" ? "badge-success" : value === "DOING" ? "badge-info" : "badge-ghost"}`}
                      onClick={() => setSelected(row)}
                    >
                      {INSTALLATION_LABELS[value] || INSTALLATION_LABELS.NOT}
                      <span aria-hidden>▾</span>
                    </button>
                  ),
                },
              ]
            : []),
          ...(stage === "giao-tru" ? [{
            key: "delivery_summary",
            label: "Trạng thái giao trụ",
            render: (_, row) => {
              const manual = row.workflow_override?.delivery_completed;
              const totals = row.fulfillment?.totals;
              const complete = (row.status === "OPERATING" && row.workflow_override?.completed)
                || (!row.fulfillment?.needs_review && Number(totals?.committed) > 0
                  && Number(totals?.received) >= Number(totals?.committed));
              const shipping = Number(totals?.exported) > Number(totals?.returned);
              return <div>
                <Badge variant={complete ? "success" : shipping ? "info" : "ghost"}>
                  {complete ? "Đã giao hàng thành công" : shipping ? "Đang giao" : "Chưa giao"}
                </Badge>
                {!!Number(row.early_delivery_requested) && <Badge variant="info" className="ml-1">Đi trụ sớm</Badge>}
                {manual && <span className="block text-xs text-info">
                  {complete ? "Xác nhận giao trực tiếp" : "Cần hoàn tất giao nhận"}
                </span>}
              </div>;
            },
          }] : []),
        ]}
        actions={
          ["lap-tru", "on-tram"].includes(stage)
            ? undefined
            : (row) => (
                <div className="flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setSelected(row)}
                  >
                    Cập nhật trạng thái
                  </Button>
                  {stage === "giao-tru" && user?.role === "SUPER_ADMIN"
                    && row.status !== "CANCELLED" && !row.workflow_override?.completed && (
                      <Button size="xs" variant="outline" onClick={() => {
                        setDeliveryStation(row);
                        setDeliveryReason("");
                        setDeliveryError("");
                      }}>
                        Đổi trạng thái
                      </Button>
                    )}
                </div>
              )
        }
      />
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.totalPages || 1}
        total={pagination.total || 0}
        onPageChange={(next) => {
          setPage(next);
          load(next);
        }}
      />
      <Dialog isOpen={!!deliveryStation} title="Đổi trạng thái Giao trụ" portal
        onClose={() => !deliveryBusy && setDeliveryStation(null)}>
        <form className="space-y-4" onSubmit={completeDelivery}>
          <p>Trạm: <strong>{deliveryStation?.ma_tram || `#${deliveryStation?.id}`}</strong></p>
          <p>Trạng thái mới: <strong>Đã giao hàng thành công</strong></p>
          <div className="alert alert-info text-sm">
            Xác nhận đã nhận đủ trụ, tạo phiếu xuất nội bộ cho phần còn thiếu và chuyển sang việc Lắp trụ.
            Không thay đổi tồn kho, không cần upload file hoặc tạo hóa đơn tài chính.
          </div>
          <label className="block text-sm">
            Lý do *
            <textarea aria-label="Lý do hoàn thành Giao trụ" className="textarea textarea-bordered mt-1 w-full"
              required minLength={3} maxLength={5000} disabled={deliveryBusy}
              value={deliveryReason} onChange={(event) => setDeliveryReason(event.target.value)} />
          </label>
          {deliveryError && <div role="alert" className="alert alert-error">{deliveryError}</div>}
          {deliveryStation && !deliveryStation.edit_token && <div role="alert" className="alert alert-error">
            Thiếu phiên bản dữ liệu; hãy tải lại trang trước khi lưu.
          </div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={deliveryBusy} onClick={() => setDeliveryStation(null)}>Hủy</Button>
            <Button type="submit" loading={deliveryBusy} disabled={deliveryBusy || !deliveryStation?.edit_token}>Xác nhận</Button>
          </div>
        </form>
      </Dialog>
      {stage === "lap-tru" && selected ? (
        <ChargingStationInstallationModal
          station={selected}
          onClose={() => setSelected(null)}
          onChanged={() => load(page)}
        />
      ) : stage === "on-tram" && selected ? (
        <ChargingStationOnModal station={selected} onClose={() => setSelected(null)} onChanged={() => load(page)} />
      ) : selected && stage === "nghiem-thu" ? (
        <ChargingStationGroupedProgress station={selected} stage={stage}
          onClose={() => setSelected(null)} onChanged={() => load(page)} />
      ) : (
        <Dialog
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          title={`Triển khai · ${selected?.ma_tram || ""}`}
          size="full"
        >
          {selected && (
            <ChargingStationFulfillment
              station={selected}
              stage={stage}
              onChanged={() => load(page)}
            />
          )}
        </Dialog>
      )}
    </div>
  );
};

export default ChargingStationWorklist;
