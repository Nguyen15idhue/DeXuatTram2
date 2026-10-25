import { forwardRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { formatSignedTime } from '../../utils/proposalSignature';
import { PenSquare } from 'lucide-react';
import ProposalDocumentPages from './ProposalDocumentPages';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const SignatureOverlay = ({ signer, proposalId, token, canSign, onSign, signing }) => (
  <div
    data-signer-overlay=""
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
