import signerTextLayout from '../../utils/signatureTextLayout.json';

const POINTS_TO_CSS_PIXELS = 4 / 3;

const SignerDetailsText = ({ signer, timeText, className = '' }) => {
  const textByKey = {
    title: signer.signer_title || '',
    name: signer.full_name || '',
    time: timeText || ''
  };

  return (
    <div
      className={`overflow-hidden text-left ${className}`}
      style={{
        fontFamily: `"${signerTextLayout.fontFamily}", serif`,
        lineHeight: `${signerTextLayout.lineHeightPt * POINTS_TO_CSS_PIXELS}px`,
        whiteSpace: 'normal'
      }}
    >
      {signerTextLayout.segments.map((segment) => {
        const value = textByKey[segment.key];
        if (!value) return null;

        return (
          <div
            key={segment.key}
            style={{
              color: segment.color,
              fontSize: `${segment.fontSizePt * POINTS_TO_CSS_PIXELS}px`,
              fontWeight: segment.fontWeight,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {value}
          </div>
        );
      })}
    </div>
  );
};

export default SignerDetailsText;
