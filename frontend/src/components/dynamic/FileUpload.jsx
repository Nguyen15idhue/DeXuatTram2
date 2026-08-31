import { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const FileUpload = ({ value, onChange, entityId, entityType, multiple = false, accept, disabled, fileConfig = {} }) => {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const files = Array.isArray(value) ? value : value ? [value] : [];

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    if (entityId) formData.append('entityId', entityId);
    if (entityType) formData.append('entityType', entityType);
    const res = await api.uploadWithAuth('/files/upload', formData, token);
    if (res.success) return res.data;
    throw new Error(res.message || 'Upload failed');
  };

  const handleFiles = async (fileList) => {
    setError('');
    const max_size = (fileConfig.maxSize || 10) * 1024 * 1024;
    for (const f of fileList) {
      if (f.size > max_size) {
        setError(`File "${f.name}" vượt quá ${fileConfig.maxSize || 10}MB`);
        return;
      }
    }
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of fileList) {
        const result = await uploadFile(f);
        uploaded.push(result);
      }
      const newValue = multiple ? [...files, ...uploaded] : uploaded[0];
      onChange(newValue);
    } catch (err) {
      setError(err.message || 'Lỗi upload file');
    } finally {
      setUploading(false);
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
    if (file.storage_key) return `${API_URL.replace('/api', '')}/uploads/${file.storage_key}`;
    return null;
  };

  const isImage = (file) => {
    const mime = file.mime_type || file.type || '';
    return mime.startsWith('image/');
  };

  return (
    <div className="file-upload">
      <div
        className={`file-upload-dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
          style={{ display: 'none' }}
        />
        {uploading ? (
          <span>Đang upload...</span>
        ) : (
          <span>Kéo thả hoặc click để chọn file</span>
        )}
      </div>

      {error && <div className="file-upload-error">{error}</div>}

      {files.length > 0 && (
        <div className="file-upload-list">
          {files.map((file, idx) => (
            <div key={idx} className="file-upload-item">
              {isImage(file) && getFileUrl(file) ? (
                <img src={getFileUrl(file)} alt={file.original_name} className="file-preview-img" />
              ) : (
                <span className="file-icon">📄</span>
              )}
              <span className="file-name">{file.original_name || file.name}</span>
              <button type="button" className="btn btn-sm btn-delete" onClick={() => handleRemove(idx)} disabled={disabled}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
