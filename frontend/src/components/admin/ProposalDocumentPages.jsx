import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const getFileType = (file) => {
  const name = String(file?.name || file?.original_name || '').toLowerCase();
  const mime = String(file?.mime_type || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('officedocument.wordprocessingml') || name.endsWith('.docx')) return 'docx';
  return 'unsupported';
};

const PageOverlayContent = ({ pageNumber, active, showPageLabel, children }) => (
  <>
    {active && <div className="pointer-events-none absolute inset-0 z-10 border-2 border-primary" />}
    {showPageLabel && (
      <span className="absolute left-2 top-2 z-20 whitespace-nowrap rounded bg-base-300/90 px-1.5 py-0.5 text-[10px] font-semibold text-base-content">
        Trang {pageNumber}
      </span>
    )}
    {children}
  </>
);

const PdfPageItem = ({ pdf, pageNumber, pageElsRef, activePage, showPageLabel, renderPageOverlay }) => {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [ratio, setRatio] = useState(1 / 1.414);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper) pageElsRef.current[pageNumber] = wrapper;
    return () => { delete pageElsRef.current[pageNumber]; };
  }, [pageNumber, pageElsRef]);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setRatio(viewport.width / viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    };
    render().catch(() => {});
    return () => { cancelled = true; };
  }, [pdf, pageNumber]);

  return (
    <div
      ref={wrapperRef}
      data-proposal-page={pageNumber}
      className="proposal-page-wrapper relative mx-auto mb-5 w-full max-w-[850px] bg-white shadow"
      style={{ aspectRatio: `${ratio}` }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <PageOverlayContent
        pageNumber={pageNumber}
        active={Number(activePage) === pageNumber}
        showPageLabel={showPageLabel}
      >
        {renderPageOverlay ? renderPageOverlay(pageNumber, ratio) : null}
      </PageOverlayContent>
    </div>
  );
};

