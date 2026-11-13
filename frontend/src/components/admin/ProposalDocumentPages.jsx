import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const PdfPageItem = ({ pdf, pageNumber, pageElsRef, activePage, showPageLabel, renderPageOverlay, onError, onRendered }) => {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [ratio, setRatio] = useState(595 / 842);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    pageElsRef.current[pageNumber] = wrapper;
    let cancelled = false;
    let task;
    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setRatio(viewport.width / viewport.height);
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
        if (!cancelled) onRendered(pageNumber);
      } catch (error) {
        if (!cancelled && error.name !== 'RenderingCancelledException') onError(error.message);
      }
    })();
    return () => { cancelled = true; task?.cancel(); delete pageElsRef.current[pageNumber]; };
  }, [pdf, pageNumber, pageElsRef, onError, onRendered]);
  return (
    <div ref={wrapperRef} data-proposal-page={pageNumber}
      className="proposal-page-wrapper relative mx-auto mb-5 w-full max-w-[850px] bg-white shadow"
      style={{ aspectRatio: `${ratio}` }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div data-proposal-overlay-page={pageNumber} className="pointer-events-none absolute inset-0 z-20">
        {Number(activePage) === pageNumber && <div className="absolute inset-0 z-10 border-2 border-primary" />}
        {showPageLabel && <span className="absolute left-2 top-2 z-20 whitespace-nowrap rounded bg-base-300/90 px-1.5 py-0.5 text-[10px] font-semibold text-base-content">Trang {pageNumber}</span>}
        {renderPageOverlay ? renderPageOverlay(pageNumber, ratio) : null}
      </div>
    </div>
  );
};

const ProposalDocumentPages = forwardRef(({
  file, renderPageOverlay = null, activePage = null, onActivePageChange = null, showPageLabel = false, onReadyChange = null,
  containerClassName = 'max-h-[75vh] min-h-[50vh] overflow-auto bg-base-200 p-3',
}, ref) => {
  const { token } = useAuth();
  const containerRef = useRef(null);
  const pageElsRef = useRef({});
  const [pdf, setPdf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const renderedPagesRef = useRef(new Set());
  const onRendered = useCallback(pageNumber => {
    renderedPagesRef.current.add(pageNumber);
    if (pdf && renderedPagesRef.current.size === pdf.numPages) onReadyChange?.(true);
  }, [pdf, onReadyChange]);
  useImperativeHandle(ref, () => ({
    scrollToPage(pageNumber) {
      pageElsRef.current[Number(pageNumber) || 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    scrollToOverlay(pageNumber, signerId = null) {
      const page = pageElsRef.current[Number(pageNumber) || 1];
      if (!page) return;
      const overlay = [...page.querySelectorAll('[data-signer-overlay]')]
        .find((element) => !signerId || element.dataset.signerOverlayId === String(signerId));
      (overlay || page).scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    getPageCount() { return pdf?.numPages || 0; },
  }), [pdf]);

  useEffect(() => {
    const container = containerRef.current;
    if (!pdf || !onActivePageChange) return undefined;
    const pages = [...container.querySelectorAll('[data-proposal-overlay-page]')];
    const ratios = new Map(pages.map((page) => [page, 0]));
    const observer = new IntersectionObserver((entries) => {
      const bounds = container.getBoundingClientRect();
      entries.forEach(({ target }) => {
        const rect = target.getBoundingClientRect();
        ratios.set(target, Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top)) / Math.max(1, rect.height));
      });
      const current = [...ratios.entries()].filter(([, ratio]) => ratio > 0).sort((a, b) => b[1] - a[1])[0];
      if (current) onActivePageChange(Number(current[0].dataset.proposalOverlayPage));
    }, { root: container, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
    pages.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [pdf, onActivePageChange]);

  useEffect(() => {
    renderedPagesRef.current.clear();
    onReadyChange?.(false);
    setPdf(null);
    setError('');
    if (!file?.id) { setLoading(false); setError('Chưa có file BCĐX'); return undefined; }
    let cancelled = false;
    let loadingTask;
    setLoading(true);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({
          url: `${import.meta.env.VITE_API_URL || '/api'}/files/${file.id}/preview`,
          httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const document = await loadingTask.promise;
        if (!cancelled) setPdf(document);
      } catch (error) {
        if (!cancelled) setError(error.message || 'Không tải được tài liệu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; loadingTask?.destroy(); };
  }, [file?.id, token, onReadyChange]);

  return (
    <div ref={containerRef} className={containerClassName}>
      {loading && <div className="flex min-h-[50vh] items-center justify-center"><span className="loading loading-spinner" /></div>}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {!loading && !error && pdf && Array.from({ length: pdf.numPages }, (_, index) => (
        <PdfPageItem key={index + 1} pdf={pdf} pageNumber={index + 1} pageElsRef={pageElsRef}
          activePage={activePage} showPageLabel={showPageLabel} renderPageOverlay={renderPageOverlay} onError={setError} onRendered={onRendered} />
      ))}
    </div>
  );
});

export default ProposalDocumentPages;
