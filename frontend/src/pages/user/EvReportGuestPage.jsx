import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  evReportService,
  fieldDefinitionService,
  api,
} from "../../services/api";
import { fetchDataList, buildDataListMaps } from "../../utils/dataListCache";
import { getDataListLabel } from "../../utils/dataListLabel";
import DynamicField from "../../components/dynamic/DynamicField";
import NearbyStationsModal, {
  NEARBY_RADIUS_KM,
} from "../../components/NearbyStationsModal";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import Toast from "../../components/Toast";
import {
  LocateFixed,
  CheckCircle2,
  PlusCircle,
  Loader2,
  ChevronDown,
  Car,
  CarFront,
  Truck,
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

const vehicleIconFor = (value) => {
  const s = String(value || "").toLowerCase();
  if (
    s.includes("vận tải") ||
    s.includes("hàng hóa") ||
    s.includes("xe tải") ||
    s.includes("van")
  )
    return Truck;
  if (s.includes("kinh doanh") || s.includes("dịch vụ") || s.includes("taxi"))
    return CarFront;
  return Car;
};

const PlaceSearchInput = ({ onPick, placeholder, className = "" }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const pickedRef = useRef("");
  const boxRef = useRef(null);
  const debouncedQuery = useDebouncedValue(query, 600);

  // Đóng danh sách gợi ý khi bấm ra ngoài
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Tự tìm địa chỉ khi khách gõ (debounce) — không cần bấm nút
  useEffect(() => {
    const text = debouncedQuery.trim();
    if (text.length < 3 || text === pickedRef.current) {
      if (text.length < 3) {
        setResults([]);
        setOpen(false);
        setMessage("");
        setSearching(false);
      }
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    setMessage("");
    (async () => {
      try {
        const res = await api.post("/geocode/search", { text, limit: 5 });
        if (cancelled) return;
        const list = (res && res.data && res.data.results) || [];
        setResults(list);
        setOpen(list.length > 0);
        setMessage(
          list.length === 0
            ? "Không tìm thấy địa chỉ phù hợp — thử thêm phường/xã hoặc tỉnh/thành."
            : "",
        );
      } catch {
        if (cancelled) return;
        setResults([]);
        setOpen(false);
        setMessage("Lỗi kết nối khi tìm địa chỉ");
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const pick = (item) => {
    const label = item.formatted || item.name || "";
    pickedRef.current = label;
    setResults([]);
    setOpen(false);
    setMessage("");
    setQuery(label);
    onPick(item);
  };

  return (
    <div className={`relative ${className}`} ref={boxRef}>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          className="input input-bordered input-sm flex-1"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (results.length > 0) pick(results[0]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {searching && (
          <span className="flex items-center gap-1 text-xs text-base-content/60 whitespace-nowrap">
            <Loader2 size={14} className="animate-spin" />
            Đang tìm...
          </span>
        )}
      </div>
      {message && (
        <div className="text-xs text-base-content/60 mt-1">{message}</div>
      )}
      {open && results.length > 0 && (
        <div className="dynamic-select-dropdown absolute top-full left-0 right-0 z-[100] bg-white border border-gray-300 rounded-md shadow-lg max-h-[240px] overflow-auto mt-1">
          {results.map((item, idx) => (
            <div
              key={`place-${idx}-${item.lat}-${item.lon}`}
              className="px-2.5 py-1.5 cursor-pointer text-[13px] hover:bg-gray-100"
              onClick={() => pick(item)}
            >
              {item.formatted || item.name || `${item.lat}, ${item.lon}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EvReportGuestPage = () => {
  const [mapCoords, setMapCoords] = useState({ latitude: "", longitude: "" });
  const [locating, setLocating] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "success" });
  const [done, setDone] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(true);
  const [previewCenter, setPreviewCenter] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [values, setValues] = useState({ ...EMPTY_VALUES });
  const [errors, setErrors] = useState({});
  const [fields, setFields] = useState([]);
  const [dlOptions, setDlOptions] = useState({});
  const [loadingFields, setLoadingFields] = useState(true);
  const lastReverseKeyRef = useRef("");
  const turnstileRef = useRef(null);
  const turnstileWidget = useRef(null);

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
        message: "Đã cập nhật Tỉnh/Xã/địa chỉ theo vị trí bạn chọn.",
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
    setPreviewCenter([lat, lng]);
    setPreviewOpen(true);
  };

  const handleRegPickPlace = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    applyCoords(lat, lng);
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (key !== lastReverseKeyRef.current) {
      lastReverseKeyRef.current = key;
      reverseFillAddress(lat, lng);
    }
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
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setError("Vui lòng kiểm tra các trường bắt buộc");
      return;
    }
    let submitLat = mapCoords.latitude;
    let submitLng = mapCoords.longitude;
    if (!submitLat || !submitLng) {
      // Chưa có tọa độ (khách chỉ nhập địa chỉ) → tự geocode trước khi gửi
      const parts = [values.address, values.ward, values.province].filter(
        (v) => v && String(v).trim() !== "",
      );
      if (parts.length > 0) {
        try {
          const res = await api.post("/geocode/search", {
            text: `${parts.join(", ")}, Việt Nam`,
            limit: 1,
          });
          const item =
            res && res.data && res.data.results && res.data.results[0];
          const lat = item ? parseFloat(item.lat) : NaN;
          const lng = item ? parseFloat(item.lon) : NaN;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            submitLat = lat.toFixed(6);
            submitLng = lng.toFixed(6);
          }
        } catch {
          /* rơi xuống thông báo bên dưới */
        }
      }
      if (!submitLat || !submitLng) {
        setError(
          "Vui lòng xác định vị trí sạc: bấm 'Vị trí của tôi' hoặc chọn địa chỉ từ gợi ý",
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await evReportService.createGuest({
        latitude: submitLat,
        longitude: submitLng,
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
    lastReverseKeyRef.current = "";
    setValues({ ...EMPTY_VALUES });
    setErrors({});
    setError("");
  };

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
    if (key === "nhom_phuong_tien") {
      const selected = Array.isArray(rawVal) ? rawVal : rawVal ? [rawVal] : [];
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
            <div className="flex flex-col gap-2">
              {options.map((o, i) => {
                const val = o && o.value !== undefined ? o.value : o;
                const lbl = o && o.label !== undefined ? o.label : String(o);
                const active = selected.includes(val);
                const Icon = vehicleIconFor(val);
                const [optName, ...restParts] = String(lbl).split("–");
                const desc = restParts.join("–").trim();
                return (
                  <button
                    type="button"
                    key={`${val}-${i}`}
                    aria-pressed={active}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      active
                        ? "bg-green-600 border-green-600 text-white shadow-sm"
                        : "bg-white dark:bg-base-100 border-base-300 text-base-content hover:border-green-500"
                    }`}
                    onClick={() =>
                      handleChange(
                        key,
                        active
                          ? selected.filter((v) => v !== val)
                          : [...selected, val],
                      )
                    }
                  >
                    <Icon
                      size={22}
                      className={`shrink-0 ${active ? "text-white" : "text-green-600"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-tight">
                        {optName.trim()}
                      </span>
                      {desc && (
                        <span
                          className={`block text-[11px] leading-tight ${
                            active ? "text-white/85" : "text-base-content/60"
                          }`}
                        >
                          {desc}
                        </span>
                      )}
                    </span>
                    {active && (
                      <CheckCircle2 size={18} className="shrink-0 text-white" />
                    )}
                  </button>
                );
              })}
            </div>
            {field.help_text && (
              <div className="field-help">{field.help_text}</div>
            )}
            {err && <div className="field-error">{err}</div>}
          </div>
        </div>
      );
    }
    if (key === "hop_tac_lap_tram") {
      const choices =
        options.length > 0
          ? options
          : [
              { value: "Có", label: "Có" },
              { value: "Không", label: "Không" },
            ];
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
            <div className="flex flex-wrap gap-2">
              {choices.map((o, i) => {
                const val = o && o.value !== undefined ? o.value : o;
                const lbl = o && o.label !== undefined ? o.label : String(o);
                const active = String(rawVal) === String(val);
                return (
                  <button
                    type="button"
                    key={`${val}-${i}`}
                    aria-pressed={active}
                    className={`px-6 py-2 rounded-lg border font-semibold transition-colors ${
                      active
                        ? "bg-green-600 border-green-600 text-white shadow-sm"
                        : "bg-white dark:bg-base-100 border-base-300 text-base-content hover:border-green-500"
                    }`}
                    onClick={() => handleChange(key, active ? "" : val)}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            {field.help_text && (
              <div className="field-help">{field.help_text}</div>
            )}
            {err && <div className="field-error">{err}</div>}
          </div>
        </div>
      );
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

  const regLocControls = (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-3">
      <button
        type="button"
        className="btn btn-outline btn-sm gap-2 shrink-0 border-green-600 text-green-700 hover:bg-green-600 hover:text-white"
        onClick={handleMyLocation}
        disabled={locating}
      >
        <LocateFixed size={14} />
        {locating ? "Đang lấy vị trí..." : "Vị trí của tôi"}
      </button>
      <span className="flex items-center gap-2 text-sm font-medium text-base-content/70">
        Hoặc tìm địa chỉ
      </span>
      <PlaceSearchInput
        className="flex-1"
        placeholder="Nhập địa chỉ (tối thiểu 3 ký tự, chọn từ gợi ý)..."
        onPick={handleRegPickPlace}
      />
    </div>
  );

  const coordsInfo = mapCoords.latitude && mapCoords.longitude && (
    <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 mb-3">
      <CheckCircle2 size={16} />
      Đã xác định vị trí sạc: {mapCoords.latitude}, {mapCoords.longitude}
    </div>
  );

  return (
    <div className="bg-gradient-to-b from-green-50 via-white to-white">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-10 md:pt-10 md:pb-16 space-y-6">
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: "", type: "success" })}
        />

        <header className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-lg shadow-green-900/10">
            <img
              src="/icons/section-icon.png"
              alt="Tìm trạm sạc & đăng ký nhu cầu sạc"
              className="w-14 h-14 object-contain"
            />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-green-800">
            Tìm trạm sạc & đăng ký nhu cầu sạc
          </h1>
          <p className="text-base md:text-lg text-base-content/70 max-w-2xl mx-auto">
            Cho chúng tôi biết bạn thường sạc xe ở đâu, TMT-EGREEN sẽ mở thêm trạm sạc gần bạn.
          </p>
        </header>

      {previewOpen && previewCenter && (
        <NearbyStationsModal
          open
          lat={previewCenter[0]}
          lng={previewCenter[1]}
          title={`Trạm sạc lân cận (bán kính ${NEARBY_RADIUS_KM} km)`}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <section className="rounded-2xl border border-green-100 bg-white shadow-lg shadow-green-900/5 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-green-50/60 transition-colors"
          onClick={() => setNearbyOpen((v) => !v)}
          aria-expanded={nearbyOpen}
        >
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-green-600 text-white text-sm font-bold shrink-0 shadow-sm">
              01
            </span>
            <span className="font-bold text-lg">
              Kiểm tra trạm sạc ở gần bạn
            </span>
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 transition-transform duration-200 ${
              nearbyOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {nearbyOpen && (
          <div className="border-t border-green-100 bg-green-50/30 p-5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <button
                type="button"
                className="btn btn-outline btn-sm gap-2 shrink-0 border-green-600 text-green-700 hover:bg-green-600 hover:text-white"
                onClick={handlePreviewMyLocation}
                disabled={previewLoading}
              >
                <LocateFixed size={14} />
                {previewLoading ? "Đang lấy vị trí..." : "Vị trí của tôi"}
              </button>
              <span className="text-sm font-medium text-base-content/70">
                Hoặc tìm địa chỉ
              </span>
              <PlaceSearchInput
                className="flex-1"
                placeholder="Nhập địa chỉ cần xem trạm sạc lân cận..."
                onPick={handlePickPlace}
              />
            </div>
            <p className="text-xs text-base-content/60">
              Bấm "Vị trí của tôi" hoặc nhập địa chỉ (tối thiểu 3 ký tự, hệ thống
              tự tìm) rồi chọn từ danh sách để xem các trạm đang hoạt động / đang
              triển khai trong bán kính {NEARBY_RADIUS_KM} km.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-green-100 bg-white shadow-lg shadow-green-900/5 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-green-50/60 transition-colors border-b border-green-100 bg-green-50/40"
          onClick={() => setRegisterOpen((v) => !v)}
          aria-expanded={registerOpen}
        >
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-green-600 text-white text-sm font-bold shrink-0 shadow-sm">
              02
            </span>
            <span className="font-bold text-xl text-green-800">
              Đăng ký thông tin nhu cầu sạc
            </span>
          </span>
          <ChevronDown
            size={20}
            className={`shrink-0 text-green-700 transition-transform duration-200 ${
              registerOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {registerOpen && (
          <div className={`p-5 md:p-6 ${done ? "space-y-4" : ""}`}>
          {done ? (
            <>
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600">
                    <CheckCircle2 size={28} />
                  </div>
                  <h2 className="font-bold text-xl text-green-700">Cảm ơn bạn đã chia sẻ!</h2>
                </div>
          <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm space-y-1.5">
            <div className="flex justify-between gap-3"><span className="text-base-content/60">Hãng xe</span><strong>{done.hang_xe || "—"}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-base-content/60">Nhóm phương tiện</span><strong>{Array.isArray(done.nhom_phuong_tien) && done.nhom_phuong_tien.length > 0 ? done.nhom_phuong_tien.join(", ") : done.nhom_phuong_tien || "—"}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-base-content/60">Địa chỉ</span><strong>{done.address || done.province || "—"}</strong></div>
          </div>
          <p className="text-sm text-base-content/70">
            Thông tin của bạn sẽ giúp chúng tôi chọn vị trí mở trạm sạc mới. Bạn có thể gửi thêm nhiều vị trí khác.
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary gap-2 shadow-sm" onClick={handleSendAnother}>
              <PlusCircle size={16} /> Gửi thêm vị trí khác
            </button>
            <a className="btn btn-ghost" href="/">
              Về trang chủ
            </a>
          </div>
              </>
            ) : (
              <>
                <p className="text-base-content/70 mb-4">
                  Cho chúng tôi biết bạn thường sạc xe ở đâu để TMT-EGREEN mở
                  thêm trạm sạc gần bạn.
                </p>

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
              <fieldset className="rounded-xl border border-base-200 bg-base-50/60 p-4 md:p-5 space-y-3">
                <legend className="px-2 text-base font-bold text-green-700">
                  Vị trí thường xuyên sạc
                </legend>

                {regLocControls}
                {coordsInfo}
                {renderRow(["province", "ward"])}
                {renderRow(["address"])}
              </fieldset>

              <fieldset className="rounded-xl border border-base-200 bg-base-50/60 p-4 md:p-5 space-y-3">
                <legend className="px-2 text-base font-bold text-green-700">
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
                className="btn btn-primary w-full mt-6 shadow-lg shadow-green-600/20"
                disabled={submitting}
              >
                {submitting ? "Đang gửi..." : "Gửi thông tin đi"}
              </button>
            </form>
          )}
              </>
            )}
          </div>
        )}
      </section>
      </div>
    </div>
  );
};

export default EvReportGuestPage;
