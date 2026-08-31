import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getFileUrl = (file) => {
  if (file.url) return file.url;
  if (file.storage_key) return `${API_URL.replace('/api', '')}/uploads/${file.storage_key}`;
  return null;
};

const FileViewer = ({ file, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfError, setPdfError] = useState(false);
  const url = getFileUrl(file);
  const mime = file.mime_type || file.type || '';

  useEffect(() => {
    setPageNumber(1);
    setNumPages(null);
    setPdfError(false);
  }, [file]);

  if (!url) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>Không thể hiển thị file</div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>Đóng</button>
          </div>
        </div>
      </div>
    );
  }

  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isPdf = mime.includes('pdf');
  const isWord = mime.includes('word') || mime.includes('document');
  const isExcel = mime.includes('excel') || mime.includes('sheet');
  const isText = mime.startsWith('text/');

  const onDocumentLoadSuccess = ({ numPages: n }) => {
    setNumPages(n);
    setPdfError(false);
  };

  const onDocumentLoadError = () => {
    setPdfError(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '90vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {file.original_name || file.name || 'File'}
          </h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isImage && (
              <>
                <button className="btn btn-sm btn-secondary" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>−</button>
                <span style={{ fontSize: 12, color: '#666', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button className="btn btn-sm btn-secondary" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
              </>
            )}
            {isPdf && numPages && (
              <span style={{ fontSize: 12, color: '#666' }}>
                Trang {pageNumber} / {numPages}
              </span>
            )}
            <button className="btn btn-sm btn-secondary" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ overflow: 'auto', maxHeight: 'calc(90vh - 80px)', background: isPdf ? '#525659' : '#000', borderRadius: 8, display: 'flex', alignItems: isPdf ? 'flex-start' : 'center', justifyContent: isPdf ? 'center' : 'center', flexDirection: isPdf ? 'column' : 'row', minHeight: 200 }}>
          {isImage && (
            <img
              src={url}
              alt={file.original_name || 'Image'}
              style={{ maxWidth: '100%', maxHeight: '70vh', transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.2s' }}
            />
          )}

          {isVideo && (
            <video
              src={url}
              controls
              style={{ maxWidth: '100%', maxHeight: '70vh' }}
            >
              Trình duyệt không hỗ trợ video.
            </video>
          )}

          {isAudio && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
              <audio src={url} controls style={{ width: '100%', maxWidth: 400 }} />
            </div>
          )}

          {isPdf && !pdfError && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={<div style={{ padding: 40, color: '#fff' }}>Đang tải PDF...</div>}
                error={<div style={{ padding: 40, color: '#fff' }}>Không thể tải PDF</div>}
              >
                <Page
                  pageNumber={pageNumber}
                  width={Math.min(800, window.innerWidth - 100)}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </Document>
              {numPages && numPages > 1 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingBottom: 12 }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={pageNumber <= 1}
                    onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                  >
                    Trang trước
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={pageNumber >= numPages}
                    onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                  >
                    Trang sau
                  </button>
                </div>
              )}
            </div>
          )}

          {isPdf && pdfError && (
            <iframe
              src={url}
              style={{ width: '100%', height: '70vh', border: 'none' }}
              title={file.original_name || 'PDF'}
            />
          )}

          {(isWord || isExcel) && (
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
              style={{ width: '100%', height: '70vh', border: 'none' }}
              title={file.original_name || 'Document'}
            />
          )}

          {isText && (
            <iframe
              src={url}
              style={{ width: '100%', height: '70vh', border: 'none', background: '#fff' }}
              title={file.original_name || 'Text'}
            />
          )}

          {!isImage && !isVideo && !isAudio && !isPdf && !isWord && !isExcel && !isText && (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
              <p>Không thể xem trước định dạng này</p>
              <p style={{ fontSize: 13, color: '#666' }}>{mime || 'Không rõ loại file'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileViewer;
