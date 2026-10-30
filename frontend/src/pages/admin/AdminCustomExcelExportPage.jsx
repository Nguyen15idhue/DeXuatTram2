import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { excelService } from "../../services/api";
import PageHeader from "../../components/ui/PageHeader";

const EMPTY_FILTERS = {
  search: "",
  status: "",
  model: "",
  region: "",
  dateFrom: "",
  dateTo: "",
  linkedOnly: false,
  stationStatus: "",
};

const AdminCustomExcelExportPage = () => {
  const { token } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [selectedFields, setSelectedFields] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError("");
    try {
      const response = await excelService.getCustomExportCatalog(token);
      if (!response?.success || !response.data) {
        throw new Error(response?.message || "Không tải được danh mục trường");
      }
      setCatalog(response.data);
    } catch (loadError) {
      setCatalogError(loadError.message || "Không tải được danh mục trường");
    } finally {
      setLoadingCatalog(false);
    }
  }, [token]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const selectedIds = useMemo(
    () => new Set(selectedFields.map((field) => field.id)),
    [selectedFields],
  );

  const filteredGroups = useMemo(() => {
    const query = fieldSearch.trim().toLocaleLowerCase("vi");
    return (catalog?.groups || []).map((group) => ({
      ...group,
      fields: group.fields.filter((field) => (
        !query
        || field.label.toLocaleLowerCase("vi").includes(query)
        || field.key.toLocaleLowerCase("vi").includes(query)
      )),
    }));
  }, [catalog, fieldSearch]);

  const changeFilters = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setNotice("");
  };

  const toggleField = (field) => {
    setError("");
    setNotice("");
    setPreview(null);
    if (selectedIds.has(field.id)) {
      setSelectedFields((current) => current.filter((item) => item.id !== field.id));
      return;
    }
    if (selectedFields.length >= 100) {
      setError("Mỗi file chỉ được chọn tối đa 100 trường.");
      return;
    }
    setSelectedFields((current) => [...current, { id: field.id, label: field.label }]);
  };

  const toggleGroup = (group) => {
    setError("");
    setNotice("");
    const available = group.fields.filter((field) => !selectedIds.has(field.id));
    if (available.length === 0) {
      const ids = new Set(group.fields.map((field) => field.id));
      setSelectedFields((current) => current.filter((field) => !ids.has(field.id)));
      setPreview(null);
      return;
    }
    const additions = available
      .slice(0, Math.max(0, 100 - selectedFields.length))
      .map((field) => ({ id: field.id, label: field.label }));
    setSelectedFields((current) => [...current, ...additions]);
    if (additions.length < available.length) {
      setError("Đã chạm giới hạn 100 trường; chỉ thêm được một phần nhóm này.");
    }
    setPreview(null);
  };

  const updateSelectedLabel = (id, label) => {
    setSelectedFields((current) => current.map((field) => (
      field.id === id ? { ...field, label } : field
    )));
    setPreview(null);
  };

  const moveField = (index, direction) => {
    setSelectedFields((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setPreview(null);
  };

  const payload = useMemo(() => ({
    fields: selectedFields,
    filters: {
      ...filters,
      search: filters.search.trim(),
      region: filters.region.trim(),
    },
  }), [filters, selectedFields]);

  const handlePreview = async () => {
    setError("");
    setNotice("");
    setPreviewLoading(true);
    try {
      const response = await excelService.previewCustomExport(token, payload);
      if (!response?.success) {
        throw new Error(response?.message || "Không xem trước được dữ liệu");
      }
      setPreview(response.data);
    } catch (previewError) {
      setError(previewError.message || "Không xem trước được dữ liệu");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExport = async () => {
    setError("");
    setNotice("");
    setExportLoading(true);
    try {
      const filename = await excelService.exportCustomData(token, payload);
      setNotice(`Đã tải xuống ${filename}`);
    } catch (exportError) {
      setError(exportError.message || "Xuất Excel thất bại");
    } finally {
      setExportLoading(false);
    }
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPreview(null);
    setError("");
    setNotice("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Xuất Excel tùy chỉnh"
        subtitle="Chọn trường từ đề xuất, trạm liên kết, người đề xuất và quản lý trực tiếp; xem trước rồi tải file."
      />

      {catalogError && (
        <div className="alert alert-error">
          <span>{catalogError}</span>
          <button type="button" className="btn btn-sm" onClick={loadCatalog}>Thử lại</button>
        </div>
      )}
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      {notice && <div role="status" className="alert alert-success"><span>{notice}</span></div>}

      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="card-title text-lg">1. Chọn trường xuất</h2>
              <p className="text-sm text-base-content/60">
                Tối đa 100 cột. Các trường đã chọn có thể đổi tên và sắp xếp lại.
              </p>
            </div>
            <div className="badge badge-primary badge-outline">{selectedFields.length}/100 trường</div>
          </div>

          <label className="input input-bordered flex items-center gap-2 w-full">
            <Search size={16} className="text-base-content/50" />
            <input
              value={fieldSearch}
              onChange={(event) => setFieldSearch(event.target.value)}
              placeholder="Tìm trường theo tên hoặc mã..."
              aria-label="Tìm trường"
              className="grow"
            />
          </label>

          {loadingCatalog ? (
            <div className="flex items-center justify-center gap-2 py-8 text-base-content/60">
              <LoaderCircle size={18} className="animate-spin" /> Đang tải danh mục trường...
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredGroups.map((group) => {
                const checkedCount = group.fields.filter((field) => selectedIds.has(field.id)).length;
                return (
                  <details key={group.id} className="collapse collapse-arrow border border-base-300 bg-base-100" open>
                    <summary className="collapse-title flex min-h-0 items-center gap-2 py-3 pr-12 font-semibold">
                      <span>{group.label}</span>
                      <span className="badge badge-sm badge-ghost">{checkedCount}/{group.fields.length}</span>
                    </summary>
                    <div className="collapse-content">
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => toggleGroup(group)}
                          disabled={group.fields.length === 0}
                        >
                          {checkedCount === group.fields.length ? "Bỏ chọn nhóm" : "Chọn nhóm"}
                        </button>
                      </div>
                      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                        {group.fields.map((field) => (
                          <label key={field.id} className="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm checkbox-primary mt-0.5"
                              checked={selectedIds.has(field.id)}
                              onChange={() => toggleField(field)}
                            />
                            <span className="min-w-0">
                              <span className="block truncate">{field.label}</span>
                              <span className="block truncate text-xs text-base-content/50">{field.key}</span>
                            </span>
                          </label>
                        ))}
                        {group.fields.length === 0 && (
                          <p className="col-span-full py-2 text-sm text-base-content/50">Không có trường khớp.</p>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          {selectedFields.length > 0 && (
            <div className="rounded-box border border-primary/20 bg-primary/5 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold">Thứ tự và tiêu đề cột</h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setSelectedFields([]);
                    setPreview(null);
                  }}
                >
                  Bỏ chọn tất cả
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-auto">
                {selectedFields.map((field, index) => {
                  const sourceId = field.id.split(".")[0];
                  const sourceLabel = catalog?.groups.find((group) => group.id === sourceId)?.label || "";
                  return (
                    <div key={field.id} className="flex items-center gap-2 rounded-lg bg-base-100 p-2">
                      <span className="w-7 shrink-0 text-center text-xs text-base-content/50">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <input
                          className="input input-bordered input-sm w-full"
                          value={field.label}
                          maxLength={80}
                          aria-label={`Tên cột ${field.label}`}
                          onChange={(event) => updateSelectedLabel(field.id, event.target.value)}
                        />
                        <span className="px-1 text-xs text-base-content/50">{sourceLabel} · {field.id}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-square btn-ghost btn-sm"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        aria-label={`Di chuyển ${field.label} lên`}
                      ><ArrowUp size={16} /></button>
                      <button
                        type="button"
                        className="btn btn-square btn-ghost btn-sm"
                        onClick={() => moveField(index, 1)}
                        disabled={index === selectedFields.length - 1}
                        aria-label={`Di chuyển ${field.label} xuống`}
                      ><ArrowDown size={16} /></button>
                      <button
                        type="button"
                        className="btn btn-square btn-ghost btn-sm text-error"
                        onClick={() => toggleField(field)}
                        aria-label={`Bỏ ${field.label}`}
                      ><Trash2 size={16} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="card-title text-lg">2. Lọc dữ liệu</h2>
              <p className="text-sm text-base-content/60">Chỉ áp dụng bộ lọc cho đề xuất; dữ liệu trạm và người liên quan đi theo đề xuất.</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Xóa bộ lọc</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="form-control">
              <span className="label-text mb-1">Từ khóa</span>
              <input
                className="input input-bordered input-sm"
                value={filters.search}
                onChange={(event) => changeFilters("search", event.target.value)}
                placeholder="Mã, tên chủ trạm, địa chỉ..."
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Trạng thái đề xuất</span>
              <select className="select select-bordered select-sm" value={filters.status} onChange={(event) => changeFilters("status", event.target.value)}>
                <option value="">Tất cả</option>
                {(catalog?.filters?.statusOptions || []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Mô hình đầu tư</span>
              <select className="select select-bordered select-sm" value={filters.model} onChange={(event) => changeFilters("model", event.target.value)}>
                <option value="">Tất cả</option>
                {(catalog?.filters?.modelOptions || []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Khu vực</span>
              <input className="input input-bordered input-sm" value={filters.region} onChange={(event) => changeFilters("region", event.target.value)} placeholder="Ví dụ: Miền Bắc" />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Từ ngày tạo</span>
              <input type="date" className="input input-bordered input-sm" value={filters.dateFrom} onChange={(event) => changeFilters("dateFrom", event.target.value)} />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Đến ngày tạo</span>
              <input type="date" className="input input-bordered input-sm" value={filters.dateTo} onChange={(event) => changeFilters("dateTo", event.target.value)} />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Trạng thái trạm liên kết</span>
              <select className="select select-bordered select-sm" value={filters.stationStatus} onChange={(event) => changeFilters("stationStatus", event.target.value)}>
                <option value="">Tất cả</option>
                {(catalog?.filters?.stationStatusOptions || []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 px-3 py-2">
              <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={filters.linkedOnly} onChange={(event) => changeFilters("linkedOnly", event.target.checked)} />
              <span className="text-sm">Chỉ đề xuất đã chuyển thành trạm</span>
            </label>
          </div>
        </div>
      </section>

      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="card-title text-lg">3. Xem trước và xuất file</h2>
              <p className="text-sm text-base-content/60">Xem trước tối đa 20 dòng; file xuất hỗ trợ tối đa 50.000 dòng.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline btn-primary"
                onClick={handlePreview}
                disabled={selectedFields.length === 0 || previewLoading || exportLoading}
              >
                {previewLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
                Xem trước
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExport}
                disabled={selectedFields.length === 0 || exportLoading || previewLoading}
              >
                {exportLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
                Xuất Excel
              </button>
            </div>
          </div>

          {preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="badge badge-primary badge-outline">{Number(preview.total || 0).toLocaleString("vi-VN")} dòng phù hợp</span>
                <span className="text-base-content/60">Đang hiển thị tối đa {preview.previewLimit} dòng đầu.</span>
              </div>
              {preview.rows?.length ? (
                <div className="max-h-[32rem] overflow-auto rounded-box border border-base-300">
                  <table className="table table-pin-rows table-pin-cols table-sm">
                    <thead>
                      <tr>
                        {preview.fields.map((field) => <th key={field.id} className="min-w-40">{field.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${rowIndex}-${cellIndex}`} className="max-w-72 truncate" title={cell}>{cell || <span className="text-base-content/30">—</span>}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-box border border-dashed border-base-300 py-10 text-center text-base-content/60">
                  Không có dữ liệu khớp với bộ lọc.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-box border border-dashed border-base-300 py-8 text-center text-sm text-base-content/60">
              <FileSpreadsheet size={22} className="mx-auto mb-2" />
              Chọn trường, thiết lập bộ lọc rồi bấm “Xem trước”.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminCustomExcelExportPage;
