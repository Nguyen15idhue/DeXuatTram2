import { forwardRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { formatSignedTime, normalizeSignerBox } from '../../utils/proposalSignature';
import { PenSquare } from 'lucide-react';
import ProposalDocumentPages from './ProposalDocumentPages';
import signerTextLayout from '../../utils/signatureTextLayout.json';
import SignerDetailsText from './SignerDetailsText';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const SignatureOverlay = ({ signer: sourceSigner, proposalId, token, canSign, onSign, signing }) => {
  const signer = normalizeSignerBox(sourceSigner);
  return (
    <div
      data-signer-overlay=""
      data-signer-overlay-id={signer.id}
      className={`absolute z-10 flex flex-col items-start justify-start overflow-hidden border-2 bg-white/90 px-1 py-0.5 text-left ${signer.status === 'SIGNED' ? 'border-success' : 'border-dashed border-primary'}`}
      style={{
        left: `${Number(signer.pos_x) * 100}%`,
        top: `${signer.pos_y * 100}%`,
        width: `${Number(signer.box_width) * 100}%`,
        height: `${signer.box_height * 100}%`,
        pointerEvents: 'none',
        boxSizing: 'border-box'
      }}
    >
      {signer.status === 'SIGNED' ? (
        <img
          src={`${API_URL}/admin/proposal-signatures/${proposalId}/signature-image/${signer.id}?token=${encodeURIComponent(token || '')}`}
          alt={`Chữ ký ${signer.full_name}`}
          className="min-h-0 w-full flex-none object-contain object-left-bottom"
          style={{ height: `${signerTextLayout.imageHeightRatio * 100}%` }}
        />
      ) : (
        <div
          className="flex w-full flex-none items-end justify-start pb-1 text-left text-[10px] text-base-content/50"
          style={{ height: `${signerTextLayout.imageHeightRatio * 100}%` }}
        >
          Chờ chữ ký
        </div>
      )}
      <div
        className="min-h-0 w-full flex-1 overflow-hidden text-left"
        style={{
          paddingTop: `${signerTextLayout.topPaddingPx}px`,
          fontFamily: `"${signerTextLayout.fontFamily}", serif`
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
