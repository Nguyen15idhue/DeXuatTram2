import { useState } from 'react';
import FileViewer from '../dynamic/FileViewer';
import { FileText } from 'lucide-react';
import ProposalReportSummary from './ProposalReportSummary';
import { getReportFiles } from '../../utils/proposalApproval';

const ProposalApprovalSummary = ({ record }) => {
  const [viewing, setViewing] = useState(null);
  if (!record) return null;

  const reportFiles = getReportFiles(record);

  return (
    <div className="space-y-2">
      <ProposalReportSummary record={record} />

      <div className="border rounded-lg p-3 bg-base-100">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={14} />
          <p className="text-sm font-semibold">File tờ trình BCĐX</p>
        </div>
        {reportFiles.length === 0 ? (
          <p className="text-sm text-base-content/60">Chưa có file tờ trình BCĐX</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {reportFiles.map((file) => (
              <button
                key={file.id}
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
        <FileViewer file={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
};

export default ProposalApprovalSummary;
