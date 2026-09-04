import { useState, forwardRef, useImperativeHandle } from 'react';
import MapView from './MapView';
import { MapPinned, Map as MapIcon, X } from 'lucide-react';

const DuplicateCheckPanel = forwardRef(({
  fetchDuplicates,
  getProposalViewUrl,
  getStationViewUrl,
  onModeChange
}, ref) => {
  const [maxM, setMaxM] = useState(2000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() {
      setResult(null);
      setShowMap(false);
      setError('');
      setMaxM(2000);
      if (onModeChange) onModeChange(false);
    },
    hasResult() {
      return !!result;
    }
  }));

  const handleCheck = async () => {
    const m = Number(maxM);
    if (!m || m <= 200) {
      setError('X (m) phải lớn hơn 200');
      return;
    }
    if (m > 5000) {
      setError('X (m) tối đa 5000');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetchDuplicates(200, m);
      if (res.success) {
        setResult(res.data);
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

  const labelOf = (p) => (p.kind === 'station' ? `Trạm #${p.id}` : `Đề xuất #${p.id}`);

  const viewUrlOf = (p) => {
    if (p.kind === 'station') return getStationViewUrl ? getStationViewUrl(p.id) : null;
    return getProposalViewUrl ? getProposalViewUrl(p.id) : null;
  };

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-sm text-base-content/70">200m –</span>
          <input
            type="number"
            min={201}
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
            View map ({result.duplicate_proposal_ids.length + result.duplicate_station_ids.length} điểm)
          </button>
        )}
        {result && (
          <span className="text-sm text-base-content/70">
            Tìm thấy {result.pairs.length} cặp trùng
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
                    Không có cặp trùng nào trong khoảng 200m – {maxM}m
                  </td>
                </tr>
              )}
              {result.pairs.map((pair, idx) => {
                const urlA = viewUrlOf(pair.a);
                const urlB = viewUrlOf(pair.b);
                return (
                  <tr key={idx} className="hover">
                    <td className="text-center">{idx + 1}</td>
                    <td>{labelOf(pair.a)} <span className="badge badge-ghost badge-xs ml-1">{pair.a.status}</span></td>
                    <td>{labelOf(pair.b)} <span className="badge badge-ghost badge-xs ml-1">{pair.b.status}</span></td>
                    <td className="font-medium">{pair.distance_m}m</td>
                    <td className="text-center">
                      <div className="flex gap-1 justify-center">
                        {urlA
                          ? <a className="btn btn-primary btn-xs" href={urlA}>A</a>
                          : <span className="text-base-content/30 text-xs">A</span>}
                        {urlB
                          ? <a className="btn btn-primary btn-xs" href={urlB}>B</a>
                          : <span className="text-base-content/30 text-xs">B</span>}
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
              <h3 className="font-bold text-lg">Bản đồ điểm trùng ({result.duplicate_proposal_ids.length + result.duplicate_station_ids.length} điểm)</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowMap(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <MapView
                readOnly
                highlightIds={{
                  proposals: result.duplicate_proposal_ids,
                  stations: result.duplicate_station_ids
                }}
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
