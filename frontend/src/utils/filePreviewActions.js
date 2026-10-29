import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const getFileUrl = (file) => {
  if (file?.url) return file.url;
  if (file?.id) return `${API_URL}/files/${file.id}/download`;
  return null;
};

const fetchFileResponse = async (file, token) => {
  const url = getFileUrl(file);
  if (!url) throw new Error('Không tìm thấy đường dẫn tải file');

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Tải file thất bại (HTTP ${response.status})`);
  return response;
};

const getFileName = (file, response) => {
  const disposition = response.headers.get('content-disposition');
  const utf8Match = disposition?.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const standardMatch = disposition?.match(/filename="?([^";]+)"?/i);
  return standardMatch?.[1] || file?.original_name || file?.name || 'download';
};

export const downloadFile = async (file, token) => {
  const response = await fetchFileResponse(file, token);
  saveAs(await response.blob(), getFileName(file, response));
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const sanitizeConvertedHtml = (html) => {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, iframe, object, embed, form, style, link, meta')
    .forEach((element) => element.remove());

  parsed.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || !['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height'].includes(name)) {
        element.removeAttribute(attribute.name);
        return;
      }

      if (name === 'href' && !/^(https?:|mailto:)/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
      if (name === 'src' && !/^(https?:|data:image\/)/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return parsed.body.innerHTML;
};

const isWordFile = (file) => {
  const mime = String(file?.mime_type || '').toLowerCase();
  const name = String(file?.original_name || file?.name || '').toLowerCase();
  return mime.includes('word') || mime.includes('officedocument.wordprocessingml') || /\.(doc|docx)$/.test(name);
};

const isExcelFile = (file) => {
  const mime = String(file?.mime_type || '').toLowerCase();
  const name = String(file?.original_name || file?.name || '').toLowerCase();
  return mime.includes('sheet') || mime.includes('officedocument.spreadsheetml') || mime.includes('excel') || /\.(xls|xlsx|csv)$/.test(name);
};

const buildExcelHtml = (workbook, title) => {
  const sheets = workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    const tableRows = rows.map((row, rowIndex) => {
      const cellTag = rowIndex === 0 ? 'th' : 'td';
      return `<tr>${row.map((cell) => `<${cellTag}>${escapeHtml(cell)}</${cellTag}>`).join('')}</tr>`;
    }).join('');
    return `<h2>${escapeHtml(sheetName)}</h2><table>${tableRows}</table>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>body{font:14px Arial,sans-serif;max-width:1200px;margin:24px auto;padding:0 16px;color:#222}table{border-collapse:collapse;width:100%;margin-bottom:24px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;white-space:pre-wrap}th{background:#eee}h2{font-size:16px}</style>
    </head><body>${sheets}</body></html>`;
};

export const openFileInNewTab = async (file, token) => {
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Trình duyệt đã chặn tab mới. Hãy cho phép cửa sổ bật lên rồi thử lại.');

  try {
    tab.opener = null;
    tab.document.title = 'Đang mở file...';
    tab.document.body.textContent = 'Đang tải file...';

    const response = await fetchFileResponse(file, token);
    const title = file?.original_name || file?.name || 'Tài liệu';
    let previewBlob;

    if (isWordFile(file)) {
      const result = await mammoth.convertToHtml({ arrayBuffer: await response.arrayBuffer() });
      const body = sanitizeConvertedHtml(result.value);
      previewBlob = new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
        <style>body{font:14px Arial,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;line-height:1.6}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}</style>
        </head><body>${body}</body></html>`], { type: 'text/html;charset=utf-8' });
    } else if (isExcelFile(file)) {
      const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
      previewBlob = new Blob([buildExcelHtml(workbook, title)], { type: 'text/html;charset=utf-8' });
    } else {
      previewBlob = await response.blob();
    }

    const objectUrl = URL.createObjectURL(previewBlob);
    tab.location.replace(objectUrl);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10 * 60 * 1000);
  } catch (error) {
    tab.close();
    throw error;
  }
};
