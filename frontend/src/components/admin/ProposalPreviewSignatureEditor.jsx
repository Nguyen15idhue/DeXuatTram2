import { useCallback, useEffect, useRef, useState } from 'react';
import ProposalDocumentPages from './ProposalDocumentPages';
import SignerDetailsText from './SignerDetailsText';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ProposalPreviewSignatureEditor = ({ url, signers, onChange, onPageCount, disabled = false }) => {
  const pagesRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const handleReady = useCallback((ready) => {
    onPageCount(ready ? pagesRef.current?.getPageCount() || 0 : 0);
  }, [onPageCount]);
  useEffect(() => {
    if (!drag) return undefined;
    const move = (event) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const target = element?.closest('[data-proposal-overlay-page]')
        || element?.closest('[data-proposal-page]')?.querySelector('[data-proposal-overlay-page]');
      const overlay = drag.mode === 'move' && target ? target : drag.overlay;
      const rect = overlay.getBoundingClientRect();
      onChange((current) => current.map((signer) => {
        if (signer.user_id !== drag.userId) return signer;
        if (drag.mode === 'resize') {
          return {
            ...signer,
            box_width: clamp(drag.width + (event.clientX - drag.x) / drag.rect.width, 0.05, 1 - signer.pos_x),
            box_height: clamp(drag.height + (event.clientY - drag.y) / drag.rect.height, 0.1, 1 - signer.pos_y)
          };
        }
        return {
          ...signer, page: Number(overlay.dataset.proposalOverlayPage),
          pos_x: clamp((event.clientX - rect.left) / rect.width - drag.offsetX * signer.box_width, 0, 1 - signer.box_width),
          pos_y: clamp((event.clientY - rect.top) / rect.height - drag.offsetY * signer.box_height, 0, 1 - signer.box_height)
        };
      }));
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [drag, onChange]);

  const start = (event, signer, mode) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const overlay = event.currentTarget.closest('[data-proposal-overlay-page]');
    const box = event.currentTarget.closest('[data-signer-overlay]').getBoundingClientRect();
    setDrag({ mode, userId: signer.user_id, overlay, rect: overlay.getBoundingClientRect(),
      x: event.clientX, y: event.clientY, width: signer.box_width, height: signer.box_height,
      offsetX: clamp((event.clientX - box.left) / box.width, 0, 1),
      offsetY: clamp((event.clientY - box.top) / box.height, 0, 1) });
  };

  return <ProposalDocumentPages ref={pagesRef} file={{ previewUrl: url }} showPageLabel onReadyChange={handleReady}
    renderPageOverlay={(page) => signers.filter((signer) => Number(signer.page) === page).map((signer) => (
      <div key={signer.user_id} data-signer-overlay="" data-signer-overlay-id={signer.user_id}
        className="pointer-events-auto absolute z-30 flex cursor-move flex-col border-2 border-primary bg-white/90 p-1"
        style={{ left: `${signer.pos_x * 100}%`, top: `${signer.pos_y * 100}%`, width: `${signer.box_width * 100}%`, height: `${signer.box_height * 100}%`, touchAction: 'none' }}
        onPointerDown={(event) => start(event, signer, 'move')}>
        <span className="text-xs">{signer.full_name}</span>
        <div className="flex-1 text-xs text-base-content/50">Ảnh chữ ký</div>
        <SignerDetailsText signer={signer} timeText="Thời gian ký" />
        <span className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-primary"
          onPointerDown={(event) => start(event, signer, 'resize')} />
      </div>
    ))} />;
};

export default ProposalPreviewSignatureEditor;
