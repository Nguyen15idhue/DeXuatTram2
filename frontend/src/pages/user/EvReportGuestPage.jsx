import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  evReportService,
  fieldDefinitionService,
  api,
} from "../../services/api";
import {
  parseGoogleMapsLink,
  resolveGoogleMapsShortUrl,
} from "../../utils/mapHelpers";
import { VIETNAM_CENTER } from "../../utils/provinceData";
import { fetchDataList, buildDataListMaps } from "../../utils/dataListCache";
import { getDataListLabel } from "../../utils/dataListLabel";
import DynamicField from "../../components/dynamic/DynamicField";
import MapCanvas from "../../components/map/MapCanvas";
import NearbyStationsModal, {
  NEARBY_RADIUS_KM,
} from "../../components/NearbyStationsModal";
import useMapConfig from "../../hooks/useMapConfig";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import Toast from "../../components/Toast";
import {
  MapPin,
  LocateFixed,
  Link2,
  Search,
  CheckCircle2,
  PlusCircle,
  Loader2,
} from "lucide-react";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
const ENTITY = "ev_charging_reports";
const LOCATION_KEYS = ["province", "ward", "address"];
const INFO_KEYS = [
  "full_name",
  "phone",
  "hang_xe",
  "nhom_phuong_tien",
  "hop_tac_lap_tram",
];
const HANG_XE_OTHER = "__other__";
const EMPTY_VALUES = {
  province: "",
  ward: "",
  address: "",
  full_name: "",
  phone: "",
  hang_xe: "",
  hang_xe_khac: "",
  nhom_phuong_tien: [],
  hop_tac_lap_tram: "",
};

