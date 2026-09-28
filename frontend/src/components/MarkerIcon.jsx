import { iconSvgMarkup, isValidMarkerIcon, MARKER_ICON_BG } from '../utils/mapMarkerIcons';

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

export function MapBadge({ icon, color, bg, size = 13, type = 'legend' }) {
  const isFilter = type === 'filter';
  if (!isValidMarkerIcon(icon)) {
    return <span className={isFilter ? 'map-filter-dot' : 'map-legend-dot'} style={isFilter ? { background: color } : { backgroundColor: color }} />;
  }
  const base = isFilter ? 'map-filter-badge' : 'map-legend-badge';
  if (bg === MARKER_ICON_BG.CIRCLE) {
    return <span className={base} style={{ borderColor: color }}><MarkerIcon id={icon} size={size} /></span>;
  }
  return <span className={`${base} ${base}-flat`}><MarkerIcon id={icon} size={size} /></span>;
}
