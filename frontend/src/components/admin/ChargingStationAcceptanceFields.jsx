import { useState } from 'react';
import FileUpload from '../dynamic/FileUpload';
import FileViewer from '../dynamic/FileViewer';
import { useAuth } from '../../contexts/AuthContext';

const KINDS = [{ key: 'EQUIPMENT', label: 'Nghiệm thu thiết bị' }, { key: 'INFRASTRUCTURE', label: 'Nghiệm thu hạ tầng' }];
const DOCUMENT_MIMES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const acceptancePayload = reports => {
  const result = {};
  for (const { key, label } of KINDS) {
    const report = reports[key];
    if (!report?.file?.id) throw new Error(`${label}: bắt buộc File nghiệm thu PDF/Word`);
    if ((report.images || []).length < 2) throw new Error(`${label}: cần ít nhất 2 ảnh nghiệm thu`);
    result[key === 'EQUIPMENT' ? 'equipment' : 'infrastructure'] = {
      file_id: report.file.id, image_ids: report.images.map(file => file.id), note: report.note || null
    };
  }
  return result;
};

const ChargingStationAcceptanceFields = ({ value = {}, onChange, disabled, readOnly = false, onUploadingChange }) => {
  const { token } = useAuth();
  const [viewing, setViewing] = useState(null);
  const patch = (key, changes) => onChange?.(current => ({ ...current, [key]: { ...(current[key] || {}), ...changes } }));
  return <>
    <div className="grid gap-4 md:grid-cols-2">
      {KINDS.map(({ key, label }) => {
        const report = value[key] || {};
        return <section key={key} className="min-w-0 space-y-3 rounded-lg border border-base-300 p-3">
          <h3 className="font-semibold">{label}</h3>
          {readOnly ? <>
            <div className="space-y-2">{[report.file, ...(report.images || [])].filter(Boolean).map(file =>
              <button key={file.id} type="button" className="link link-primary block text-left break-all"
                onClick={() => setViewing(file)}>{file.original_name || `Tệp #${file.id}`}</button>)}</div>
            {!report.file && <p className="text-sm text-base-content/60">Chưa có hồ sơ theo mẫu mới.</p>}
            <p className="whitespace-pre-wrap text-sm">Ghi chú: {report.note || '—'}</p>
          </> : <>
            <div><p className="mb-1 text-sm">File nghiệm thu <span className="text-error">*</span> (PDF/Word, tối đa 10 MB)</p>
              <FileUpload value={report.file || null} disabled={disabled} accept=".pdf,.doc,.docx"
                validateFile={file => DOCUMENT_MIMES.includes(file.type)}
                onChange={file => patch(key, { file })} onPreviewFile={setViewing}
                onUploadingChange={uploading => onUploadingChange?.(`${key}_file`, uploading)} /></div>
            <div><p className="mb-1 text-sm">Ảnh nghiệm thu <span className="text-error">*</span> (ít nhất 2 ảnh)</p>
              <FileUpload multiple value={report.images || []} disabled={disabled} accept="image/jpeg,image/png,image/webp,image/gif"
                fileConfig={{ maxFiles: 100, maxSize: 10 }} validateFile={file => IMAGE_MIMES.includes(file.type)}
                onChange={images => patch(key, { images })} onPreviewFile={setViewing}
                onUploadingChange={uploading => onUploadingChange?.(`${key}_images`, uploading)} /></div>
            <label className="block text-sm">Ghi chú<textarea className="textarea textarea-bordered mt-1 w-full"
              maxLength={5000} disabled={disabled} value={report.note || ''}
              onChange={event => patch(key, { note: event.target.value })} /></label>
          </>}
        </section>;
      })}
    </div>
    {viewing && <div onClick={event => event.stopPropagation()}>
      <FileViewer file={viewing} token={token} fullScreen onClose={() => setViewing(null)} />
    </div>}
  </>;
};

export default ChargingStationAcceptanceFields;