const EvReportGuestPage = () => {
  const [locMode, setLocMode] = useState("gps");
  const [mapCoords, setMapCoords] = useState({ latitude: "", longitude: "" });
  const [locating, setLocating] = useState(false);
  const [mapLink, setMapLink] = useState("");
  const [resolvingLink, setResolvingLink] = useState(false);
  const [searching, setSearching] = useState(false);
  const [flyTo, setFlyTo] = useState(null);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "success" });
  const [done, setDone] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCenter, setPreviewCenter] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeMessage, setPlaceMessage] = useState("");
  const [values, setValues] = useState({ ...EMPTY_VALUES });
  const [errors, setErrors] = useState({});
  const [fields, setFields] = useState([]);
  const [dlOptions, setDlOptions] = useState({});
  const [loadingFields, setLoadingFields] = useState(true);
  const lastReverseKeyRef = useRef("");
  const placeBoxRef = useRef(null);
  const pickedPlaceRef = useRef("");
  const turnstileRef = useRef(null);
  const turnstileWidget = useRef(null);
  const mapCfg = useMapConfig();
  const debouncedPlaceQuery = useDebouncedValue(placeQuery, 600);

  const fieldsByKey = useMemo(() => {
    const map = {};
    fields.forEach((f) => {
      map[f.key] = f;
    });
    return map;
  }, [fields]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || document.getElementById("turnstile-script"))
      return;
    const s = document.createElement("script");
    s.id = "turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.onload = () => {
      try {
        if (
          window.turnstile &&
          turnstileRef.current &&
          turnstileWidget.current == null
        ) {
          turnstileWidget.current = window.turnstile.render(
            turnstileRef.current,
            { sitekey: TURNSTILE_SITE_KEY },
          );
        }
      } catch {
        /* silent */
      }
    };
    document.body.appendChild(s);
  }, []);

  // Nạp định nghĩa field (nhãn/required/nguồn options) + data list liên quan
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fieldDefinitionService.getByEntity(ENTITY);
        const list = (res && res.data) || [];
        if (cancelled) return;
        setFields(list);
        const ids = [
          ...new Set(
            list.filter((f) => f.data_list_id).map((f) => f.data_list_id),
          ),
        ];
        const map = {};
        await Promise.all(
          ids.map(async (id) => {
            const dl = await fetchDataList(id);
            if (dl)
              map[id] = buildDataListMaps(
                dl.columns_config || [],
                dl.rows || [],
              );
          }),
        );
        if (!cancelled) setDlOptions(map);
      } catch {
        if (!cancelled) setError("Không tải được cấu hình form");
      } finally {
        if (!cancelled) setLoadingFields(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Đóng danh sách gợi ý địa chỉ khi bấm ra ngoài
  useEffect(() => {
    if (!placeOpen) return undefined;
    const close = (e) => {
      if (placeBoxRef.current && !placeBoxRef.current.contains(e.target)) {
        setPlaceOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [placeOpen]);

  // Tự động tìm địa chỉ khi khách gõ (debounce) — không cần bấm nút
  useEffect(() => {
    const text = debouncedPlaceQuery.trim();
    if (text.length < 3 || text === pickedPlaceRef.current) {
      if (text.length < 3) {
        setPlaceResults([]);
        setPlaceOpen(false);
        setPlaceMessage("");
        setPlaceSearching(false);
      }
      return undefined;
    }
    let cancelled = false;
    setPlaceSearching(true);
    setPlaceMessage("");
    (async () => {
      try {
        const res = await api.post("/geocode/search", { text, limit: 5 });
        if (cancelled) return;
        const results = (res && res.data && res.data.results) || [];
        setPlaceResults(results);
        setPlaceOpen(results.length > 0);
        setPlaceMessage(
          results.length === 0 ? "Không tìm thấy địa chỉ phù hợp" : "",
        );
      } catch {
        if (cancelled) return;
        setPlaceResults([]);
        setPlaceOpen(false);
        setPlaceMessage("Lỗi kết nối khi tìm địa chỉ");
      } finally {
        if (!cancelled) setPlaceSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedPlaceQuery]);

  const resolveOptions = useCallback(
    (field, vals) => {
      if (!field) return [];
      const map = field.data_list_id ? dlOptions[field.data_list_id] : null;
      if (field.data_list_id && map) {
        const col = field.data_list_column;
        if (!col || !map.tree[col]) return [];
        if (field.parent_field) {
          const pf = fields.find(
            (f) =>
              f.data_list_column === field.parent_field &&
              f.key !== field.parent_field,
          );
          const pv =
            vals[field.parent_field] !== undefined
              ? vals[field.parent_field]
              : pf
                ? vals[pf.key]
                : undefined;
          if (!pv) return [];
          const bucket = map.tree[field.parent_field]
            ? map.tree[field.parent_field][pv]
            : null;
          if (!bucket) return [];
          const seen = new Set();
          return bucket
            .filter((r) => {
              const v = r && r._raw ? r._raw[col] : null;
              if (v && !seen.has(v)) {
                seen.add(v);
                return true;
              }
              return false;
            })
            .map((r) => ({
              value: r._raw[col],
              label: getDataListLabel(field, r._raw, r._raw[col]),
            }));
        }
        return (map.unique[col] || []).map((v) => {
          const bucket = map.tree[col] ? map.tree[col][v] : null;
          const raw = bucket && bucket[0] ? bucket[0]._raw : null;
          return { value: v, label: getDataListLabel(field, raw, v) };
        });
      }
      if (field.options) {
        if (Array.isArray(field.options)) return field.options;
        try {
          const parsed = JSON.parse(field.options);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    },
    [dlOptions, fields],
  );

  const parentFieldKeyOf = useCallback(
    (field) => {
      if (!field || !field.parent_field) return null;
      const pf = fields.find(
        (f) =>
          f.data_list_column === field.parent_field &&
          f.key !== field.parent_field,
      );
      return pf ? pf.key : field.parent_field;
    },
    [fields],
  );

  const getCaptchaToken = () => {
    try {
      if (
        window.turnstile &&
        turnstileWidget.current !== null &&
        turnstileWidget.current !== undefined
      ) {
        return window.turnstile.getResponse(turnstileWidget.current) || "";
      }
    } catch {
      /* silent */
    }
    return "";
  };

  const resetCaptcha = () => {
    try {
      if (
        window.turnstile &&
        turnstileWidget.current !== null &&
        turnstileWidget.current !== undefined
      ) {
        window.turnstile.reset(turnstileWidget.current);
      }
    } catch {
      /* silent */
    }
  };

  const handleChange = (key, value) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Rời khỏi "Khác" thì xoá hãng xe nhập tay
      if (key === "hang_xe" && value !== HANG_XE_OTHER) next.hang_xe_khac = "";
      // Xoá giá trị con không còn hợp lệ khi select cha đổi (cascading)
      fields.forEach((f) => {
        if (!f.parent_field) return;
        if (parentFieldKeyOf(f) !== key) return;
        const opts = resolveOptions(f, next);
        const cur = next[f.key];
        const valid = opts.some(
          (o) => (o && o.value !== undefined ? o.value : o) === cur,
        );
        if (cur !== undefined && cur !== null && cur !== "" && !valid) {
          next[f.key] = "";
        }
      });
      return next;
    });
    setErrors((prev) => {
      if (!prev[key] && !(key === "hang_xe_khac" && prev.hang_xe)) return prev;
      const next = { ...prev, [key]: "" };
      if (key === "hang_xe_khac") next.hang_xe = "";
      return next;
    });
  };

  const applyCoords = (lat, lng) => {
    setMapCoords({
      latitude: Number(lat).toFixed(6),
      longitude: Number(lng).toFixed(6),
    });
    setFlyTo([Number(lat), Number(lng)]);
  };

  const reverseFillAddress = async (lat, lng) => {
    try {
      const res = await api.post("/geocode/reverse", {
        lat: Number(lat),
        lng: Number(lng),
      });
      const data = res && res.data;
      if (!data || !data.found) return;
      const admin = data.admin || {};
      const patch = {};
      if (data.address) patch.address = data.address;
      if (admin.province) patch.province = admin.province;
      if (admin.xa_phuong) patch.ward = admin.xa_phuong;
      if (Object.keys(patch).length === 0) return;
      setValues((prev) => ({ ...prev, ...patch }));
      setErrors((prev) => ({
        ...prev,
        ...Object.fromEntries(Object.keys(patch).map((k) => [k, ""])),
      }));
      setToast({
        message: "Đã cập nhật Tỉnh/Xã/địa chỉ theo vị trí trên bản đồ.",
        type: "success",
      });
    } catch {
      /* silent: giữ tọa độ, người dùng nhập tay */
    }
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Trình duyệt không hỗ trợ định vị");
      return;
    }
    setError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyCoords(position.coords.latitude, position.coords.longitude);
        setLocating(false);
        reverseFillAddress(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        setLocating(false);
        let msg = "Không thể lấy vị trí";
        if (err.code === 1) msg = "Bạn đã từ chối quyền truy cập vị trí";
        else if (err.code === 2) msg = "Không xác định được vị trí";
        else if (err.code === 3) msg = "Timeout lấy vị trí";
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleGoogleMapLink = async () => {
    const url = mapLink.trim();
    if (!url) return;
    setError("");
    setResolvingLink(true);
    try {
      let coords = parseGoogleMapsLink(url);
      if (coords && coords.needResolve) {
        coords = await resolveGoogleMapsShortUrl(coords.url);
      }
      if (coords && coords.lat != null && coords.lng != null) {
        applyCoords(coords.lat, coords.lng);
        setMapLink("");
        reverseFillAddress(coords.lat, coords.lng);
      } else {
        setError("Không đọc được tọa độ từ link Google Maps");
      }
    } catch {
      setError("Không đọc được tọa độ từ link Google Maps");
    } finally {
      setResolvingLink(false);
    }
  };

  const handleFindOnMap = async () => {
    const parts = [values.address, values.ward, values.province].filter(
      (v) => v && String(v).trim() !== "",
    );
    if (parts.length === 0) {
      setError("Vui lòng nhập Tỉnh/Xã/địa chỉ trước khi tìm");
      return;
    }
    setError("");
    setSearching(true);
    try {
      const res = await api.post("/geocode/search", {
        text: `${parts.join(", ")}, Việt Nam`,
        limit: 1,
      });
      const item = res && res.data && res.data.results && res.data.results[0];
      const lat = item ? parseFloat(item.lat) : NaN;
      const lng = item ? parseFloat(item.lon) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        applyCoords(lat, lng);
        setToast({
          message: `Đã tự động chọn vị trí: ${item.formatted || item.name || ""}. Bạn có thể bấm trực tiếp lên bản đồ để chỉnh ghim.`,
          type: "success",
        });
      } else {
        setError(
          "Không tìm thấy vị trí cho địa chỉ đã nhập, vui lòng bấm trực tiếp lên bản đồ để ghim",
        );
      }
    } catch {
      setError("Lỗi kết nối server khi tìm địa chỉ");
    } finally {
      setSearching(false);
    }
  };

  const handlePreviewMyLocation = () => {
    if (previewLoading) return;
    setError("");
    if (!navigator.geolocation) {
      setError("Trình duyệt không hỗ trợ định vị");
      return;
    }
    setPreviewLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPreviewLoading(false);
        setPreviewCenter([position.coords.latitude, position.coords.longitude]);
        setPreviewOpen(true);
      },
      (err) => {
        setPreviewLoading(false);
        let msg = "Không thể lấy vị trí của bạn";
        if (err.code === 1) msg = "Bạn đã từ chối quyền truy cập vị trí";
        else if (err.code === 2) msg = "Không xác định được vị trí";
        else if (err.code === 3) msg = "Timeout lấy vị trí";
        setError(
          `${msg} — vui lòng tìm địa chỉ ở ô bên cạnh để xem trạm sạc lân cận`,
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handlePickPlace = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const label = item.formatted || item.name || "";
    pickedPlaceRef.current = label;
    setPlaceResults([]);
    setPlaceOpen(false);
    setPlaceMessage("");
    setPlaceQuery(label);
    setPreviewCenter([lat, lng]);
    setPreviewOpen(true);
  };

  const validate = () => {
    const errs = {};
    [...LOCATION_KEYS, ...INFO_KEYS].forEach((k) => {
      const f = fieldsByKey[k];
      if (!f || !f.required) return;
      const v = values[k];
      if (
        v === "" ||
        v === null ||
        v === undefined ||
        (Array.isArray(v) && v.length === 0)
      ) {
        errs[k] = `${f.label} là bắt buộc`;
      }
    });
    if (
      values.hang_xe === HANG_XE_OTHER &&
      !String(values.hang_xe_khac || "").trim()
    ) {
      errs.hang_xe = "Vui lòng nhập hãng xe bạn đang sử dụng";
    }
    return errs;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!mapCoords.latitude || !mapCoords.longitude) {
      setError("Vui lòng chọn vị trí sạc trên bản đồ");
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setError("Vui lòng kiểm tra các trường bắt buộc");
      return;
    }
    setSubmitting(true);
    try {
      const res = await evReportService.createGuest({
        latitude: mapCoords.latitude,
        longitude: mapCoords.longitude,
        full_name: values.full_name,
        phone: values.phone,
        hang_xe:
          values.hang_xe === HANG_XE_OTHER
            ? String(values.hang_xe_khac || "").trim()
            : values.hang_xe,
        nhom_phuong_tien: values.nhom_phuong_tien,
        hop_tac_lap_tram: values.hop_tac_lap_tram,
        province: values.province,
        ward: values.ward,
        address: values.address,
        captcha_token: getCaptchaToken(),
        website,
      });
      if (res.success) {
        setDone(res.data);
        const warns = res.warnings || [];
        setToast({
          message:
            warns.length > 0
              ? `Gửi thành công! Lưu ý: ${warns.join("; ")}`
              : "Gửi thông tin thành công! Cảm ơn bạn đã chia sẻ.",
          type: warns.length > 0 ? "warning" : "success",
        });
        resetCaptcha();
      } else {
        throw new Error(res.message || "Gửi thông tin thất bại");
      }
    } catch (err) {
      setError(err.message || "Gửi thông tin thất bại");
    } finally {
      setSubmitting(false);
      resetCaptcha();
    }
  };

  const handleSendAnother = () => {
    setDone(null);
    setMapCoords({ latitude: "", longitude: "" });
    setFlyTo(null);
    lastReverseKeyRef.current = "";
    setValues({ ...EMPTY_VALUES });
    setErrors({});
    setError("");
  };

  const switchMode = (mode) => {
    if (mode === locMode) return;
    setLocMode(mode);
    setMapCoords({ latitude: "", longitude: "" });
    setFlyTo(null);
    lastReverseKeyRef.current = "";
    setValues((prev) => ({ ...prev, province: "", ward: "", address: "" }));
    setErrors({});
    setError("");
  };

  const center =
    mapCoords.latitude && mapCoords.longitude
      ? [Number(mapCoords.latitude), Number(mapCoords.longitude)]
      : [VIETNAM_CENTER.lat, VIETNAM_CENTER.lng];

  const renderCell = (key) => {
    const field = fieldsByKey[key];
    if (!field) return <div className="form-cell-empty" key={key} />;
    const required = !!field.required;
    const err = errors[key];
    const rawVal = values[key];
    const filled =
      rawVal !== undefined &&
      rawVal !== null &&
      rawVal !== "" &&
      !(Array.isArray(rawVal) && rawVal.length === 0);
    let options = resolveOptions(field, values);
    if (key === "hang_xe") {
      options = [
        ...options,
        { value: HANG_XE_OTHER, label: "Khác (nhập tay)" },
      ];
    }
    const fieldForRender = {
      ...field,
      placeholder: field.placeholder || "",
      required,
      options,
    };
    return (
      <div className="form-cell-content" key={key}>
        <div
          className={`dynamic-form-field${filled ? " is-filled" : ""}${err ? " has-error" : ""}`}
          data-field-key={key}
        >
          <label>
            {field.label}
            {required && <span className="text-red-600"> *</span>}
          </label>
          <DynamicField
            field={fieldForRender}
            value={rawVal ?? ""}
            onChange={(val) => handleChange(key, val)}
            error={err}
            entityType={ENTITY}
            uploadUrl="/files/guest-upload"
            allFields={fields}
            dataListOptions={dlOptions}
            formValues={values}
          />
          {key === "hang_xe" && values.hang_xe === HANG_XE_OTHER && (
            <input
              type="text"
              className="input input-bordered input-sm w-full mt-2"
              placeholder="Nhập hãng xe bạn đang sử dụng"
              value={values.hang_xe_khac || ""}
              onChange={(e) => handleChange("hang_xe_khac", e.target.value)}
            />
          )}
          {field.help_text && (
            <div className="field-help">{field.help_text}</div>
          )}
          {err && <div className="field-error">{err}</div>}
        </div>
      </div>
    );
  };

  const renderRow = (keys) => (
    <div
      className="form-row"
      data-cols={`1:${keys.length}`}
      key={keys.join("-")}
    >
      {keys.map((k) => renderCell(k))}
    </div>
  );

  const gpsControls = (
    <div className="space-y-2 mb-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm gap-1 w-full sm:w-auto"
        onClick={handleMyLocation}
        disabled={locating}
      >
        <LocateFixed size={14} />
        {locating ? "Đang lấy vị trí..." : "Lấy vị trí của tôi"}
      </button>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Hoặc dán link Google Maps..."
          className="input input-bordered input-sm flex-1"
          value={mapLink}
          onChange={(e) => setMapLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGoogleMapLink()}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm gap-1"
          onClick={handleGoogleMapLink}
          disabled={resolvingLink || !mapLink.trim()}
        >
          <Link2 size={14} />
          {resolvingLink ? "..." : "Lấy tọa độ"}
        </button>
      </div>
      <p className="text-xs text-base-content/60 mb-4">
        Lấy vị trí xong, Tỉnh/Xã/địa chỉ bên dưới sẽ tự điền — bạn vẫn chỉnh lại
        được.
      </p>
    </div>
  );

  const manualControls = (
    <div className="space-y-2 mb-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm gap-1 w-full sm:w-auto"
        onClick={handleFindOnMap}
        disabled={searching}
      >
        <Search size={14} />
        {searching ? "Đang tìm..." : "Tìm vị trí trên bản đồ"}
      </button>
      <p className="text-xs text-base-content/60">
        Nhập Tỉnh/Xã và địa chỉ chi tiết ở trên rồi bấm tìm — hệ thống tự ghim
        vị trí, bạn có thể bấm lên bản đồ để chỉnh lại.
      </p>
    </div>
  );

  const coordsChip = mapCoords.latitude && mapCoords.longitude && (
    <div className="flex items-center gap-1.5 mt-2 px-3 py-2 bg-blue-50 rounded-md text-sm text-base-content/80">
      <MapPin size={14} />
      Vĩ độ: {mapCoords.latitude} | Kinh độ: {mapCoords.longitude}
    </div>
  );

  const mapBlock = (
    <>
      {coordsChip}
      <div
        className="evr-map-box mt-2 rounded-lg overflow-hidden border border-base-300"
        style={{ height: 300 }}
      >
        <MapCanvas
          renderer={mapCfg.renderer}
          center={center}
          zoom={mapCoords.latitude ? 15 : 6}
          tile={{
            url: mapCfg.tileUrl,
            attribution: mapCfg.attribution,
            subdomains: mapCfg.subdomains,
          }}
          vectorStyle={mapCfg.vectorStyle}
          apiKey={mapCfg.apiKey}
          stations={[]}
          proposals={[]}
          showCluster={false}
          showStationLabels={false}
          showProvinceLabels={false}
          showBoundaries={false}
          provincePoints={[]}
          selectingLocation
          onMapSelectClick={(lat, lng) => {
            applyCoords(lat, lng);
            const key = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
            if (key !== lastReverseKeyRef.current) {
              lastReverseKeyRef.current = key;
              reverseFillAddress(lat, lng);
            }
          }}
          selectedPosition={
            mapCoords.latitude && mapCoords.longitude
              ? [Number(mapCoords.latitude), Number(mapCoords.longitude)]
              : null
          }
          locationPoint
          flyToPosition={flyTo}
        />
      </div>
      <p className="text-xs text-base-content/60 mt-1 mb-4">
        Bấm trực tiếp lên bản đồ để di chuyển ghim tới đúng vị trí sạc.
      </p>
    </>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8 mb-12">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "success" })}
      />

      {previewOpen && previewCenter && (
        <NearbyStationsModal
          open
          lat={previewCenter[0]}
          lng={previewCenter[1]}
          title={`Trạm sạc lân cận (bán kính ${NEARBY_RADIUS_KM} km)`}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <section className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold">
          Đăng ký nhu cầu vị trí sạc xe điện
        </h1>
        <p className="text-base-content/70">
          Cho chúng tôi biết bạn thường sạc xe ở đâu để TMT-EGREEN mở thêm trạm
          sạc gần bạn.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">Kiểm tra trạm sạc ở gần bạn</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm gap-1 shrink-0"
            onClick={handlePreviewMyLocation}
            disabled={previewLoading}
          >
            <LocateFixed size={14} />
            {previewLoading ? "Đang lấy vị trí..." : "Vị trí của tôi"}
          </button>
          <span className="flex items-center gap-2 font-semibold text-sm">
            Hoặc tìm địa chỉ
          </span>
          <div className="relative flex-1" ref={placeBoxRef}>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                className="input input-bordered input-sm flex-1"
                placeholder="Nhập địa chỉ cần xem trạm sạc lân cận..."
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (placeResults.length > 0)
                      handlePickPlace(placeResults[0]);
                  } else if (e.key === "Escape") {
                    setPlaceOpen(false);
                  }
                }}
              />
              {placeSearching && (
                <span className="flex items-center gap-1 text-xs text-base-content/60 whitespace-nowrap">
                  <Loader2 size={14} className="animate-spin" />
                  Đang tìm...
                </span>
              )}
            </div>
            {placeMessage && (
              <div className="text-xs text-base-content/60 mt-1">
                {placeMessage}
              </div>
            )}
            {placeOpen && placeResults.length > 0 && (
              <div className="dynamic-select-dropdown absolute top-full left-0 right-0 z-[100] bg-white border border-gray-300 rounded-md shadow-lg max-h-[240px] overflow-auto mt-1">
                {placeResults.map((item, idx) => (
                  <div
                    key={`place-${idx}-${item.lat}-${item.lon}`}
                    className="px-2.5 py-1.5 cursor-pointer text-[13px] hover:bg-gray-100"
                    onClick={() => handlePickPlace(item)}
                  >
                    {item.formatted || item.name || `${item.lat}, ${item.lon}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-base-content/60">
          Bấm "Vị trí của tôi" hoặc nhập địa chỉ (tối thiểu 3 ký tự, hệ thống tự
          tìm) rồi chọn từ danh sách để xem các trạm đang hoạt động / đang triển
          khai trong bán kính {NEARBY_RADIUS_KM} km.
        </p>
      </section>

      {done ? (
        <section className="card bg-base-100 shadow border border-base-300 p-5 space-y-3">
          <h2 className="font-bold text-lg flex items-center gap-2 text-success">
            <CheckCircle2 size={20} /> Cảm ơn bạn đã chia sẻ!
          </h2>
          <div className="bg-base-200 rounded-lg px-3 py-2 text-sm space-y-1">
            <div>
              Hãng xe: <strong>{done.hang_xe || "—"}</strong>
            </div>
            <div>
              Nhóm phương tiện:{" "}
              <strong>
                {Array.isArray(done.nhom_phuong_tien) &&
                done.nhom_phuong_tien.length > 0
                  ? done.nhom_phuong_tien.join(", ")
                  : done.nhom_phuong_tien || "—"}
              </strong>
            </div>
            <div>
              Địa chỉ: <strong>{done.address || done.province || "—"}</strong>
            </div>
          </div>
          <p className="text-sm text-base-content/70">
            Thông tin của bạn sẽ giúp chúng tôi chọn vị trí mở trạm sạc mới. Bạn
            có thể gửi thêm nhiều vị trí khác.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary gap-1"
              onClick={handleSendAnother}
            >
              <PlusCircle size={16} /> Gửi thêm vị trí khác
            </button>
            <a className="btn btn-ghost" href="/">
              Về trang chủ
            </a>
          </div>
        </section>
      ) : (
        <section className="card bg-base-100 shadow border border-base-300 p-5">
          <h2 className="font-bold text-lg mb-3">Chọn cách nhập địa chỉ</h2>

          {loadingFields ? (
            <div className="empty-state">Đang tải form...</div>
          ) : (
            <form
              className="dynamic-form"
              onSubmit={handleFormSubmit}
              noValidate
            >
              {error && (
                <div className="alert alert-error text-sm mb-3">{error}</div>
              )}
              <div className="map-filter-seg mb-3">
                <button
                  type="button"
                  className={locMode !== "manual" ? "active" : ""}
                  onClick={() => switchMode("gps")}
                >
                  Lấy vị trí hiện tại
                </button>
                <button
                  type="button"
                  className={locMode === "manual" ? "active" : ""}
                  onClick={() => switchMode("manual")}
                >
                  Nhập địa chỉ
                </button>
              </div>
              <fieldset className="form-section form-section-block form-section-block-first">
                <legend className="form-section-title">
                  Vị trí thường xuyên sạc
                </legend>

                {locMode !== "manual" ? (
                  <>
                    {gpsControls}
                    {mapBlock}
                    {renderRow(["province", "ward"])}
                    {renderRow(["address"])}
                  </>
                ) : (
                  <>
                    {renderRow(["province", "ward"])}
                    {renderRow(["address"])}
                    {manualControls}
                    {mapBlock}
                  </>
                )}
              </fieldset>

              <fieldset className="form-section form-section-block">
                <legend className="form-section-title">
                  Thông tin chia sẻ
                </legend>
                {renderRow(["full_name", "phone"])}
                {renderRow(["hang_xe"])}
                {renderRow(["nhom_phuong_tien"])}
                {renderRow(["hop_tac_lap_tram"])}
              </fieldset>

              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                autoComplete="off"
                tabIndex={-1}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-9999px",
                  opacity: 0,
                  height: 0,
                }}
              />

              {TURNSTILE_SITE_KEY && (
                <div ref={turnstileRef} className="mt-3" />
              )}

              <button
                type="submit"
                className="btn btn-primary w-full mt-4"
                disabled={submitting}
              >
                {submitting ? "Đang gửi..." : "Lưu thông tin"}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
};

export default EvReportGuestPage;
