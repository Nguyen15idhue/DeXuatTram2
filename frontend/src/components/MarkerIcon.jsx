import { iconSvgMarkup, isValidMarkerIcon } from '../utils/mapMarkerIcons';

export default function MarkerIcon({ id, size = 16, className = '', style }) {
  if (!isValidMarkerIcon(id)) return null;
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: iconSvgMarkup(id, { size }) }}
    />
  );
}
