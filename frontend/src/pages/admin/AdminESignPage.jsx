import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { api, API_URL } from "../../services/api";
import { AlertCircle, Image as ImageIcon, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import Button from "../../components/ui/Button";
import Dialog from "../../components/ui/Dialog";
import PageHeader from "../../components/ui/PageHeader";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toast from "../../components/Toast";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN");
};

const SignatureImage = ({ src, alt, className = "" }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-base-200 rounded border text-base-content/40 ${className}`}>
        <ImageIcon size={20} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain rounded border bg-base-100 ${className}`}
      onError={() => setFailed(true)}
    />
  );
};

const DropZone = ({ preview, onPick, disabled }) => {
  const inputRef = useRef(null);

  const handleDrop = (event) => {
    event.preventDefault();
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onPick(file);
  };

  return (
    <div>
      {preview ? (
        <div className="flex flex-col items-center gap-3">
          <img src={preview} alt="Xem trước chữ ký" className="max-h-40 object-contain rounded border bg-base-100 p-2" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
              Chọn ảnh khác
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-base-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-base-200/50 transition-colors"
        >
          <Upload size={28} className="mx-auto mb-2 text-base-content/50" />
          <p className="text-sm font-medium text-base-content">Kéo thả ảnh chữ ký vào đây</p>
          <p className="text-xs text-base-content/60 mt-1">hoặc bấm để chọn file (JPG, PNG, GIF, WebP — tối đa 2MB)</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
};

const AdminESignPage = () => {
  const { user, token } = useAuth();
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const [activeTab, setActiveTab] = useState("list");
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "success" });
  const [saving, setSaving] = useState(false);

  const [createFile, setCreateFile] = useState(null);
  const [createPreview, setCreatePreview] = useState(null);

  const [updateModal, setUpdateModal] = useState({ open: false, sig: null, file: null, preview: null });
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, sig: null });

  const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(user?.role);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [managerRes, listRes] = await Promise.all([
        api.getWithAuth("/admin/signatures/check-manager", token),
        api.getWithAuth("/admin/signatures", token),
      ]);
      if (managerRes?.success) setIsManager(Boolean(managerRes.data?.isManager));
      if (listRes?.success) {
        setSignatures(Array.isArray(listRes.data) ? listRes.data : []);
      } else {
        setError(listRes?.message || "Không tải được danh sách chữ ký");
      }
    } catch (err) {
      setError(err?.message || "Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const mySignature = useMemo(
    () => signatures.find((sig) => Number(sig.user_id) === Number(user?.id)),
    [signatures, user?.id],
  );

  const imageSrc = (sig) =>
    sig?.id ? `${API_URL}/admin/signatures/${sig.id}/image?token=${encodeURIComponent(token || "")}` : "";

  const validateFile = (file) => {
    if (!file.type || !file.type.startsWith("image/")) return "Chỉ chấp nhận file ảnh";
    if (file.size > MAX_FILE_SIZE) return "File ảnh tối đa 2MB";
    return "";
  };

  const pickCreateFile = (file) => {
    const message = validateFile(file);
    if (message) {
      setError(message);
      return;
    }
    if (createPreview) URL.revokeObjectURL(createPreview);
    setError("");
    setCreateFile(file);
    setCreatePreview(URL.createObjectURL(file));
  };

  const resetCreate = () => {
    if (createPreview) URL.revokeObjectURL(createPreview);
    setCreateFile(null);
    setCreatePreview(null);
  };

  const pickUpdateFile = (file) => {
    const message = validateFile(file);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setUpdateModal((prev) => {
      if (prev.preview) URL.revokeObjectURL(prev.preview);
      return { ...prev, file, preview: URL.createObjectURL(file) };
    });
  };

  const closeUpdateModal = () => {
    setUpdateModal((prev) => {
      if (prev.preview) URL.revokeObjectURL(prev.preview);
      return { open: false, sig: null, file: null, preview: null };
    });
  };

  const uploadSignature = async (file, targetUserId) => {
    const formData = new FormData();
    formData.append("file", file);
    if (targetUserId) formData.append("user_id", String(targetUserId));

    const response = await fetch(`${API_URL}/admin/signatures/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const res = await response.json();
    if (!response.ok || !res.success) {
      throw new Error(res.message || "Cập nhật chữ ký thất bại");
    }
    return res.data;
  };

  const handleCreate = async () => {
    if (!createFile) return;
    setSaving(true);
    setError("");
    try {
      await uploadSignature(createFile, null);
      resetCreate();
      setToast({ message: "Đã tạo chữ ký số", type: "success" });
      await loadData();
    } catch (err) {
      setError(err.message || "Lỗi cập nhật chữ ký");
    } finally {
      setSaving(false);
    }
  };

  const askUpdateConfirm = () => {
    if (!updateModal.file) {
      setError("Vui lòng chọn ảnh chữ ký mới");
      return;
    }
    setError("");
    setConfirmUpdate(true);
  };

  const handleUpdate = async () => {
    const file = updateModal.file;
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const targetUserId = isAdmin && updateModal.sig && Number(updateModal.sig.user_id) !== Number(user?.id)
        ? updateModal.sig.user_id
        : null;
      await uploadSignature(file, targetUserId);
      setConfirmUpdate(false);
      closeUpdateModal();
      setToast({ message: "Đã cập nhật chữ ký số", type: "success" });
      await loadData();
    } catch (err) {
      setError(err.message || "Lỗi cập nhật chữ ký");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const sig = confirmDelete.sig;
    if (!sig) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.deleteWithAuth(`/admin/signatures/${sig.id}`, token);
      if (!res?.success) throw new Error(res?.message || "Xóa chữ ký thất bại");
      setToast({ message: "Đã xóa chữ ký số", type: "success" });
      await loadData();
    } catch (err) {
      setError(err.message || "Lỗi xóa chữ ký");
    } finally {
      setSaving(false);
      setConfirmDelete({ open: false, sig: null });
    }
  };

  const canManageSignature = (sig) => isAdmin || Number(sig.user_id) === Number(user?.id);

  const renderMySignature = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      );
    }

    if (!mySignature) {
      return (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-lg">Chữ ký số của tôi</h2>
            <p className="text-sm text-base-content/60">
              Bạn chưa có chữ ký số. Hãy tải lên ảnh chữ ký để sử dụng khi trình ký đề xuất.
            </p>
            <div className="mt-2">
              <DropZone preview={createPreview} onPick={pickCreateFile} disabled={saving} />
            </div>
            {createPreview && (
              <div className="card-actions justify-end mt-3">
                <Button variant="ghost" onClick={resetCreate} disabled={saving}>
                  Hủy
                </Button>
                <Button onClick={handleCreate} loading={saving}>
                  Lưu chữ ký
                </Button>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title text-lg">Chữ ký số của tôi</h2>
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-center">
            <SignatureImage
              src={imageSrc(mySignature)}
              alt={`Chữ ký của ${mySignature.full_name}`}
              className="w-full h-32"
            />
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-base-content/50">Người dùng</div>
                <div className="font-semibold text-base-content">{mySignature.full_name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-base-content/50">Chức vụ</div>
                <div className="text-base-content">{mySignature.chuc_vu || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-base-content/50">Cập nhật lúc</div>
                <div className="text-base-content/80">{formatDateTime(mySignature.updated_at)}</div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUpdateModal({ open: true, sig: mySignature, file: null, preview: null })}
                >
                  <Pencil size={14} className="mr-1" /> Cập nhật
                </Button>
                <Button
                  variant="outline-error"
                  size="sm"
                  onClick={() => setConfirmDelete({ open: true, sig: mySignature })}
                >
                  <Trash2 size={14} className="mr-1" /> Xóa
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTable = () => (
    <div className="card bg-base-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr className="bg-base-200">
              <th className="px-4 py-3 text-center w-16">STT</th>
              <th className="px-4 py-3 text-left">Người dùng</th>
              <th className="px-4 py-3 text-left">Chức vụ</th>
              <th className="px-4 py-3 text-center w-40">Ảnh chữ ký</th>
              <th className="px-4 py-3 text-left w-48">Cập nhật lúc</th>
              <th className="px-4 py-3 text-right w-56">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2 size={24} className="mx-auto animate-spin text-primary" />
                </td>
              </tr>
            ) : signatures.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-base-content/50">
                  Chưa có chữ ký nào
                </td>
              </tr>
            ) : (
              signatures.map((sig, index) => (
                <tr key={sig.id} className="border-t border-base-200 hover">
                  <td className="px-4 py-3 text-center text-base-content/70">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-base-content">{sig.full_name}</div>
                  </td>
                  <td className="px-4 py-3 text-base-content/80">{sig.chuc_vu || "—"}</td>
                  <td className="px-4 py-3">
                    <SignatureImage
                      src={imageSrc(sig)}
                      alt={`Chữ ký của ${sig.full_name}`}
                      className="w-32 h-14 mx-auto"
                    />
                  </td>
                  <td className="px-4 py-3 text-base-content/70">{formatDateTime(sig.updated_at)}</td>
                  <td className="px-4 py-3">
                    {canManageSignature(sig) ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUpdateModal({ open: true, sig, file: null, preview: null })}
                        >
                          <Pencil size={14} className="mr-1" /> Cập nhật
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-error"
                          onClick={() => setConfirmDelete({ open: true, sig })}
                        >
                          <Trash2 size={14} className="mr-1" /> Xóa
                        </Button>
                      </div>
                    ) : (
                      <div className="text-right text-base-content/40">—</div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Chữ ký số"
        subtitle="Ảnh chữ ký dùng để trình ký đề xuất trạm sạc"
      />

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {isManager ? (
        <>
          <div role="tablist" className="tabs tabs-boxed w-fit">
            <button
              type="button"
              role="tab"
              className={`tab ${activeTab === "list" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("list")}
            >
              Danh sách chữ ký
            </button>
            <button
              type="button"
              role="tab"
              className={`tab ${activeTab === "mine" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("mine")}
            >
              Chữ ký của tôi
            </button>
          </div>

          {activeTab === "mine" ? renderMySignature() : renderTable()}
        </>
      ) : (
        renderMySignature()
      )}

      <Dialog
        isOpen={updateModal.open}
        onClose={closeUpdateModal}
        title={updateModal.sig && Number(updateModal.sig.user_id) !== Number(user?.id)
          ? `Cập nhật chữ ký — ${updateModal.sig.full_name}`
          : "Cập nhật chữ ký số"}
        size="md"
      >
        <DropZone preview={updateModal.preview} onPick={pickUpdateFile} disabled={saving} />
        <div className="modal-action">
          <Button variant="ghost" onClick={closeUpdateModal} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={askUpdateConfirm} disabled={!updateModal.file || saving}>
            Cập nhật
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmUpdate}
        title="Cập nhật chữ ký số"
        message="Bạn có chắc chắn muốn cập nhật chữ ký số mới? Chữ ký cũ sẽ bị thay thế."
        onConfirm={handleUpdate}
        onCancel={() => setConfirmUpdate(false)}
        confirmText={saving ? "Đang cập nhật..." : "Cập nhật"}
        cancelText="Hủy"
        type="warning"
      />

      <ConfirmDialog
        isOpen={confirmDelete.open}
        title="Xóa chữ ký số"
        message="Bạn có chắc chắn muốn xóa chữ ký này? Hành động không thể hoàn tác."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete({ open: false, sig: null })}
        confirmText={saving ? "Đang xóa..." : "Xóa"}
        cancelText="Hủy"
        type="danger"
      />

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "success" })}
      />
    </div>
  );
};

export default AdminESignPage;
