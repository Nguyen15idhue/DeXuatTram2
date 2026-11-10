import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

const PdfPage = ({ pdf, number, width, scale, scrollRoot, onError }) => {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pdf.getPage(number).then((page) => {
      if (!cancelled) setSize(page.getViewport({ scale: 1 }));
    }).catch((error) => { if (!cancelled) onError(error.message); });
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: scrollRoot.current, rootMargin: '1000px 0px',
    });
    observer.observe(wrapperRef.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [pdf, number, scrollRoot, onError]);

  const displayWidth = Math.max(1, width - 32) * scale;
  const displayHeight = size ? displayWidth * size.height / size.width : displayWidth * 842 / 595;

  useEffect(() => {
    if (!visible || !size || !width) return undefined;
    let cancelled = false;
    let task;
    (async () => {
      try {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const canvas = canvasRef.current;
        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: displayWidth / size.width });
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        task = page.render({
          canvasContext: canvas.getContext('2d'), viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await task.promise;
      } catch (error) {
        if (!cancelled && error.name !== 'RenderingCancelledException') onError(error.message);
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, number, size, visible, width, displayWidth, onError]);

  return (
    <div ref={wrapperRef} data-pdf-page={number} aria-label={`Trang ${number}`}
      className="relative mx-auto mb-4 bg-white shadow"
      style={{ width: displayWidth, height: displayHeight }}>
      {visible && <canvas key={`${displayWidth}-${displayHeight}`} ref={canvasRef} className="block h-full w-full" />}
    </div>
  );
};

const PdfPageViewer = ({ fileId, token, url, initialPage = 1, onPageChange }) => {
  const containerRef = useRef(null);
  const initialScrollRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pdfUrl = url || (fileId ? `${import.meta.env.VITE_API_URL || '/api'}/files/${fileId}/preview${token ? `?token=${encodeURIComponent(token)}` : ''}` : null);

  useEffect(() => {
    if (!pdfUrl) return undefined;
    let cancelled = false;
    let loadingTask;
    setPdfDoc(null);
    setLoading(true);
    setError('');
    setScale(1);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ url: pdfUrl, httpHeaders: token ? { Authorization: `Bearer ${token}` } : {} });
        const doc = await loadingTask.promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setPage(Math.min(Math.max(1, initialPage), doc.numPages));
        }
      } catch (error) {
        if (!cancelled) setError(error.message || 'Không tải được PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; loadingTask?.destroy(); };
  }, [pdfUrl, token, initialPage]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!pdfDoc || !containerWidth) return undefined;
    if (initialScrollRef.current?.pdf === pdfDoc && initialScrollRef.current.page === initialPage) return undefined;
    const target = container.querySelector(`[data-pdf-page="${Math.min(Math.max(1, initialPage), pdfDoc.numPages)}"]`);
    container.scrollTop = target ? target.offsetTop - container.firstElementChild.offsetTop : 0;
    initialScrollRef.current = { pdf: pdfDoc, page: initialPage };
  }, [pdfDoc, initialPage, containerWidth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!pdfDoc) return undefined;
    let frame;
    const updatePage = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = container.getBoundingClientRect();
        const pages = [...container.querySelectorAll('[data-pdf-page]')];
        const current = pages.map((element) => {
          const rect = element.getBoundingClientRect();
          const height = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
          return { element, visibility: height / Math.max(1, Math.min(rect.height, bounds.height)) };
        }).filter(({ visibility }) => visibility > 0).sort((a, b) => b.visibility - a.visibility)[0]?.element;
        if (current) {
          const number = Number(current.dataset.pdfPage);
          setPage(number);
          onPageChange?.(number);
        }
      });
    };
    container.addEventListener('scroll', updatePage, { passive: true });
    updatePage();
    return () => { container.removeEventListener('scroll', updatePage); cancelAnimationFrame(frame); };
  }, [pdfDoc, onPageChange]);

  const changeZoom = useCallback((factor) => setScale((value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value * factor))), []);
  useEffect(() => {
    const container = containerRef.current;
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
        <span className="text-xs" aria-live="polite">Trang {page} / {pdfDoc?.numPages || 0}</span>
        <button type="button" className="btn btn-xs btn-ghost" aria-label="Thu nhỏ PDF" onClick={() => changeZoom(1 / 1.25)} disabled={loading || scale <= MIN_SCALE}><ZoomOut size={14} /></button>
        <span className="text-xs" aria-live="polite">{Math.round(scale * 100)}%</span>
        <button type="button" className="btn btn-xs btn-ghost" aria-label="Phóng to PDF" onClick={() => changeZoom(1.25)} disabled={loading || scale >= MAX_SCALE}><ZoomIn size={14} /></button>
        <button type="button" className="btn btn-xs btn-ghost" aria-label="Vừa chiều rộng" title="Vừa chiều rộng" onClick={() => setScale(1)} disabled={loading}><RefreshCw size={14} /></button>
      </div>
      {error && <div role="alert" className="alert alert-error text-sm">{error}</div>}
      <div ref={containerRef} data-pdf-scroll className="relative min-h-0 w-full flex-1 overflow-auto bg-base-200/40" title="Cuộn để đọc liên tục; Ctrl + con lăn để thu phóng PDF">
        {loading && <div role="status" className="flex items-center justify-center h-64">Đang tải PDF…</div>}
        <div style={{ width: 'max-content', minWidth: '100%', padding: 16, boxSizing: 'border-box' }}>
          {pdfDoc && containerWidth > 0 && Array.from({ length: pdfDoc.numPages }, (_, index) => (
            <PdfPage key={index + 1} pdf={pdfDoc} number={index + 1} width={containerWidth}
              scale={scale} scrollRoot={containerRef} onError={setError} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PdfPageViewer;
