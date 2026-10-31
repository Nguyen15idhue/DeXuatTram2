import { forwardRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { formatSignedTime, normalizeSignerBox } from '../../utils/proposalSignature';
import { PenSquare } from 'lucide-react';
import ProposalDocumentPages from './ProposalDocumentPages';
import signerTextLayout from '../../utils/signatureTextLayout.json';
import SignerDetailsText from './SignerDetailsText';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const IMAGE_TEXT_GAP_PT = 11;
const FOOTER_PX = signerTextLayout.lineHeightPt * 2 * 4 / 3;
const IMAGE_BOTTOM_PX = FOOTER_PX + IMAGE_TEXT_GAP_PT * 4 / 3;

const SignatureOverlay = ({ signer: sourceSigner, proposalId, token, canSign, onSign, signing }) => {
  const signer = normalizeSignerBox(sourceSigner);
  return (
    <div
      data-signer-overlay=""
      data-signer-overlay-id={signer.id}
      className={`absolute z-10 overflow-hidden border-2 bg-white/90 text-left ${signer.status === 'SIGNED' ? 'border-success' : 'border-dashed border-primary'}`}
      style={{
        left: `${Number(signer.pos_x) * 100}%`,
        top: `${signer.pos_y * 100}%`,
        width: `${Number(signer.box_width) * 100}%`,
        height: `${signer.box_height * 100}%`,
        pointerEvents: 'none',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="absolute inset-x-0 flex items-center justify-center overflow-hidden"
        style={{
          top: 0,
          bottom: `${IMAGE_BOTTOM_PX}px`,
          paddingLeft: `${signerTextLayout.leftPaddingPx}px`,
          paddingRight: `${signerTextLayout.rightPaddingPx}px`
        }}
      >
        {signer.status === 'SIGNED' ? (
          <img
            src={`${API_URL}/admin/proposal-signatures/${proposalId}/signature-image/${signer.id}?token=${encodeURIComponent(token || '')}`}
            alt={`Chữ ký ${signer.full_name}`}
            className="max-h-full max-w-[88%] object-contain"
          />
        ) : (
          <div className="w-full text-center text-[10px] text-base-content/50">Chờ chữ ký</div>
        )}
      </div>
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden"
        style={{
          height: `${signerTextLayout.lineHeightPt * 2 * 4 / 3}px`,
          padding: `0 ${signerTextLayout.rightPaddingPx}px 0 ${signerTextLayout.leftPaddingPx}px`
        }}
      >
        <SignerDetailsText
          signer={signer}
          timeText={signer.status === 'SIGNED' ? formatSignedTime(signer.signed_at) : 'Chờ ký'}
        />
      </div>
      {canSign && (
        <button
          type="button"
          className="btn btn-xs btn-success pointer-events-auto absolute -right-2 -top-2 z-20 gap-1"
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
  );
};

const ProposalSigningDocument = forwardRef(({ file, proposalId, myConfig, signers, canSign, onSign, signing }, ref) => {
  const { token } = useAuth();

  const renderPageOverlay = (pageNumber) => signers
    .filter((signer) => Number(signer.page) === pageNumber)
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
    ));

  return (
    <ProposalDocumentPages
      ref={ref}
      file={file}
      renderPageOverlay={renderPageOverlay}
    />
  );
});

ProposalSigningDocument.displayName = 'ProposalSigningDocument';

export default ProposalSigningDocument;
