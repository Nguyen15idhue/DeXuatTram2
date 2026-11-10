const test = require('node:test');
const assert = require('node:assert/strict');
const { _internals } = require('../src/services/proposalSignatureService');

test('only canonical PDF or DOCX files can be signed', () => {
  assert.equal(_internals.isSignableFile({ original_name: 'report.pdf', mime_type: 'application/pdf' }), true);
  assert.equal(_internals.isSignableFile({
    original_name: 'report.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }), true);
  assert.equal(_internals.isSignableFile({ original_name: 'report.doc', mime_type: 'application/msword' }), false);
  assert.equal(_internals.isSignableFile({ original_name: 'report.doc', mime_type: 'application/pdf' }), false);
  assert.equal(_internals.isDocumentReadyForSignature({
    conversion_status: 'PENDING',
    signing_file: { original_name: 'report.docx' }
  }), false);
  assert.equal(_internals.isDocumentReadyForSignature({
    conversion_status: 'FAILED',
    signing_file: { original_name: 'report.docx' }
  }), true);
});

test('one signer may sign once per document, including the same signer on another document', () => {
  assert.equal(_internals.validateDocumentSignerSets([
    { document_id: 11, signers: [{ user_id: 7 }, { user_id: 8 }] },
    { document_id: 12, signers: [{ user_id: 7 }] }
  ]), true);
});

test('duplicate signer boxes are rejected within a document', () => {
  assert.throws(
    () => _internals.validateDocumentSignerSets([
      { document_id: 11, signers: [{ user_id: 7 }, { user_id: 7 }] }
    ]),
    { statusCode: 400 }
  );
});

test('final signed files must map one-to-one to all current documents', () => {
  const active = [{ id: 11 }, { id: 12 }];
  const finals = [
    { document_id: 11, file_id: 101 },
    { document_id: 12, file_id: 102 }
  ];
  assert.equal(_internals.normalizeFinalDocuments(active, finals), finals);
  assert.throws(
    () => _internals.normalizeFinalDocuments(active, finals.slice(0, 1)),
    { statusCode: 400 }
  );
  assert.throws(
    () => _internals.normalizeFinalDocuments(active, [
      { document_id: 11, file_id: 101 },
      { document_id: 11, file_id: 102 }
    ]),
    { statusCode: 400 }
  );
  assert.throws(
    () => _internals.normalizeFinalDocuments(active, [
      { document_id: 11, file_id: 101 },
      { document_id: 12, file_id: 101 }
    ]),
    { statusCode: 400 }
  );
});
