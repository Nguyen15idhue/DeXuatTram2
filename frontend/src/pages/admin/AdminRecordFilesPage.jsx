import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { dynamicService, adminProposalService, stationService, adminUserService } from '../../services/api';
import FileViewer from '../../components/dynamic/FileViewer';
import ErrorMessage from '../../components/ErrorMessage';
import { ArrowLeft, Download, Image, Film, Music, FileText, File, Table, Eye, ExternalLink } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getFileUrl = (file) => {
  if (file.url) return file.url;
  if (file.storage_key) return `${API_URL.replace('/api', '')}/uploads/${file.storage_key}`;
  return null;
};

const getFileIcon = (file) => {
  const mime = file.mime_type || file.type || '';
  if (mime.startsWith('image/')) return Image;
  if (mime.startsWith('video/')) return Film;
  if (mime.startsWith('audio/')) return Music;
  if (mime.includes('pdf')) return FileText;
  if (mime.includes('word') || mime.includes('document')) return FileText;
  if (mime.includes('excel') || mime.includes('sheet')) return Table;
  return File;
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

  if (error) {
    return (
      <div>
        <ErrorMessage message={error} />
        <button className="btn btn-ghost gap-1 mt-4" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          Quay lại
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Files của bản ghi #{id}</h1>
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </div>
    );
  }

  if (allFiles.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Files của bản ghi #{id}</h1>
        <p className="text-base-content/60 mb-4">Không có file nào.</p>
        <button className="btn btn-ghost gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          Quay lại
        </button>
      </div>
    );
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const basePath = entity === 'station_proposals' ? 'proposals' : entity;

  if (viewingFile) {
    return <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Files của bản ghi #{id}</h1>
        <div className="flex gap-2">
          {selectedCount > 0 && (
            <button className="btn btn-primary btn-sm gap-1" onClick={handleDownloadSelected}>
              <Download size={14} />
              Tải {selectedCount} file
            </button>
          )}
          <button className="btn btn-ghost btn-sm gap-1" onClick={() => navigate(`/${basePath === 'proposals' ? 'admin/proposals' : 'admin/' + basePath}`)}>
            <ArrowLeft size={14} />
            Quay lại
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={allFiles.length > 0 && allFiles.every((_, i) => selected[i])}
            onChange={toggleSelectAll}
          />
          Chọn tất cả ({allFiles.length} file)
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {allFiles.map((file, idx) => {
          const url = getFileUrl(file);
          const IconComponent = getFileIcon(file);
          return (
            <div key={idx} className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm mt-1"
                    checked={!!selected[idx]}
                    onChange={() => toggleSelect(idx)}
                  />
                  <IconComponent size={24} className="text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{file.original_name || file.name || `File ${idx + 1}`}</div>
                    <div className="text-xs text-base-content/50">
                      {file._fieldLabel && <span>{file._fieldLabel}</span>}
                      {file.mime_type && <span> — {file.mime_type}</span>}
                    </div>
                  </div>
                </div>
                <div className="card-actions justify-end mt-2">
                  {url && (
                    <button className="btn btn-primary btn-xs gap-1" onClick={() => setViewingFile(file)}>
                      <Eye size={12} />
                      Xem
                    </button>
                  )}
                  {url && (
                    <button className="btn btn-ghost btn-xs gap-1" onClick={() => handleDownload(file)}>
                      <Download size={12} />
                      Tải
                    </button>
                  )}
                  {url && (
                    <button className="btn btn-ghost btn-xs gap-1" onClick={() => handleOpenNewTab(file)}>
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminRecordFilesPage;
