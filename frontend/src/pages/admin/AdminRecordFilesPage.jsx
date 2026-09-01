import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { dynamicService, adminProposalService, stationService, adminUserService } from '../../services/api';
import FileViewer from '../../components/dynamic/FileViewer';
import ErrorMessage from '../../components/ErrorMessage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getFileUrl = (file) => {
  if (file.url) return file.url;
  if (file.storage_key) return `${API_URL.replace('/api', '')}/uploads/${file.storage_key}`;
  return null;
};

const getFileIcon = (file) => {
  const mime = file.mime_type || file.type || '';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('excel') || mime.includes('sheet')) return '📊';
  return '📁';
};

const VIEW_MAP = { stations: 6, users: 7, station_proposals: 8 };

const AdminRecordFilesPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { entity, id } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [record, setRecord] = useState(null);
  const [fileFields, setFileFields] = useState([]);
  const [allFiles, setAllFiles] = useState([]);
  const [selected, setSelected] = useState({});
  const [viewingFile, setViewingFile] = useState(null);

  useEffect(() => {
    loadRecord();
  }, [entity, id]);

  const loadRecord = async () => {
    try {
      setLoading(true);
      setError('');
      const viewId = VIEW_MAP[entity];
      if (!viewId) { setError('Entity không hợp lệ'); return; }

      const fieldRes = await dynamicService.getViewConfig(entity, viewId);
      const fileFieldDefs = (fieldRes.data?.allFields || []).filter(f => f.type === 'file');
      setFileFields(fileFieldDefs);

      let recordData = null;
      if (entity === 'station_proposals') {
        const res = await adminProposalService.getAllWithParams('', token);
        recordData = res.data?.find(r => r.id === parseInt(id));
      } else if (entity === 'stations') {
        const res = await stationService.getAllWithParams('');
        recordData = res.data?.find(r => r.id === parseInt(id));
      } else if (entity === 'users') {
        const res = await adminUserService.getAllWithParams('', token);
        recordData = res.data?.find(r => r.id === parseInt(id));
      }

      if (!recordData) { setError('Không tìm thấy bản ghi'); return; }
      setRecord(recordData);

      const files = [];
      fileFieldDefs.forEach(f => {
        let val = recordData[f.key];
        if (!val) return;
        if (typeof val === 'string') {
          try { val = JSON.parse(val); } catch { val = [val]; }
        }
        const list = Array.isArray(val) ? val : [val];
        list.forEach(file => {
          if (file && typeof file === 'object') {
            files.push({ ...file, _fieldKey: f.key, _fieldLabel: f.label });
          } else if (typeof file === 'string' && file) {
            files.push({ original_name: file, _fieldKey: f.key, _fieldLabel: f.label, storage_key: file });
          }
        });
      });
      setAllFiles(files);
    } catch {
      setError('Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (idx) => {
    setSelected(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleSelectAll = () => {
    const allSelected = allFiles.every((_, i) => selected[i]);
    const newSel = {};
    if (!allSelected) allFiles.forEach((_, i) => { newSel[i] = true; });
    setSelected(newSel);
  };

  const handleDownloadSelected = () => {
    Object.entries(selected).forEach(([idx, sel]) => {
      if (sel) {
        const file = allFiles[parseInt(idx)];
        const url = getFileUrl(file);
        if (url) {
          const a = document.createElement('a');
          a.href = url;
          a.download = file.original_name || file.name || 'download';
          a.click();
        }
      }
    });
  };

  const handleDownload = (file) => {
    const url = getFileUrl(file);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name || file.name || 'download';
      a.click();
    }
  };

  const handleOpenNewTab = (file) => {
    const url = getFileUrl(file);
    if (url) window.open(url, '_blank');
  };

  if (error) return <div className="admin-record-files-page"><ErrorMessage message={error} /><div style={{ marginTop: 12 }}><button className="btn btn-secondary" onClick={() => navigate(-1)}>Quay lại</button></div></div>;
  if (loading) return <div className="admin-record-files-page"><h1>Files của bản ghi #{id}</h1><p>Đang tải...</p></div>;
  if (allFiles.length === 0) return (
    <div className="admin-record-files-page">
      <h1>Files của bản ghi #{id}</h1>
      <p>Không có file nào.</p>
      <button className="btn btn-secondary" onClick={() => navigate(-1)}>Quay lại</button>
    </div>
  );

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const basePath = entity === 'station_proposals' ? 'proposals' : entity;

  if (viewingFile) {
    return <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} />;
  }

  return (
    <div className="admin-record-files-page">
      <div className="page-header">
        <h1>Files của bản ghi #{id}</h1>
        <div className="page-header-actions">
          {selectedCount > 0 && (
            <button className="btn btn-primary" onClick={handleDownloadSelected}>
              Tải {selectedCount} file đã chọn
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate(`/${basePath === 'proposals' ? 'admin/proposals' : 'admin/' + basePath}`)}>
            Quay lại
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            className="file-card-checkbox"
            checked={allFiles.length > 0 && allFiles.every((_, i) => selected[i])}
            onChange={toggleSelectAll}
          />
          Chọn tất cả ({allFiles.length} file)
        </label>
      </div>

      <div className="file-grid">
        {allFiles.map((file, idx) => {
          const url = getFileUrl(file);
          return (
            <div key={idx} className="file-card">
              <input
                type="checkbox"
                className="file-card-checkbox"
                checked={!!selected[idx]}
                onChange={() => toggleSelect(idx)}
              />
              <span className="file-card-icon">{getFileIcon(file)}</span>
              <div className="file-card-info">
                <div className="file-card-name">{file.original_name || file.name || `File ${idx + 1}`}</div>
                <div className="file-card-meta">
                  {file._fieldLabel && <span>{file._fieldLabel}</span>}
                  {file.mime_type && <span> — {file.mime_type}</span>}
                </div>
              </div>
              <div className="file-card-actions">
                {url && (
                  <button className="btn btn-sm btn-primary" onClick={() => setViewingFile(file)}>Xem</button>
                )}
                {url && (
                  <button className="btn btn-sm btn-secondary" onClick={() => handleDownload(file)}>Tải</button>
                )}
                {url && (
                  <button className="btn btn-sm btn-secondary" onClick={() => handleOpenNewTab(file)}>Tab mới</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminRecordFilesPage;
