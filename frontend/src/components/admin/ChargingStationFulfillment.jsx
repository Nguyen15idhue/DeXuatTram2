import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  chargingStationService,
  shippingCarrierService,
} from "../../services/api";
import { Badge, Button, Dialog, Input, Select } from "../ui";
import ChargingStationInstallationModal from "./ChargingStationInstallationModal";
import ChargingStationAcceptanceModal from "./ChargingStationAcceptanceModal";
import ChargingStationOnModal from "./ChargingStationOnModal";
import ChargingStationAcceptanceFields from "./ChargingStationAcceptanceFields";
import ChargingStationTable from "./ChargingStationTable";
import ChargingStationShipmentHistory from "./ChargingStationShipmentHistory";
import ChargingStationStepHistory from "./ChargingStationStepHistory";
import FileViewer from "../dynamic/FileViewer";
import { formatCsDate } from "../../utils/chargingStation";
import {
  canOperateStation,
  deploymentActions,
  DEPLOYMENT_ACTION_LABELS,
  requestKeyForIntent,
  ACCEPTANCE_LABELS,
  portionUnavailable,
  onDeploymentQuantity,
} from "../../utils/chargingFulfillment";

const ChargingStationFulfillment = ({ station, stage, onChanged }) => {
  const { token, user } = useAuth();
  const [record, setRecord] = useState(station);
  const [fulfillment, setFulfillment] = useState(station.fulfillment || {});
  const [portions, setPortions] = useState(station.deployments || []);
  const [carriers, setCarriers] = useState([]);
  const [installationOpen, setInstallationOpen] = useState(false);
  const [acceptancePortion, setAcceptancePortion] = useState(null);
  const [onOpen, setOnOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [intent, setIntent] = useState(null);
  const [form, setForm] = useState({});
  const [quantities, setQuantities] = useState({});
  const [viewingFile, setViewingFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const request = useRef(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, summary, deployments] = await Promise.all([
        chargingStationService.getDetail(station.id, token),
        chargingStationService.getFulfillment(station.id, token),
        chargingStationService.getDeployments(station.id, token),
      ]);
      if (!detail.success || !summary.success || !deployments.success) {
        throw new Error(
          detail.message ||
            summary.message ||
            deployments.message ||
            "Không tải được tiến độ các phần trụ",
        );
      }
      setRecord(detail.data);
      if (canOperateStation(user, detail.data, "back_office")) {
        const response = await shippingCarrierService.list(token, true);
        if (!response.success)
          throw new Error(
            response.message || "Không tải được đơn vị vận chuyển",
          );
        setCarriers(response.data || []);
      }
      const currentPortions = Array.isArray(deployments.data)
        ? deployments.data
        : deployments.data?.items || [];
      setFulfillment({
        ...summary.data,
        items: (summary.data?.items || []).map((item) => ({
          ...item,
          id: item.id || item.commitment_id,
          supplier: item.supplier || item.supplier_name,
        })),
      });
      setPortions(currentPortions);
      setLoadError(false);
      setError("");
    } catch (loadFailure) {
      setError(loadFailure.message);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [station.id, token, user]);
  useEffect(() => {
    load();
  }, [load]);
  const canShip = canOperateStation(user, record, "back_office");
  const canSetup =
    canOperateStation(user, record, "setup") &&
    (!record.workflow_override?.completed || user?.role === "SUPER_ADMIN") &&
    record.status !== "CANCELLED";
  const showShipping = !stage || stage === "giao-tru";
  const showPortions = !stage || stage !== "giao-tru";
  const shippingOptions = fulfillment.shipping_options || [];
  const shippingDisabled =
    loading || loadError || !shippingOptions.length || fulfillment.needs_review;
  const shippingDisabledReason = loading
    ? "Đang tải dữ liệu"
    : loadError
      ? "Không tải được dữ liệu"
      : fulfillment.needs_review
        ? "Dữ liệu trụ cần đối soát"
        : !Number(fulfillment.totals?.remaining)
          ? "Đã xuất đủ số lượng trụ chốt"
          : !shippingOptions.length
            ? "Không có tồn kho cho loại trụ còn thiếu"
            : "";
  const begin = (action, target) => {
    if (loading || loadError) return;
    if (action === "export" && shippingDisabled) return;
    if (action === "acceptance-passed") {
      setAcceptancePortion(target.id);
      return;
    }
    if (action === "complete-configuration") {
      setOnOpen(true);
      return;
    }
    setIntent({ action, target });
    request.current = null;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setForm({
      carrier_id: "",
      export_date: today,
      suppliers: {},
      transport_code: "",
      total_amount: "",
      transport_status: "SHIPPING",
      reason: "",
    });
    const rows =
      action === "export"
        ? (fulfillment.pole_requirements || []).map((row) => ({
            ...row,
            id: row.pole_id,
          }))
        : [];
    setQuantities(
      Object.fromEntries(
        rows.map((row) => [
          row.id,
          0,
        ]),
      ),
    );
    setError("");
  };
  const setField = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      let response;
      const { action, target } = intent;
      request.current = requestKeyForIntent(request.current, {
        action,
        target: target?.id,
        form,
        quantities,
      });
      const { request_id } = request.current;
      if (
        ["fail", "request-return", "acceptance-failed", "acceptance-reset"].includes(
          action,
        ) &&
        !form.reason.trim()
      ) {
        throw new Error("Vui lòng nhập lý do");
      }
      if (action === "export") {
        const items = (fulfillment.pole_requirements || [])
          .filter((row) => Number(quantities[row.pole_id]) > 0)
          .map((pole) => {
            const row = shippingOptions.find(
              (option) =>
                Number(option.pole_id) === Number(pole.pole_id) &&
                Number(option.supplier_id) ===
                  Number(form.suppliers[pole.pole_id]),
            );
            if (!row) throw new Error(`Chọn nhà cung cấp cho ${pole.name}`);
            const quantity = Number(quantities[pole.pole_id]);
            if (
              !Number.isSafeInteger(quantity) ||
              quantity > row.stock_quantity
            )
              throw new Error(
                "Số lượng xuất vượt tồn kho hoặc không phải số nguyên",
              );
            if (quantity > pole.remaining_quantity)
              throw new Error(
                `Tổng xuất ${pole.name} vượt số lượng còn phải giao`,
              );
            return {
              pole_id: Number(row.pole_id),
              supplier_id: Number(row.supplier_id),
              quantity,
            };
          });
        if (
          Object.values(quantities).some(
            (value) =>
              !Number.isSafeInteger(Number(value)) || Number(value) < 0,
          )
        )
          throw new Error("Số lượng phải là số nguyên không âm");
        if (!items.length)
          throw new Error("Vui lòng chọn ít nhất một trụ để xuất");
        if (!form.carrier_id || !form.export_date)
          throw new Error("Chọn đơn vị vận chuyển và ngày xuất kho");
        response = await chargingStationService.createShipment(
          record.id,
          {
            ...form,
            items,
            total_amount: Number(form.total_amount),
            request_id,
          },
          token,
        );
      } else {
        response = await chargingStationService.deploymentAction(
          record.id,
          target.id,
          {
            action,
            request_id,
            reason: form.reason,
            expected_version: target.workflow_version,
          },
          token,
        );
      }
      if (response?.success === false)
        throw new Error(response.message || "Thao tác thất bại");
      setIntent(null);
      await load();
      onChanged?.();
    } catch (actionError) {
      setError(actionError.message || "Thao tác thất bại");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const title =
    intent?.action === "export"
      ? "Tạo phiếu xuất kho"
      : DEPLOYMENT_ACTION_LABELS[intent?.action];
  return (
    <div className="space-y-4 text-sm">
      {error && (
        <div role="alert" className="alert alert-error text-sm">
          {error}
        </div>
      )}
      {loadError && (
        <Button size="sm" variant="outline" onClick={load}>
          Tải lại dữ liệu trước khi thao tác
        </Button>
      )}
      {loading && <span className="loading loading-spinner loading-sm" />}
      {record.workflow_override?.completed && (
        <div className="alert alert-info">
          Hoàn tất quy trình bằng ghi đè của SUPER_ADMIN. Số liệu giao/nhận và
          tồn kho bên dưới là số liệu thực tế, không được tự hoàn tất.
        </div>
      )}
      {showShipping && record.workflow_override?.delivery_completed && (
        <div className="alert alert-info">
          SUPER_ADMIN xác nhận giao trực tiếp bằng phiếu xuất nội bộ, không thay đổi tồn kho.
          Tiến độ Giao trụ và Lắp trụ được tính theo số lượng giao/nhận thực tế bên dưới.
        </div>
      )}
      {fulfillment.needs_review && (
        <div className="alert alert-warning">
          Dữ liệu trụ cần đối soát.{" "}
          {fulfillment.review_message ||
            "Cần kiểm tra bảng trụ chốt và các phiếu giao cũ."}{" "}
          Ghi đè ON không thay đổi số liệu kho.
        </div>
      )}
      {showShipping && (
        <>
          <h3 className="font-semibold">Chốt trụ và tồn kho</h3>
          <ChargingStationTable
            frozenColumns={0}
            emptyMessage="Không có dữ liệu"
            data={fulfillment.pole_requirements || []}
            columns={[
              {
                key: "name",
                label: "Loại trụ",
                render: (value, row) => value || row.pole_name || `#${row.id}`,
              },
              { key: "committed_quantity", label: "Số lượng chốt" },
              { key: "delivery_status", label: "Trạng thái giao", render: (_, row) =>
                Number(row.received_quantity) >= Number(row.committed_quantity) ? "Đã giao"
                  : Number(row.exported_quantity) > Number(row.returned_quantity) ? "Đang giao" : "Chưa giao" },
            ]}
          />
          <div className="flex gap-2">
            {canShip && (
              <Button
                size="sm"
                disabled={shippingDisabled}
                title={shippingDisabledReason}
                onClick={() => begin("export")}
              >
                Xuất trụ theo số lượng
              </Button>
            )}
            {!canShip && (
              <span className="text-base-content/50">Chỉ xem</span>
            )}
          </div>
          {shippingDisabledReason && (
            <p className="text-base-content/60">{shippingDisabledReason}</p>
          )}
          <h3 className="font-semibold">Lịch sử các chuyến giao</h3>
          <ChargingStationShipmentHistory station={record} shipments={fulfillment.shipments}
            canEdit={canShip && record.status !== "CANCELLED" && !loading && !loadError}
            onChanged={async () => { await load(); onChanged?.(); }} />
        </>
      )}
      {showPortions && (
        <>
          {canOperateStation(user, record, "setup") && (
            <div className="flex flex-wrap gap-2">
              {(!stage || stage === "on-tram") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOnOpen(true)}
                >
                  Cập nhật ON trạm
                </Button>
              )}
            </div>
          )}
          <h3 className="font-semibold">Các phần trụ triển khai</h3>
          {!portions.length && !loading && (
            <p className="text-base-content/50">
              Chưa có phần trụ đã nhận để triển khai.
            </p>
          )}
          {portions.map((portion) => (
            <details
              key={portion.id}
              className="rounded-lg border border-base-300 p-3"
              open
            >
              <summary className="cursor-pointer font-semibold">
                {portion.pole_name} · {portion.supplier_name || "—"} ·{" "}
                {portion.quantity} trụ
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    portion.acceptance_status === "PASSED"
                      ? "success"
                      : portion.acceptance_status === "FAILED"
                        ? "error"
                        : "ghost"
                  }
                >
                  {ACCEPTANCE_LABELS[portion.acceptance_status] ||
                    "Chưa nghiệm thu"}
                </Badge>
                <Badge
                  variant={onDeploymentQuantity(portion) === Number(portion.quantity) ? "success"
                    : onDeploymentQuantity(portion) > 0 ? "info" : "ghost"}
                >
                  ON: {onDeploymentQuantity(portion)} / {portion.quantity}
                </Badge>
                <span>Ngày ON: {formatCsDate(portion.on_date)}</span>
                {portion.on_note && (
                  <p className="whitespace-pre-wrap">
                    Ghi chú ON: {portion.on_note}
                  </p>
                )}
                {portion.acceptance_file_id && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setViewingFile({
                        id: portion.acceptance_file_id,
                        original_name:
                          portion.acceptance_file_name || "Biên bản.pdf",
                        mime_type:
                          portion.acceptance_file_mime || "application/pdf",
                      })
                    }
                  >
                    Biên bản nghiệm thu cũ
                  </Button>
                )}
                {canSetup && !portionUnavailable(portion) &&
                  deploymentActions(portion)
                    .filter((action) => !action.includes("installation"))
                    .filter(
                      (action) =>
                        !stage ||
                        (stage === "lap-tru" &&
                          action.includes("installation")) ||
                        (stage === "nghiem-thu" &&
                          action.includes("acceptance")) ||
                        (stage === "on-tram" &&
                          action === "complete-configuration"),
                    )
                    .map((action) => (
                      <Button
                        key={action}
                        size="xs"
                        variant={
                          action.endsWith("failed")
                            ? "outline-error"
                            : "primary"
                        }
                        onClick={() => begin(action, portion)}
                      >
                        {DEPLOYMENT_ACTION_LABELS[action]}
                      </Button>
                    ))}
                {!canSetup && (
                  <span className="text-base-content/50">Chỉ xem</span>
                )}
              </div>
              {Boolean(portion.acceptance_legacy) && (
                <p className="mt-2 text-sm text-warning">
                  Nghiệm thu legacy — giữ kết quả và tài liệu cũ, chưa có bộ hồ
                  sơ mới.
                </p>
              )}
              {Object.keys(portion.acceptance_reports || {}).length > 0 && (
                <div className="mt-3">
                  <ChargingStationAcceptanceFields
                    value={portion.acceptance_reports}
                    readOnly
                  />
                </div>
              )}
            </details>
          ))}
        </>
      )}
      <Dialog
        isOpen={!!intent}
        title={title || ""}
        onClose={() => !busy && setIntent(null)}
        size="2xl"
        portal
      >
        {intent && (
          <form onSubmit={submit} className="space-y-3">
            {intent.action === "export" && (
              <>
                {(fulfillment.pole_requirements || [])
                  .filter((pole) => pole.remaining_quantity > 0)
                  .map((pole) => {
                    const options = shippingOptions.filter(
                      (row) => Number(row.pole_id) === Number(pole.pole_id),
                    );
                    return (
                      <section
                        key={pole.pole_id}
                        className="rounded-lg border border-base-300 p-3 space-y-2"
                      >
                        <h3 className="font-semibold">
                          {pole.name} · Còn phải giao: {pole.remaining_quantity}
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            label="Số lượng"
                            type="number"
                            min="0"
                            step="1"
                            value={quantities[pole.pole_id] ?? 0}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [pole.pole_id]: event.target.value,
                              }))
                            }
                          />
                          <Select
                            label="Nhà cung cấp"
                            value={form.suppliers[pole.pole_id] || ""}
                            placeholder="Chọn nhà cung cấp"
                            options={options.map((row) => ({
                              value: String(row.supplier_id),
                              label: `${row.supplier_name} · tồn ${row.stock_quantity}`,
                            }))}
                            onChange={(event) =>
                              setField("suppliers", {
                                ...form.suppliers,
                                [pole.pole_id]: event.target.value,
                              })
                            }
                          />
                        </div>
                      </section>
                    );
                  })}
                <Select
                  label="Đơn vị vận chuyển"
                  value={form.carrier_id}
                  placeholder="Chọn đơn vị vận chuyển"
                  options={carriers.map((carrier) => ({
                    value: String(carrier.id),
                    label: carrier.name,
                  }))}
                  onChange={(event) =>
                    setField("carrier_id", event.target.value)
                  }
                />
                {!carriers.length && (
                  <p className="text-warning">
                    Chưa có đơn vị vận chuyển hoạt động. Liên hệ SUPER_ADMIN để
                    thêm tại Quản lý kho.
                  </p>
                )}
                <Input
                  label="Mã vận đơn"
                  value={form.transport_code}
                  onChange={(event) =>
                    setField("transport_code", event.target.value)
                  }
                />
                <Input
                  label="Tổng tiền"
                  min="0"
                  type="number"
                  value={form.total_amount}
                  onChange={(event) =>
                    setField("total_amount", event.target.value)
                  }
                />
                <Input
                  label="Ngày xuất kho"
                  required
                  type="date"
                  value={form.export_date}
                  onChange={(event) =>
                    setField("export_date", event.target.value)
                  }
                />
              </>
            )}
            <Input
              label="Lý do / ghi chú"
              value={form.reason}
              onChange={(event) => setField("reason", event.target.value)}
            />
            {error && (
              <div role="alert" className="text-error">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setIntent(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Đang lưu…" : "Xác nhận"}
              </Button>
            </div>
          </form>
        )}
        {intent && <ChargingStationStepHistory stationId={record.id} step="giao-tru" refreshKey={record.updated_at} />}
      </Dialog>
      {viewingFile && (
        <FileViewer
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          token={token}
        />
      )}
      {installationOpen && (
        <ChargingStationInstallationModal
          station={record}
          onClose={() => setInstallationOpen(false)}
          onChanged={async () => {
            await load();
            await onChanged?.();
          }}
        />
      )}
      {acceptancePortion && (
        <ChargingStationAcceptanceModal
          station={record}
          portionId={acceptancePortion}
          initialStatus="PASSED"
          onClose={() => setAcceptancePortion(null)}
          onChanged={async () => {
            await load();
            await onChanged?.();
          }}
        />
      )}
      {onOpen && (
        <ChargingStationOnModal
          station={record}
          onClose={() => setOnOpen(false)}
          onChanged={async () => {
            await load();
            await onChanged?.();
          }}
        />
      )}
    </div>
  );
};

export default ChargingStationFulfillment;
