import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formatSignedTime } from '../../utils/proposalSignature';
import { PenSquare } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const getFileType = (file) => {
  const name = String(file?.name || file?.original_name || '').toLowerCase();
  const mime = String(file?.mime_type || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('officedocument.wordprocessingml') || name.endsWith('.docx')) return 'docx';
  return 'unsupported';
};

const SignatureOverlay = ({ signer, proposalId, token, canSign, onSign, signing }) => (
  <div
    className={`absolute z-10 flex items-center justify-center border-2 ${signer.status === 'SIGNED' ? 'border-success' : 'border-dashed border-primary'}`}
    style={{
      left: `${Number(signer.pos_x) * 100}%`,
      top: `${Number(signer.pos_y) * 100}%`,
      width: `${Number(signer.box_width) * 100}%`,
      height: `${Number(signer.box_height) * 100}%`,
      minHeight: 36,
      pointerEvents: 'none'
    }}
  >
    {signer.status === 'SIGNED' ? (
      <img
        src={`${API_URL}/admin/proposal-signatures/${proposalId}/signature-image/${signer.id}?token=${encodeURIComponent(token || '')}`}
        alt={`Chữ ký ${signer.full_name}`}
        className="h-full w-full object-contain"
      />
    ) : (
      <span className="text-[10px] text-primary bg-white/90 px-1 truncate">{signer.full_name}</span>
    )}
    <div className="absolute -top-6 left-0 right-0 flex justify-between gap-1 text-[10px]">
      <span className="truncate bg-white/90 px-1 text-gray-800">
        {signer.full_name}{signer.signer_title ? ` · ${signer.signer_title}` : ''}
      </span>
      {canSign && (
        <button
          type="button"
          className="btn btn-xs btn-success gap-1 pointer-events-auto"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSign(signer);
          }}
          disabled={signing}
        >
          <PenSquare size={12} />
          Ký ngay
        </button>
      )}
    </div>
    <span className="absolute -bottom-5 left-0 right-0 truncate bg-white/90 text-[10px] text-gray-600">
      {signer.status === 'SIGNED' ? `Đã ký ${formatSignedTime(signer.signed_at)}` : 'Chờ ký'}
    </span>
  </div>
);

const PdfPage = ({ pdf, pageNumber, proposalId, signers, token, onSign, signing, onError }) => {
  const canvasRef = useRef(null);
  const [ratio, setRatio] = useState(1 / 1.414);

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
    render().catch((error) => {
      if (!cancelled) onError(error.message || 'Không render được trang PDF');
    });
    return () => { cancelled = true; };
  }, [pdf, pageNumber, onError]);

  return (
    <div className="relative mx-auto mb-5 w-full max-w-[850px] bg-white shadow" style={{ aspectRatio: `${ratio}` }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
      {signers.map((signer) => (
        <SignatureOverlay
          key={signer.id}
          signer={signer}
          proposalId={proposalId}
          token={token}
          canSign={signer.canSign}
          onSign={onSign}
          signing={signing}
        />
      ))}
    </div>
  );
};

const ProposalSigningDocument = ({ file, proposalId, myConfig, signers, canSign, onSign, signing }) => {
  const { token } = useAuth();
  const containerRef = useRef(null);
  const [fileType, setFileType] = useState('');
  const [pdf, setPdf] = useState(null);
  const [docxPages, setDocxPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handlePdfError = useCallback((message) => setError(message), []);

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
    const url = `${API_URL}/files/${file.id}/download?token=${encodeURIComponent(token || '')}`;

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
          if (!containerRef.current) throw new Error('Không tìm thấy vùng hiển thị tài liệu');
          containerRef.current.innerHTML = '';
          await renderAsync(buffer, containerRef.current, null, {
            className: 'approval-docx',
            breakPages: true
          });
          const pages = [...containerRef.current.querySelectorAll('section.approval-docx')];
          pages.forEach((page) => { page.style.position = 'relative'; });
          if (!cancelled) setDocxPages(pages);
          return;
        }
        throw new Error('Chỉ hỗ trợ hiển thị file PDF hoặc DOCX');
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || 'Không tải được file BCĐX');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      pdfDocument?.destroy();
    };
  }, [file?.id, file?.mime_type, file?.name, file?.original_name, token]);

  return (
    <div className="max-h-[75vh] min-h-[50vh] overflow-auto bg-base-200 p-3">
      {fileType === 'docx' && <div ref={containerRef} className="proposal-signing-docx-container" />}
      {loading && <div className="flex min-h-[50vh] items-center justify-center"><span className="loading loading-spinner" /></div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}
      {!loading && !error && fileType === 'pdf' && pdf && (
        Array.from({ length: pdf.numPages }, (_, index) => (
          <PdfPage
            key={index + 1}
            pdf={pdf}
            pageNumber={index + 1}
            proposalId={proposalId}
            signers={signers.filter((signer) => Number(signer.page) === index + 1).map((signer) => ({
              ...signer,
              canSign: canSign && Number(signer.user_id) === Number(myConfig?.user_id) && signer.status === 'PENDING'
            }))}
            token={token}
            onSign={onSign}
            signing={signing}
            onError={handlePdfError}
          />
        ))
      )}
      {!loading && !error && fileType === 'docx' && docxPages.map((page, index) => createPortal(
        signers
          .filter((signer) => Number(signer.page) === index + 1)
          .map((signer) => (
            <SignatureOverlay
              key={signer.id}
              signer={signer}
              proposalId={proposalId}
              token={token}
              canSign={canSign && Number(signer.user_id) === Number(myConfig?.user_id) && signer.status === 'PENDING'}
              onSign={onSign}
              signing={signing}
            />
          )),
        page,
        `signature-page-${index + 1}`
      ))}
    </div>
  );
};

export default ProposalSigningDocument;
