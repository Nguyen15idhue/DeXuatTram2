import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { proposalReportService } from '../../services/api';
import useDefaultViewId from '../../hooks/useDefaultViewId';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import useFieldOptions from '../../hooks/useFieldOptions';
import Pagination from '../Pagination';
import Toast from '../Toast';
import RecordDetailPopup from './RecordDetailPopup';
import ProposalReportSummary from './ProposalReportSummary';
import ProposalReportUpdateModal from './ProposalReportUpdateModal';
import { ProposalCodeLink, ProposalPersonLink } from './ProposalLinkCells';
import {
  getModelLabel,
  formatProposalCost,
  formatProposalScale,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { canUploadReport, uploadButtonLabel } from '../../utils/proposalReport';
import { Eye, Pencil, Search, X } from 'lucide-react';

const PROPOSALS_VIEW_ID = 8;

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

const ProposalReportTab = ({ tab }) => {
  const { token } = useAuth();
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

  const [detailPopup, setDetailPopup] = useState({ open: false, record: null });
  const [uploadModal, setUploadModal] = useState({ open: false, record: null });

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
      const res = await proposalReportService.getAll(params.toString(), token);
      setItems(res?.data || []);
      setPagination(res?.pagination || { page: targetPage, limit: targetSize, total: 0, totalPages: 0 });
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

  const openDetail = (record) => setDetailPopup({ open: true, record });

  const openUpload = (record) => {
    setDetailPopup({ open: false, record: null });
    setUploadModal({ open: true, record });
  };

  const handleUploaded = (result) => {
    setUploadModal({ open: false, record: null });
    setToastType('success');
    setToastMessage('Đã tải lên tờ trình BCĐX — đề xuất chuyển sang Đang duyệt BCĐX');
    loadItems(page, pageSize);
  };

  const colCount = 12;

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
            <table className="table table-sm table-zebra min-w-[1600px]">
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
                  <th className="min-w-[180px]">Mô tả việc cần làm</th>
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
                      <td className="min-w-[180px]">
                        {row.task_description
                          ? <span className="text-sm">{row.task_description}</span>
                          : <span className="text-base-content/50">-</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs gap-1"
                            title="Xem chi tiết đề xuất"
                            onClick={() => openDetail(row)}
                          >
                            <Eye size={14} />
                            Xem chi tiết
                          </button>
                          {canUploadReport(row) && (
                            <button
                              type="button"
                              className="btn btn-xs btn-primary gap-1"
                              title="Tải lên tờ trình BCĐX"
                              onClick={() => openUpload(row)}
                            >
                              <Pencil size={14} />
                              {uploadButtonLabel(row)}
                            </button>
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

      {detailPopup.open && (
        <RecordDetailPopup
          entity="station_proposals"
          record={detailPopup.record}
          viewId={viewId}
          mode="view"
          allowEdit={false}
          beforeActions={(ctx) => (
            <ProposalReportSummary
              record={detailPopup.record}
              formData={ctx?.formData}
            />
          )}
          onClose={() => setDetailPopup({ open: false, record: null })}
        />
      )}

      <ProposalReportUpdateModal
        open={uploadModal.open}
        record={uploadModal.record}
        onClose={() => setUploadModal({ open: false, record: null })}
        onSaved={handleUploaded}
      />

      <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
    </div>
  );
};

export default ProposalReportTab;
