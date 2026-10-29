import { useState } from 'react';
import FileViewer from '../dynamic/FileViewer';
import { Paperclip } from 'lucide-react';
import { formatScore } from '../../utils/proposalGrading';
import { getLayoutFilesForReport } from '../../utils/proposalReport';

const ScoreBlock = ({ title, score, note }) => (
  <div className="border rounded-lg p-3 bg-base-100">
    <p className="text-sm font-semibold mb-1">{title}</p>
    <div className="flex items-center gap-2">
      <span className="text-sm text-base-content/70">Điểm:</span>
      <span className="badge badge-primary badge-sm">{formatScore(score)}</span>
    </div>
    <p className="text-sm mt-1 whitespace-pre-wrap">{note || '(không có)'}</p>
  </div>
);

const ProposalReportSummary = ({ record }) => {
  const [viewing, setViewing] = useState(null);
  if (!record) return null;

  const layoutFiles = getLayoutFilesForReport(record);

  return (
    <div className="border rounded-lg p-3 bg-base-100 space-y-2">
      <p className="font-semibold text-sm">Kết quả đánh giá & bản vẽ layout</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <ScoreBlock
          title="Quy hoạch"
          score={record.quy_hoach_score}
          note={record.quy_hoach_note}
        />
        <ScoreBlock
          title="Pháp lý"
          score={record.phap_ly_score}
          note={record.phap_ly_note}
        />
      </div>

      <div className="border rounded-lg p-3 bg-base-100">
        <div className="flex items-center gap-2 mb-2">
          <Paperclip size={14} />
          <p className="text-sm font-semibold">File layout đã vẽ</p>
        </div>
        {layoutFiles.length === 0 ? (
          <p className="text-sm text-base-content/60">Chưa có file layout</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {layoutFiles.map((file, index) => (
              <button
                key={`${file.id || 'f'}-${index}`}
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setViewing({ id: file.id, original_name: file.name, mime_type: file.mime_type })}
              >
                {file.name || `File #${file.id}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <FileViewer file={viewing} onClose={() => setViewing(null)} fullScreen />
      )}
    </div>
  );
};

export default ProposalReportSummary;
