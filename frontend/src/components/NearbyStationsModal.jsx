import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPinned, LayoutGrid } from "lucide-react";
import { stationService } from "../services/api";
import { getMarkerColor } from "../utils/mapHelpers";
import { getMarkerIcon, getMarkerIconBg } from "../utils/mapMarkerIcons";
import { getStatusLabel } from "../utils/mapStatuses";
import { haversineM } from "../utils/formatDistance";
import { MapBadge } from "./MarkerIcon";
import useMapStatuses from "../hooks/useMapStatuses";
import useMapConfig from "../hooks/useMapConfig";
import MapCanvas from "./map/MapCanvas";

export const NEARBY_STATION_STATUSES = ["ACTIVE", "DEPLOYING"];
export const NEARBY_RADIUS_KM = 50;

const MO_HINH_LABELS = {
  TDT: "Tự đầu tư",
  LK: "Liên kết",
  NQ: "Nhượng quyền",
  NQ_LK: "Nhượng quyền + Liên kết",
};

const zoomForRadius = (radius) => {
  if (radius <= 5) return 12;
  if (radius <= 10) return 11;
  if (radius <= 20) return 10;
  if (radius <= 50) return 9;
  return 8;
};

function summarizeTru(station) {
  if (station.so_luong_tru && station.loai_tru_sac)
    return `${station.so_luong_tru}× ${station.loai_tru_sac}`;
  if (station.so_luong_tru) return `${station.so_luong_tru} trụ`;
  return station.loai_tru_sac || "";
}

function createStationPopup(station) {
  const div = document.createElement("div");
  div.className = "popup-content";
  const h3 = document.createElement("h3");
  h3.textContent =
    station.name ||
    station.ma_tram ||
    station.ma_tram_gen ||
    `Trạm #${station.id}`;
  div.appendChild(h3);
  const addRow = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === "")
      return;
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(String(value)));
    div.appendChild(p);
  };
  const statusP = document.createElement("p");
  const statusStrong = document.createElement("strong");
  statusStrong.textContent = "Trạng thái: ";
  const statusSpan = document.createElement("span");
  statusSpan.style.color = getMarkerColor(station.status, "station");
  statusSpan.textContent = getStatusLabel(station.status, "station");
  statusP.appendChild(statusStrong);
  statusP.appendChild(statusSpan);
  div.appendChild(statusP);
  addRow("Khoảng cách", `${Number(station._distanceKm || 0).toFixed(2)} km`);
  addRow("Địa chỉ", station.address);
  addRow(
    "Mô hình",
    MO_HINH_LABELS[station.mo_hinh_tram] || station.mo_hinh_tram,
  );
  addRow("Trụ", summarizeTru(station));
  addRow("Công suất", station.power_capacity);
  return div;
}

const NearbyStationsModal = ({
  open,
  lat,
  lng,
  radiusKm = NEARBY_RADIUS_KM,
  statuses = NEARBY_STATION_STATUSES,
  title = "Trạm sạc lân cận",
  onClose,
}) => {
  const { stationStatuses } = useMapStatuses();
  const mapConfig = useMapConfig();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showLegend, setShowLegend] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : true,
  );
  const position = useMemo(
    () => [parseFloat(lat), parseFloat(lng)],
    [lat, lng],
  );
  const valid =
    open && Number.isFinite(position[0]) && Number.isFinite(position[1]);

  useEffect(() => {
    if (!valid) return undefined;
    let cancelled = false;
    setLoading(true);
    stationService
      .getAll()
      .then((res) => {
        if (!cancelled) setStations(res && res.success ? res.data || [] : []);
      })
      .catch(() => {
        if (!cancelled) setStations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [valid]);

  const statusSet = useMemo(() => new Set(statuses), [statuses]);
  const legendItems = useMemo(
    () => stationStatuses.filter((s) => statusSet.has(s.value)),
    [stationStatuses, statusSet],
  );

  const nearby = useMemo(() => {
    const [clat, clng] = position;
    return stations
      .filter((s) => statusSet.has(s.status))
      .map((s) => ({
        ...s,
        _distanceKm: haversineM(clat, clng, s.latitude, s.longitude) / 1000,
      }))
      .filter(
        (s) => Number.isFinite(s._distanceKm) && s._distanceKm <= radiusKm,
      )
      .sort((a, b) => a._distanceKm - b._distanceKm);
  }, [stations, position, radiusKm, statusSet]);

  const canvasStations = useMemo(
    () =>
      nearby.map((s) => ({
        ...s,
        _color: getMarkerColor(s.status, "station"),
        _icon: getMarkerIcon(s.status, "station"),
        _bg: getMarkerIconBg(s.status, "station"),
      })),
    [nearby],
  );
  const circle = useMemo(
    () => ({ center: position, radiusM: radiusKm * 1000 }),
    [position, radiusKm],
  );
  const fitView = useMemo(
    () => ({ center: position, zoom: zoomForRadius(radiusKm) }),
    [position, radiusKm],
  );

  if (!valid) return null;

  return createPortal(
    <div
      className="modal-overlay location-map-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="legacy-modal location-map-modal location-map-fullscreen"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="popup-header">
          <h2 className="flex items-center gap-2">
            <MapPinned size={18} className="text-primary" />
            {title}
          </h2>
          <button
            className="btn-close"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#6b7280",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        <div className="location-map-toolbar">
          <span className="text-xs font-medium text-base-content/70">
            Bán kính {radiusKm} km
          </span>
          <span className="ml-auto text-xs text-base-content/50">
            {loading ? "Đang tải trạm sạc..." : `${nearby.length} trạm lân cận`}
          </span>
        </div>

        <div className="location-map-body">
          <MapCanvas
            renderer={mapConfig.renderer}
            center={position}
            zoom={zoomForRadius(radiusKm)}
            tile={{
              url: mapConfig.tileUrl,
              attribution: mapConfig.attribution,
              subdomains: mapConfig.subdomains,
            }}
            vectorStyle={mapConfig.vectorStyle}
            apiKey={mapConfig.apiKey}
            stations={canvasStations}
            showCluster={false}
            showStationLabels
            showProvinceLabels={false}
            showBoundaries={false}
            provincePoints={[]}
            selectedPosition={position}
            locationPoint
            circle={circle}
            fitView={fitView}
            renderStationPopup={createStationPopup}
          />
          <div className="location-map-controls">
            <button
              type="button"
              className={`map-control-btn ${showLegend ? "map-control-btn-active" : ""}`}
              title="Chú thích"
              onClick={() => setShowLegend((v) => !v)}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
          {showLegend && (
            <div className="map-legend">
              <div className="map-legend-title">Chú thích</div>
              <div className="map-legend-columns">
                <div className="map-legend-col">
                  <div className="map-legend-col-title">Trạm</div>
                  {legendItems.map((item) => (
                    <div key={`s-${item.value}`} className="map-legend-item">
                      <MapBadge
                        icon={getMarkerIcon(item.value, "station")}
                        color={getMarkerColor(item.value, "station")}
                        bg={getMarkerIconBg(item.value, "station")}
                      />
                      <span className="map-legend-label">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {!loading && nearby.length === 0 && (
            <div className="location-map-note">
              Không có trạm sạc nào trong bán kính {radiusKm} km.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default NearbyStationsModal;
