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

const ImportErrorList = ({ errors = [], failures = [], maxShow = 20 }) => {
  const list = merge(errors, failures);
  if (list.length === 0) return null;

  return (
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
  );
};

export default ImportErrorList;
