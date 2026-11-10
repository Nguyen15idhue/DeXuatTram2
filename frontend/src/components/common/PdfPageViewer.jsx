import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

const PdfPageViewer = ({ fileId, token, url, initialPage = 1, onPageChange }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pdfUrl = url || (fileId ? `/api/files/${fileId}/preview${token ? `?token=${encodeURIComponent(token)}` : ''}` : null);

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        }
        const loadingTask = pdfjs.getDocument({ url: pdfUrl, httpHeaders: token ? { Authorization: `Bearer ${token}` } : {} });
        const doc = await loadingTask.promise;
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPage(Math.min(Math.max(1, initialPage), doc.numPages));
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Không tải được PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    try {
      const pg = await pdfDoc.getPage(page);
      const viewport = pg.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pg.render({ canvasContext: ctx, viewport }).promise;
      if (onPageChange) onPageChange(page);
    } catch (e) {
      setError(e?.message || 'Lỗi render trang');
    }
  }, [pdfDoc, page, scale, onPageChange]);

  useEffect(() => { renderPage(); }, [renderPage]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)));
  const zoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)));

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-base-content/60">Đang tải PDF…</div>;
  }
  if (error) {
    return <div className="alert alert-error text-sm">{error}</div>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className="btn btn-xs btn-ghost" onClick={goPrev} disabled={page <= 1}><ChevronLeft size={14} /></button>
        <span className="text-xs">Trang {page} / {numPages}</span>
        <button type="button" className="btn btn-xs btn-ghost" onClick={goNext} disabled={page >= numPages}><ChevronRight size={14} /></button>
        <button type="button" className="btn btn-xs btn-ghost" onClick={zoomOut}><ZoomOut size={14} /></button>
        <span className="text-xs">{Math.round(scale * 100)}%</span>
        <button type="button" className="btn btn-xs btn-ghost" onClick={zoomIn}><ZoomIn size={14} /></button>
      </div>
      <div className="overflow-auto border rounded bg-base-200/40 w-full flex justify-center">
        <canvas ref={canvasRef} className="shadow" />
      </div>
    </div>
  );
};

export default PdfPageViewer;
