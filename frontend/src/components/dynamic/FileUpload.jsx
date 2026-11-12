import { useState, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const FileUpload = ({
  value,
  onChange,
  entityId,
  entityType,
  multiple = false,
  accept,
  disabled,
  fileConfig = {},
  uploadUrl = "/files/upload",
  invalid = false,
  validationError = "",
  validateFile = null,
  onUploadingChange,
  onUploadError,
  onPreviewFile,
  retryFailedUploads = false,
}) => {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [failedFiles, setFailedFiles] = useState([]);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const files = Array.isArray(value) ? value : value ? [value] : [];

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("originalName", file.name);
    if (entityId) formData.append("entityId", entityId);
    if (entityType) formData.append("entityType", entityType);
    let res;
    if (token) {
      res = await api.uploadWithAuth(uploadUrl, formData, token);
    } else {
      const response = await fetch(`${API_URL}${uploadUrl}`, {
        method: "POST",
        body: formData,
      });
      res = await response.json();
    }
    if (res.success) return Array.isArray(res.data) ? res.data[0] : res.data;
    throw new Error(res.message || "Upload failed");
  };

  const handleFiles = async (fileList) => {
    if (disabled || uploading) return;
    setError("");
    onUploadError?.("");
    const fail = (message) => { setError(message); onUploadError?.(message); };
    setFailedFiles([]);
    if (multiple && fileConfig.maxFiles && files.length + fileList.length > fileConfig.maxFiles) {
      fail(`Chỉ được tải tối đa ${fileConfig.maxFiles} file`);
      return;
    }
    if (typeof validateFile === "function") {
      const rejected = fileList.find((file) => !validateFile(file));
      if (rejected) {
        fail(`File "${rejected.name}" không đúng định dạng được chấp nhận`);
        return;
      }
    }
    const max_size = (fileConfig.maxSize || 10) * 1024 * 1024;
    for (const f of fileList) {
      if (f.size > max_size) {
        fail(`File "${f.name}" vượt quá ${fileConfig.maxSize || 10}MB`);
        return;
      }
    }
    setUploading(true);
    onUploadingChange?.(true);
    const uploaded = [];
    try {
      for (const f of fileList) {
        const result = await uploadFile(f);
        uploaded.push(result);
        if (multiple) onChange([...files, ...uploaded]);
      }
      if (!multiple) onChange(uploaded[0]);
    } catch (err) {
      fail(err.message || "Lỗi upload file");
      if (retryFailedUploads) setFailedFiles(fileList.slice(uploaded.length));
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
  };

  const handleRemove = (index) => {
    const newFiles = files.filter((_, i) => i !== index);
    onChange(multiple ? newFiles : null);
  };

  const getFileUrl = (file) => {
    if (file.url) return file.url;
    if (file.id) {
      const t = token || localStorage.getItem("token") || "";
      return t
        ? `${API_URL}/files/${file.id}/image?token=${encodeURIComponent(t)}`
        : `${API_URL}/files/${file.id}/image`;
    }
    return null;
  };

  const isImage = (file) => {
    const mime = file.mime_type || file.type || "";
    return mime.startsWith("image/");
  };

  return (
    <div className={`file-upload${invalid ? " has-error" : ""}`}>
      <div
        className={`file-upload-dropzone ${dragOver ? "drag-over" : ""}${invalid ? " is-invalid" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          onChange={handleInputChange}
          accept={accept}
          multiple={multiple}
          disabled={disabled || uploading}
          className="hidden"
        />
        {uploading ? (
          <span>Đang upload...</span>
        ) : (
          <span>Kéo thả hoặc click để chọn file</span>
        )}
      </div>

      {error && <div className="file-upload-error">{error}</div>}
      {failedFiles.length > 0 && <div className="space-y-2 text-sm">
        <p>Chưa tải: {failedFiles.map(file => file.name).join(', ')}. Các file đã tải thành công được giữ lại.</p>
        <button type="button" className="btn btn-outline btn-sm" disabled={disabled || uploading}
          onClick={() => handleFiles(failedFiles)}>Thử tải lại các file còn lỗi</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || uploading}
          onClick={() => { setFailedFiles([]); setError(''); onUploadError?.(''); }}>Bỏ các file chưa tải</button>
      </div>}
      {validationError && (
        <div className="file-upload-error">{validationError}</div>
      )}

      {files.length > 0 && (
        <div className="file-upload-list">
          {files.map((file, idx) => (
            <div key={idx} className="file-upload-item">
              {isImage(file) && getFileUrl(file) ? (
                <img
                  src={getFileUrl(file)}
                  alt={file.original_name || file.name || "preview"}
                  className="file-preview-img"
                />
              ) : (
                <span className="file-icon">📄</span>
              )}
              <span className="file-name">
                {onPreviewFile ? <button type="button" className="link text-left" onClick={() => onPreviewFile(file)}>
                  {file.original_name || file.name}
                </button> : file.original_name || file.name}
                {file.size != null && <small className="ml-2 text-base-content/60">{(Number(file.size) / 1024 / 1024).toFixed(2)}MB</small>}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-delete"
                onClick={() => handleRemove(idx)}
                disabled={disabled || uploading}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
