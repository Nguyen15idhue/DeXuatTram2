import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { chargingStationService } from "../../services/api";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import { Badge, Button, Dialog, FilterBar, Input, Pagination } from "../ui";
import ChargingStationTable from "./ChargingStationTable";
import ChargingStationFulfillment from "./ChargingStationFulfillment";
import {
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
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

const ChargingStationWorklist = ({ stage }) => {
  const { token } = useAuth();
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
  return (
    <div className="space-y-4">
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
          {
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
          },
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
        ]}
        actions={
          stage === "lap-tru"
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
      {stage === "lap-tru" && selected ? (
        <ChargingStationInstallationModal
          station={selected}
          onClose={() => setSelected(null)}
          onChanged={() => load(page)}
        />
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