const ProposalDocumentPages = forwardRef(({
  file,
  renderPageOverlay = null,
  activePage = null,
  onActivePageChange = null,
  showPageLabel = false,
  containerClassName = 'max-h-[75vh] min-h-[50vh] overflow-auto bg-base-200 p-3',
}, ref) => {
  const { token } = useAuth();
  const containerRef = useRef(null);
  const docxContainerRef = useRef(null);
  const pdfPageElsRef = useRef({});
  const docxPageElsRef = useRef({});
  const [fileType, setFileType] = useState('');
  const [pdf, setPdf] = useState(null);
  const [docxPages, setDocxPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    scrollToPage(pageNumber) {
      const target = Number(pageNumber) || 1;
      const el = pdfPageElsRef.current[target] || docxPageElsRef.current[target] || null;
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    scrollToOverlay(pageNumber, signerId = null) {
      const target = Number(pageNumber) || 1;
      const pageEl = pdfPageElsRef.current[target] || docxPageElsRef.current[target] || null;
      if (!pageEl) return;
      const overlayEl = [...pageEl.querySelectorAll('[data-signer-overlay]')]
        .find((element) => !signerId || element.dataset.signerOverlayId === String(signerId));
      (overlayEl || pageEl).scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    getPageCount() {
      if (fileType === 'pdf') return pdf?.numPages || 0;
      if (fileType === 'docx') return docxPages.length;
      return 0;
    },
  }), [fileType, pdf, docxPages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onActivePageChange || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const pages = [...container.querySelectorAll('[data-proposal-page]')];
    if (pages.length === 0) return undefined;
    const visibleRatios = new Map(pages.map((page) => [page, 0]));

    const observer = new IntersectionObserver((entries) => {
      const containerRect = container.getBoundingClientRect();
      entries.forEach((entry) => {
        const rect = entry.target.getBoundingClientRect();
        const visibleHeight = Math.max(
          0,
          Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top)
        );
        visibleRatios.set(entry.target, visibleHeight / Math.max(1, rect.height));
      });
      const candidates = [...visibleRatios.entries()]
        .map(([element, ratio]) => ({
          page: Number(element.dataset.proposalPage),
          ratio
        }))
        .filter((entry) => entry.page > 0 && entry.ratio > 0)
        .sort((left, right) => right.ratio - left.ratio);
      if (candidates.length > 0) onActivePageChange(candidates[0].page);
    }, { root: container, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });

    pages.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [fileType, pdf, docxPages, onActivePageChange]);

  useEffect(() => {
    if (!file?.id) {
      setPdf(null);
      setDocxPages([]);
      setFileType('');
      setError('Chưa có file BCĐX');
      return undefined;
    }
    let cancelled = false;
    let pdfDocument = null;
    setLoading(true);
    setError('');
    setPdf(null);
    setDocxPages([]);
    const type = getFileType(file);
    setFileType(type);
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/files/${file.id}/download?token=${encodeURIComponent(token || '')}`;

    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(async (buffer) => {
        if (cancelled) return;
        if (type === 'pdf') {
          const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
          pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
          pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
          if (!cancelled) setPdf(pdfDocument);
          return;
        }
        if (type === 'docx') {
          const { renderAsync } = await import('docx-preview');
          if (!docxContainerRef.current) throw new Error('Không tìm thấy vùng hiển thị tài liệu');
          docxContainerRef.current.innerHTML = '';
          await renderAsync(buffer, docxContainerRef.current, null, {
            className: 'approval-docx',
            breakPages: true
          });
          let pages = [...docxContainerRef.current.querySelectorAll('section.approval-docx')];
          if (pages.length === 0) pages = [docxContainerRef.current];
          pages.forEach((page, index) => {
            page.style.position = 'relative';
            page.dataset.proposalPage = String(index + 1);
            docxPageElsRef.current[index + 1] = page;
          });
          if (!cancelled) setDocxPages(pages);
          return;
        }
        throw new Error('Chỉ hỗ trợ hiển thị file PDF hoặc DOCX');
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || 'Không tải được tài liệu');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      pdfDocument?.destroy();
      docxPageElsRef.current = {};
    };
  }, [file?.id, file?.mime_type, file?.name, file?.original_name, token]);

  const clampPage = (pageNumber) => Math.min(pageNumber, Math.max(1, pdf?.numPages || docxPages.length || 1));

  return (
    <div ref={containerRef} className={containerClassName}>
      {fileType === 'docx' && (
        <div
          ref={docxContainerRef}
          className="proposal-document-pages-docx min-w-full bg-white"
        />
      )}
      {loading && <div className="flex min-h-[50vh] items-center justify-center"><span className="loading loading-spinner" /></div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && fileType === 'unsupported' && (
        <div className="alert alert-warning">Chỉ hỗ trợ hiển thị file PDF hoặc DOCX</div>
      )}
      {!loading && !error && fileType === 'pdf' && pdf && (
        Array.from({ length: pdf.numPages }, (_, index) => (
          <PdfPageItem
            key={index + 1}
            pdf={pdf}
            pageNumber={index + 1}
            pageElsRef={pdfPageElsRef}
            activePage={activePage === null ? null : clampPage(activePage)}
            showPageLabel={showPageLabel}
            renderPageOverlay={renderPageOverlay}
          />
        ))
      )}
      {!loading && !error && fileType === 'docx' && docxPages.map((page, index) => {
        const rect = page.getBoundingClientRect();
        const pageAspectRatio = rect.height > 0 ? rect.width / rect.height : 210 / 297;
        return createPortal(
          <PageOverlayContent
            pageNumber={index + 1}
            active={activePage !== null && Number(activePage) === index + 1}
            showPageLabel={showPageLabel}
          >
            {renderPageOverlay ? renderPageOverlay(index + 1, pageAspectRatio) : null}
          </PageOverlayContent>,
          page,
          `proposal-page-overlay-${index + 1}`
        );
      })}
    </div>
  );
});

export default ProposalDocumentPages;
