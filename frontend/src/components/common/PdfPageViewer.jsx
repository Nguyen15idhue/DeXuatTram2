import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

const PdfPageViewer = ({ fileId, token, url, initialPage = 1, onPageChange }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pdfUrl = url || (fileId ? `/api/files/${fileId}/preview${token ? `?token=${encodeURIComponent(token)}` : ''}` : null);

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    let loadingTask;
    setPdfDoc(null);
    setLoading(true);
    setError('');
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        }
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ url: pdfUrl, httpHeaders: token ? { Authorization: `Bearer ${token}` } : {} });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPage(Math.min(Math.max(1, initialPage), doc.numPages));
        setScale(1);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Không tải được PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      loadingTask?.destroy();
    };
  }, [pdfUrl, token, initialPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfDoc || !containerWidth) return undefined;
    let cancelled = false;
    let task;
    const previousTask = renderTaskRef.current;
    (async () => {
      try {
        if (previousTask) {
          previousTask.cancel();
          try {
            await previousTask.promise;
          } catch (e) {
            if (e?.name !== 'RenderingCancelledException') throw e;
          }
        }
        const pg = await pdfDoc.getPage(page);
        if (cancelled || !canvasRef.current) return;
        const baseViewport = pg.getViewport({ scale: 1 });
        const fitScale = Math.max(1, containerWidth - 32) / baseViewport.width;
        const viewport = pg.getViewport({ scale: fitScale * scale });
        const canvas = canvasRef.current;
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        task = pg.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) {
          setError('');
          onPageChange?.(page);
        }
      } catch (e) {
        if (!cancelled && e?.name !== 'RenderingCancelledException') {
          setError(e?.message || 'Lỗi render trang');
        }
      } finally {
        if (task && renderTaskRef.current === task) renderTaskRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdfDoc, page, scale, containerWidth, onPageChange]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(numPages, p + 1));
  const changeZoom = useCallback((factor) => {
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor)));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event) => {
      if ((!event.ctrlKey && !event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [changeZoom]);

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col self-stretch" style={{ height: '100%' }} aria-label="Trình xem PDF">
      <div className="flex shrink-0 items-center justify-center gap-2 flex-wrap border-b bg-base-100 p-2 text-base-content">
        <button type="button" className="btn btn-xs btn-ghost" aria-label="Trang trước" onClick={goPrev} disabled={loading || page <= 1}><ChevronLeft size={14} /></button>
        <span className="text-xs" aria-live="polite">Trang {page} / {numPages}</span>
        <button type="button" className="btn btn-xs btn-ghost" aria-label="Trang sau" onClick={goNext} disabled={loading || page >= numPages}><ChevronRight size={14} /></button>
        <button type="button" className="btn btn-xs btn-ghost" aria-label="Thu nhỏ PDF" onClick={() => changeZoom(1 / 1.25)} disabled={loading || scale <= MIN_SCALE}><ZoomOut size={14} /></button>
        <span className="text-xs" aria-live="polite">{Math.round(scale * 100)}%</span>
        <button type="button" className="btn btn-xs btn-ghost" aria-label="Phóng to PDF" onClick={() => changeZoom(1.25)} disabled={loading || scale >= MAX_SCALE}><ZoomIn size={14} /></button>
        <button type="button" className="btn btn-xs btn-ghost" aria-label="Vừa chiều rộng" title="Vừa chiều rộng" onClick={() => setScale(1)} disabled={loading}><RefreshCw size={14} /></button>
      </div>
      {error && <div role="alert" className="alert alert-error text-sm">{error}</div>}
      <div ref={containerRef} className="min-h-0 w-full flex-1 overflow-auto bg-base-200/40" title="Ctrl + con lăn để thu phóng PDF">
        {loading && <div role="status" className="flex items-center justify-center h-64 text-white">Đang tải PDF…</div>}
        <div style={{ width: 'max-content', minWidth: '100%', padding: 16, boxSizing: 'border-box' }}>
          <canvas ref={canvasRef} className="shadow block mx-auto" style={{ display: loading || !pdfDoc ? 'none' : 'block' }} />
        </div>
      </div>
    </div>
  );
};

export default PdfPageViewer;
