import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { getMarkerColor } from "../utils/mapHelpers";
import { getMarkerIcon, getMarkerIconBg } from "../utils/mapMarkerIcons";
import useMarkerIcons from "../hooks/useMarkerIcons";
import useMapStatuses from "../hooks/useMapStatuses";
import { MapBadge } from "./MarkerIcon";
import { PRIORITY_OPTIONS } from "../utils/mapStatuses";

const DEFAULT_STATION_STATUSES = ["ACTIVE", "DEPLOYING"];

const DEFAULT_PROPOSAL_STATUSES = [
  "PENDING",
  "REVIEWING",
  "APPROVED",
];

export const EMPTY_MAP_FILTERS = {
  scope: "all",
  stationStatuses: [...DEFAULT_STATION_STATUSES],
  planningPriorities: [],
  proposalStatuses: [...DEFAULT_PROPOSAL_STATUSES],
  hideStations: false,
  hideStationPlans: true,
  hideProposals: false,
  hideEvReports: true,
};

const STATUS_TO_HIDDEN_MAP = {
  stationStatuses: "hideStations",
  proposalStatuses: "hideProposals",
  planningPriorities: "hideStationPlans",
};

const toggleValue = (list, value) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const MapFilterPanel = ({ filters, onChange, isMobile = false }) => {
  const [open, setOpen] = useState(false);

  const markerIconsVersion = useMarkerIcons();
  void markerIconsVersion;

  const {
    stationStatuses: STATION_STATUSES,
    proposalStatuses: PROPOSAL_STATUSES,
  } = useMapStatuses();

  const set = (patch) => onChange({ ...filters, ...patch });

  // Đồng bộ danh sách chip và checkbox trong cùng một lần cập nhật.
  const toggleStatus = (key, value) => {
    const list = filters[key] || [];
    const nextList = toggleValue(list, value);
    const hiddenKey = STATUS_TO_HIDDEN_MAP[key];

    set({
      [key]: nextList,
      [hiddenKey]: nextList.length === 0,
    });
  };

  // Bật checkbox: khôi phục trạng thái mặc định.
  // Tắt checkbox: xóa toàn bộ trạng thái được chọn.
  const toggleStatusGroup = (key, checked) => {
    const defaults = {
      stationStatuses: DEFAULT_STATION_STATUSES,
      proposalStatuses: DEFAULT_PROPOSAL_STATUSES,
    };

    const hiddenKey = STATUS_TO_HIDDEN_MAP[key];

    set({
      [key]: checked ? [...defaults[key]] : [],
      [hiddenKey]: !checked,
    });
  };

  const activeCount = [
    filters.scope === "mine" ? 1 : 0,
    filters.stationStatuses.length ? 1 : 0,
    filters.planningPriorities.length ? 1 : 0,
    filters.proposalStatuses.length ? 1 : 0,
    filters.hideStations || filters.hideStationPlans || filters.hideProposals
      ? 1
      : 0,
  ].reduce((a, b) => a + b, 0);

  const renderStatusChips = (options, key, entity) => (
    <div className="map-filter-chips">
      {options.map((s) => {
        const list = filters[key] || [];
        const hiddenKey = STATUS_TO_HIDDEN_MAP[key];
        const active = list.includes(s.value) && !filters[hiddenKey];

        return (
          <button
            key={s.value}
            type="button"
            className={`map-filter-chip ${active ? "active" : ""}`}
            onClick={() => toggleStatus(key, s.value)}
          >
            <MapBadge
              type="filter"
              icon={getMarkerIcon(s.value, entity)}
              color={getMarkerColor(s.value, entity)}
              bg={getMarkerIconBg(s.value, entity)}
              size={11}
            />

            {s.label}

            {s.show_in_legend === false && (
              <span
                className="map-filter-offmap"
                title="Trạng thái này không hiện marker trên bản đồ"
              >
                không hiện bản đồ
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderPriorityChips = () => (
    <div className="map-filter-chips">
      {PRIORITY_OPTIONS.map((s) => {
        const list = filters.planningPriorities || [];
        const active = list.includes(s.value) && !filters.hideStationPlans;

        return (
          <button
            key={s.value}
            type="button"
            className={`map-filter-chip ${active ? "active" : ""}`}
            onClick={() => {
              const nextList = toggleValue(list, s.value);

              set({
                planningPriorities: nextList,
                hideStationPlans: nextList.length === 0,
              });
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );

  const body = (
    <div className="map-filter-body">
      <div className="map-filter-group">
        <span className="map-filter-label">Phạm vi đề xuất</span>

        <div className="map-filter-seg">
          <button
            type="button"
            className={filters.scope !== "mine" ? "active" : ""}
            onClick={() => set({ scope: "all" })}
          >
            Tất cả
          </button>

          <button
            type="button"
            className={filters.scope === "mine" ? "active" : ""}
            onClick={() => set({ scope: "mine" })}
          >
            Của tôi
          </button>
        </div>
      </div>

      <div className="map-filter-group">
        <span className="map-filter-label">Hiển thị</span>

        <div className="map-filter-checks">
          <label className="map-filter-check">
            <input
              type="checkbox"
              checked={!filters.hideStations}
              onChange={(e) =>
                toggleStatusGroup("stationStatuses", e.target.checked)
              }
            />
            Trạm
          </label>

          <label className="map-filter-check">
            <input
              type="checkbox"
              checked={!filters.hideStationPlans}
              onChange={(e) => {
                const checked = e.target.checked;

                set({
                  hideStationPlans: !checked,
                  planningPriorities: checked
                    ? [...(filters.planningPriorities || [])]
                    : [],
                });
              }}
            />
            Quy hoạch
          </label>

          <label className="map-filter-check">
            <input
              type="checkbox"
              checked={!filters.hideProposals}
              onChange={(e) =>
                toggleStatusGroup("proposalStatuses", e.target.checked)
              }
            />
            Đề xuất
          </label>
        </div>
        <div className="map-filter-checks">
          <label className="map-filter-check">
            <input
              type="checkbox"
              checked={!filters.hideEvReports}
              onChange={(e) => set({ hideEvReports: !e.target.checked })}
            />
            Nhu cầu sạc xe
          </label>
        </div>
      </div>

      <div className="map-filter-group">
        <span className="map-filter-label">Trạng thái trạm</span>

        {renderStatusChips(
          STATION_STATUSES.filter((s) => s.value !== "PLANNING"),
          "stationStatuses",
          "station",
        )}
      </div>

      <div className="map-filter-group">
        <span className="map-filter-label">Trạng thái quy hoạch</span>

        {renderPriorityChips()}
      </div>

      <div className="map-filter-group">
        <span className="map-filter-label">Trạng thái đề xuất</span>

        {renderStatusChips(
          PROPOSAL_STATUSES.filter(
            (s) => s.show_in_legend !== false && s.show_in_legend !== 0,
          ),
          "proposalStatuses",
          "proposal",
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-xs w-full"
        onClick={() => onChange({ ...EMPTY_MAP_FILTERS })}
      >
        Đặt lại bộ lọc
      </button>
    </div>
  );

  return (
    <div className={`map-filter ${isMobile ? "map-filter-mobile" : ""}`}>
      <button
        type="button"
        className={`map-control-btn map-filter-toggle ${
          open ? "map-control-btn-active" : ""
        }`}
        onClick={() => setOpen((v) => !v)}
        title="Bộ lọc bản đồ"
      >
        <SlidersHorizontal size={16} />

        {activeCount > 0 && (
          <span className="map-filter-count">{activeCount}</span>
        )}
      </button>

      {open &&
        (isMobile ? (
          <div
            className="map-filter-sheet-backdrop"
            onClick={() => setOpen(false)}
          >
            <div
              className="map-filter-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="map-filter-sheet-handle" />

              <div className="map-filter-head">
                <span>Bộ lọc bản đồ</span>

                <button
                  type="button"
                  className="map-filter-close"
                  onClick={() => setOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>

              {body}
            </div>
          </div>
        ) : (
          <div className="map-filter-card">
            <div className="map-filter-head">
              <span>Bộ lọc bản đồ</span>

              <button
                type="button"
                className="map-filter-close"
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            {body}
          </div>
        ))}
    </div>
  );
};

export default MapFilterPanel;
