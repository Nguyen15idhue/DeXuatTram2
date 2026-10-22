import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { proposalSignatureService } from '../../services/api';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import Pagination from '../Pagination';
import Toast from '../Toast';
import ProposalSignatureDetailModal from './ProposalSignatureDetailModal';
import ProposalSignedFileModal from './ProposalSignedFileModal';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import {
  getModelLabel,
  formatProposalCost,
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import {
  formatChotTotal,
  formatChotTruRows,
  getSignStatusColor,
  getSignStatusLabel,
  SIGN_STATUS_HINTS
} from '../../utils/proposalSignature';
import { Download, Eye, FileUp, PenSquare, Search, X } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const StatusBadge = ({ code, optionMap }) => {
  if (!code) return <span className="field-empty">-</span>;
  const option = optionMap[code];
  const color = option?.color || '#64748b';
  return (
    <span
      className="badge badge-sm whitespace-nowrap"
      style={{ backgroundColor: `${color}1a`, color, borderColor: color }}
    >
      {option?.label || code}
    </span>
  );
};

const SignStatusBadge = ({ code }) => {
  const color = getSignStatusColor(code);
  return (
    <span
      className="badge badge-sm whitespace-nowrap"
      style={{ backgroundColor: `${color}1a`, color, borderColor: color }}
      title={SIGN_STATUS_HINTS[code] || ''}
    >
      {getSignStatusLabel(code)}
    </span>
  );
};

const ProposalSignatureTab = ({ tab, onMeta }) => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const viewId = useDefaultViewId('station_proposals', PROPOSALS_VIEW_ID);
  const { getSelectOptions } = useFieldOptions('station_proposals', ['mo_hinh_dau_tu', 'status']);

  const modelOptions = getSelectOptions('mo_hinh_dau_tu');
  const statusOptions = getSelectOptions('status');
  const statusOptionMap = useMemo(() => {
    const map = {};
    (statusOptions || []).forEach((option) => { map[option.value] = option; });
    return map;
  }, [statusOptions]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const [detailModal, setDetailModal] = useState({ open: false, record: null, initialReject: false });
  const [signedModal, setSignedModal] = useState({ open: false, record: null });
  const [meta, setMeta] = useState({ isAdmin: false, isBackOffice: false, isTgd: false, isManager: false });

  const loadItems = useCallback(async (targetPage = 1, targetSize = pageSize, targetSearch = debouncedSearch) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      if (targetSearch) params.set('search', targetSearch);
      params.set('page', targetPage);
      params.set('limit', targetSize);
      const res = await proposalSignatureService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: targetSize, total: 0, totalPages: 0 });
      if (onMeta && res?.meta) {
        const nextMeta = {
          isAdmin: !!res.meta.isAdmin,
          isBackOffice: !!res.meta.isBackOffice,
          isTgd: !!res.meta.isTgd,
          isManager: !!res.meta.isManager
        };
        setMeta(nextMeta);
        onMeta(nextMeta);
      }
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách đề xuất');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, tab, pageSize, debouncedSearch]);

  useEffect(() => {
    setPage(1);
    loadItems(1);
  }, [tab, debouncedSearch]);

  const openDetail = (record) => setDetailModal({ open: true, record, initialReject: false });

  const openReject = (record) => setDetailModal({ open: true, record, initialReject: true });

  const goSigning = (record) => navigate(`/admin/proposals/ky-bcdx/${record.id}`);

  const handleExport = async (record) => {
    try {
      const res = await proposalSignatureService.getExportFile(record.id, token);
      const file = res?.data;
      if (!file?.file_id) {
        setToastType('warning');
        setToastMessage('Đề xuất chưa có file để xuất');
        return;
      }
      window.open(`${API_URL}/files/${file.file_id}/download?token=${encodeURIComponent(token || '')}`, '_blank');
    } catch (err) {
      setToastType('error');
      setToastMessage(err?.message || 'Không xuất được file');
    }
  };

  const handleRejected = () => {
    setDetailModal({ open: false, record: null });
    setToastType('success');
    setToastMessage('Đã từ chối duyệt và gửi yêu cầu cập nhật lại BCĐX');
    loadItems(page, pageSize);
  };

  const handleSignedFileUploaded = () => {
    setSignedModal({ open: false, record: null });
    setToastType('success');
    setToastMessage('Đã tải lên file BCĐX đã ký — đề xuất hoàn thành');
    loadItems(page, pageSize);
  };

  const colCount = 14;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="input input-bordered flex items-center gap-2 input-sm w-64">
          <Search size={14} />
          <input
            className="grow"
            placeholder="Tìm mã, pháp nhân, SĐT, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-error text-sm">{error}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table table-sm table-zebra min-w-[1700px]">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã đề xuất</th>
                  <th>Tên pháp nhân</th>
                  <th>SĐT liên hệ</th>
                  <th>Mô hình đầu tư</th>
                  <th>Địa chỉ chi tiết</th>
                  <th>Quy mô trụ đề xuất</th>
                  <th>Tổng chi phí dự kiến</th>
                  <th>Người đề xuất</th>
                  <th>Trạng thái</th>
                  <th>Ghi chú</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="text-center text-base-content/60 py-6">
                      Không có đề xuất nào phù hợp
                    </td>
                  </tr>
                ) : (
                  items.map((row, index) => (
                    <tr key={row.id}>
                      <td>{(page - 1) * pageSize + index + 1}</td>
                      <td>
                        <ProposalCodeLink
                          id={row.id}
                          code={row.ma_de_xuat || `#${row.id}`}
                          onOpen={() => openDetail(row)}
                        />
                      </td>
                      <td>{getProposalLegalName(row)}</td>
                      <td>{getProposalPhone(row)}</td>
                      <td>{getModelLabel(row.mo_hinh_dau_tu, modelOptions)}</td>
                      <td className="min-w-[220px]">{getProposalAddress(row)}</td>
                      <td>{formatProposalScale(row)}</td>
                      <td>{formatProposalCost(row)}</td>
                      <td>
                        <ProposalPersonLink id={row.user_id} name={row.user_name} />
                      </td>
                      <td><StatusBadge code={row.status} optionMap={statusOptionMap} /></td>
                      <td><SignStatusBadge code={row.sign_status} /></td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs gap-1"
                            title="Xem chi tiết hồ sơ trình ký"
                            onClick={() => openDetail(row)}
                          >
                            <Eye size={14} />
                            Xem chi tiết
                          </button>
                          {tab === 'pending' && row.status === 'SIGNATURE_PENDING' && (
                            <button
                              type="button"
                              className="btn btn-xs btn-primary gap-1"
                              title="Ký ngay BCĐX"
                              onClick={() => goSigning(row)}
                            >
                              <PenSquare size={14} />
                              Ký ngay
                            </button>
                          )}
                          {tab === 'all' && row.status === 'SIGNATURE_PENDING' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-xs btn-success gap-1"
                                title="Ký duyệt BCĐX"
                                onClick={() => goSigning(row)}
                              >
                                <PenSquare size={14} />
                                Ký duyệt
                              </button>
                              {(meta.isAdmin || meta.isTgd) && (
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline btn-error"
                                  title="Từ chối duyệt BCĐX"
                                  onClick={() => openReject(row)}
                                >
                                  Từ chối duyệt
                                </button>
                              )}
                            </>
                          )}
                          {tab === 'chairman' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs gap-1"
                                title="Xuất file PDF đã ký"
                                onClick={() => handleExport(row)}
                              >
                                <Download size={14} />
                                Xuất file PDF
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-primary gap-1"
                                title="Tải lên file BCĐX chủ tịch đã ký"
                                onClick={() => setSignedModal({ open: true, record: row })}
                              >
                                <FileUp size={14} />
                                Upload file đã ký
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={(p) => { setPage(p); loadItems(p); }}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); loadItems(1, s); }}
          />
        </>
      )}

      <ProposalSignatureDetailModal
        open={detailModal.open}
        record={detailModal.record}
        initialReject={detailModal.initialReject}
        onClose={() => setDetailModal({ open: false, record: null, initialReject: false })}
        onRejected={handleRejected}
      />

      <ProposalSignedFileModal
        open={signedModal.open}
        record={signedModal.record}
        onClose={() => setSignedModal({ open: false, record: null })}
        onSaved={handleSignedFileUploaded}
      />

      <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
    </div>
  );
};

export default ProposalSignatureTab;
