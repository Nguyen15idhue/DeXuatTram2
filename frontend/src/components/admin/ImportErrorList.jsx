const merge = (errors, failures) => {
  const fromPreview = (errors || []).map(e => ({
    row: e.row,
    msgs: Array.isArray(e.errors) ? e.errors : [e.error].filter(Boolean),
  }));
  const fromConfirm = (failures || []).map(e => ({
    row: e.row,
    msgs: [e.error].filter(Boolean),
  }));
  return [...fromPreview, ...fromConfirm];
};

const ImportErrorList = ({ errors = [], failures = [], warnings = [], maxShow = 20 }) => {
  const list = merge(errors, failures);
  const warnList = (warnings || []).map(w => ({
    row: w.row,
    msgs: Array.isArray(w.warnings) ? w.warnings : [w.warning || w.error].filter(Boolean),
  })).filter(w => w.msgs.length > 0);
  if (list.length === 0 && warnList.length === 0) return null;

  return (
    <>
    {list.length > 0 && (
    <div className="alert alert-error text-sm items-start max-h-56 overflow-auto">
      <div className="w-full">
        <div className="font-semibold mb-1">Chi tiết lỗi ({list.length} dòng)</div>
        <ul className="list-disc pl-5 space-y-0.5">
          {list.slice(0, maxShow).map((e, i) => (
            <li key={i}>
              <b>Dòng {e.row}:</b> {e.msgs.join('; ')}
            </li>
          ))}
          {list.length > maxShow && <li>… và {list.length - maxShow} dòng khác</li>}
        </ul>
      </div>
    </div>
    )}
    {warnList.length > 0 && (
    <div className="alert alert-warning text-sm items-start max-h-56 overflow-auto mt-2">
      <div className="w-full">
        <div className="font-semibold mb-1">Cảnh báo trùng vị trí ({warnList.length} dòng) — vẫn cho import</div>
        <ul className="list-disc pl-5 space-y-0.5">
          {warnList.slice(0, maxShow).map((e, i) => (
            <li key={i}>
              <b>Dòng {e.row}:</b> {e.msgs.join('; ')}
            </li>
          ))}
          {warnList.length > maxShow && <li>… và {warnList.length - maxShow} dòng khác</li>}
        </ul>
      </div>
    </div>
    )}
    </>
  );
};

export default ImportErrorList;
