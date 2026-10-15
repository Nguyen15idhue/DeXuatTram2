import { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import MapView from './MapView';
import { excelService } from '../services/api';
import { formatDistanceM } from '../utils/formatDistance';
import { MapPinned, Map as MapIcon, X, Download } from 'lucide-react';

const DuplicateCheckPanel = forwardRef(({
  fetchDuplicates,
  getProposalViewUrl,
  getStationViewUrl,
  onModeChange,
  onViewItem,
  exportDuplicatesUrl = null,
  exportToken = null,
  exportBodyExtra = null,
  resetKey = null
}, ref) => {
  const [minM, setMinM] = useState(0);
  const [maxM, setMaxM] = useState(2000);
  const [appliedMinM, setAppliedMinM] = useState(0);
  const [appliedMaxM, setAppliedMaxM] = useState(2000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() {
      setResult(null);
      setShowMap(false);
      setError('');
      setMinM(0);
      setMaxM(2000);
      setAppliedMinM(0);
      setAppliedMaxM(2000);
      if (onModeChange) onModeChange(false);
    },
    hasResult() {
      return !!result;
    }
  }));

  useEffect(() => {
    if (resetKey === null || resetKey === undefined) return;
    setResult(null);
    setShowMap(false);
    setError('');
    if (onModeChange) onModeChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const handleCheck = async () => {
    const min = Number(minM);
    const m = Number(maxM);
    if (minM === '' || minM == null || isNaN(min) || min < 0) {
      setError('Min (m) phải từ 0 trở lên');
      return;
    }
    if (maxM === '' || maxM == null || isNaN(m) || m <= 0) {
      setError('Max (m) phải lớn hơn 0');
      return;
    }
    if (min > 5000 || m > 5000) {
      setError('Khoảng cách tối đa 5000m');
      return;
    }
    if (min >= m) {
      setError('Min (m) phải nhỏ hơn Max (m)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetchDuplicates(min, m);
      if (res.success) {
        setResult(res.data);
        setAppliedMinM(min);
        setAppliedMaxM(m);
        if (onModeChange) onModeChange(true);
      } else {
        setError(res.message || 'Check trùng thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!exportDuplicatesUrl || !exportToken) return;
    setError('');
    setExporting(true);
    try {
      await excelService.exportDuplicatesBlob(
        exportDuplicatesUrl,
        { min_m: appliedMinM, max_m: appliedMaxM, ...(typeof exportBodyExtra === 'function' ? exportBodyExtra() : (exportBodyExtra || {})) },
        exportToken,
        'duplicates_export.xlsx'
      );
    } catch (err) {
      setError(err.message || 'Export thất bại');
    } finally {
      setExporting(false);
    }
  };

  const labelOf = (p) => {
    if (p.code) return p.code;
    return p.kind === 'station' ? `Trạm #${p.id}` : `Đề xuất #${p.id}`;
  };

  const viewUrlOf = (p) => {
    if (p.kind === 'station') return getStationViewUrl ? getStationViewUrl(p.id) : null;
    return getProposalViewUrl ? getProposalViewUrl(p.id) : null;
  };

  const renderViewButton = (p, side) => {
    const url = viewUrlOf(p);
    if (onViewItem) {
      return <button className="btn btn-primary btn-xs" onClick={() => onViewItem(p.kind, p.id)}>{side}</button>;
    }
    if (url) {
      return <a className="btn btn-primary btn-xs" href={url}>{side}</a>;
    }
    return <span className="text-base-content/30 text-xs">{side}</span>;
  };

  const highlightIds = useMemo(() => result ? ({
    proposals: result.duplicate_proposal_ids,
    stations: result.duplicate_station_ids
  }) : null, [result]);

  const counts = useMemo(() => {
    if (!result || !Array.isArray(result.pairs)) return { pairs: 0, points: 0, records: 0 };
    const coords = new Set();
    const records = new Set();
    result.pairs.forEach((p) => {
      [p.a, p.b].forEach((it) => {
        const lat = Number(it.latitude);
        const lng = Number(it.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) coords.add(`${lat.toFixed(6)},${lng.toFixed(6)}`);
        records.add(`${it.kind}:${it.id}`);
      });
    });
    return { pairs: result.pairs.length, points: coords.size, records: records.size };
  }, [result]);

  const dupCounts = useMemo(() => {
    if (!result || !Array.isArray(result.pairs)) return null;
    const coordKey = (it) => `${Number(it.latitude).toFixed(6)},${Number(it.longitude).toFixed(6)}`;
    const perCoord = new Map();
    const itemCoord = new Map();
    result.pairs.forEach((p) => {
      [p.a, p.b].forEach((it) => {
        const ik = `${it.kind}:${it.id}`;
        itemCoord.set(ik, coordKey(it));
      });
    });
    itemCoord.forEach((ck) => perCoord.set(ck, (perCoord.get(ck) || 0) + 1));
    const map = {};
    itemCoord.forEach((ck, ik) => { map[ik] = perCoord.get(ck) || 1; });
    return map;
  }, [result]);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={4999}
            className="input input-bordered input-sm w-24"
            value={minM}
            onChange={(e) => setMinM(e.target.value)}
          />
          <span className="text-sm text-base-content/70">m –</span>
          <input
            type="number"
            min={1}
            max={5000}
            className="input input-bordered input-sm w-24"
            value={maxM}
            onChange={(e) => setMaxM(e.target.value)}
          />
          <span className="text-sm text-base-content/70">m</span>
        </div>
        <button className="btn btn-warning btn-sm gap-1" onClick={handleCheck} disabled={loading}>
          <MapPinned size={14} />
          {loading ? 'Đang check...' : 'Check trùng'}
        </button>
        {result && (
          <button className="btn btn-info btn-sm gap-1" onClick={() => setShowMap(true)}>
            <MapIcon size={14} />
            View map ({counts.points} điểm)
          </button>
        )}
        {result && exportDuplicatesUrl && (
          <button className="btn btn-secondary btn-sm gap-1" onClick={handleExport} disabled={exporting}>
            <Download size={14} />
            {exporting ? 'Đang xuất...' : 'Export trùng'}
          </button>
        )}
        {result && (
          <span className="text-sm text-base-content/70">
            Tìm thấy {counts.pairs} cặp trùng · {counts.points} điểm
            {counts.records > counts.points ? ` · ${counts.records} bản ghi` : ''}
          </span>
        )}
      </div>
      {error && <div className="alert alert-error text-sm mt-2 py-2">{error}</div>}

      {result && (
        <div className="overflow-x-auto mt-3 border border-base-300 rounded-lg">
          <table className="table table-zebra w-full text-sm">
            <thead>
              <tr>
                <th className="text-center w-12">#</th>
                <th>Bên A</th>
                <th>Bên B</th>
                <th>Khoảng cách</th>
                <th className="text-center">Xem</th>
              </tr>
            </thead>
            <tbody>
              {result.pairs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-base-content/50">
                    Không có cặp trùng nào trong khoảng {appliedMinM}m – {appliedMaxM}m
                  </td>
                </tr>
              )}
              {result.pairs.map((pair, idx) => {
                return (
                  <tr key={idx} className="hover">
                    <td className="text-center">{idx + 1}</td>
                    <td>{labelOf(pair.a)} <span className="badge badge-ghost badge-xs ml-1">{pair.a.status}</span></td>
                    <td>{labelOf(pair.b)} <span className="badge badge-ghost badge-xs ml-1">{pair.b.status}</span></td>
                    <td className="font-medium">{formatDistanceM(pair.distance_m)}</td>
                    <td className="text-center">
                      <div className="flex gap-1 justify-center">
                        {renderViewButton(pair.a, 'A')}
                        {renderViewButton(pair.b, 'B')}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showMap && result && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-5xl h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg">Bản đồ điểm trùng ({counts.points} điểm{counts.records > counts.points ? ` / ${counts.records} bản ghi` : ''})</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowMap(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <MapView
                readOnly
                highlightIds={highlightIds}
                pairs={result.pairs}
                clusterOverride={false}
                dupCounts={dupCounts}
              />
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowMap(false)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
});

export default DuplicateCheckPanel;
