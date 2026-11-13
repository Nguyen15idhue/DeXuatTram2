export const documentFile = (document) => document?.recovery_file || document?.signing_file || document?.pdf_file || document?.source_file;

export const fileName = (file) => file?.original_name || file?.name || `File #${file?.id || ''}`;

export const isUnsupportedSigningFile = (file) =>
  /\.doc$/i.test(fileName(file)) || file?.mime_type === 'application/msword';

export const isDocumentAwaitingConversion = (document) =>
  !!document && (document.conversion_status !== 'READY'
    || documentFile(document)?.mime_type !== 'application/pdf');

export const ensureDocumentResponse = (response) => {
  if (response?.success === false) {
    const error = new Error(response.message || 'Không thực hiện được thao tác');
    error.data = response.data;
    throw error;
  }
  return response;
};

export const getDocumentSigners = (document, signers = []) =>
  document.signers || signers.filter((signer) => String(signer.document_id) === String(document.id));
