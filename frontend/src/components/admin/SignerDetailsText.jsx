import signerTextLayout from '../../utils/signatureTextLayout.json';

const POINTS_TO_CSS_PIXELS = 4 / 3;

const SignerDetailsText = ({ signer, timeText, className = '' }) => {
  const lineKeys = ['name', 'time'];
  const textByKey = {
    name: signer.full_name || '',
    time: timeText || ''
  };

  return (
    <div className={`overflow-hidden text-center ${className}`}>
      {lineKeys.map((key) => {
        const line = signerTextLayout.lines[key];
        const value = textByKey[key];
        if (!value) return null;

        return (
          <div key={key} style={{
            color: line.color,
            fontFamily: `"${signerTextLayout.fontFamily}", serif`,
            fontSize: `${line.fontSizePt * POINTS_TO_CSS_PIXELS}px`,
            fontWeight: line.fontWeight,
            lineHeight: `${signerTextLayout.lineHeightPt * POINTS_TO_CSS_PIXELS}px`,
            whiteSpace: 'nowrap'
          }}>
            {value}
          </div>
        );
      })}
    </div>
  );
};

export default SignerDetailsText;
