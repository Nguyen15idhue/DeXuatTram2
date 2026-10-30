import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { chargingStationService } from '../../services/api';
import FileViewer from '../../components/dynamic/FileViewer';
import PageHeader from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui';
import {
  CS_CONTRACT_LABELS,
  CS_CONTRACT_VARIANT,
  CS_FLOW_LABELS,
  CS_FLOW_VARIANT,
  CS_PAYMENT_LABELS,
  CS_STATUS_LABELS,
  CS_STATUS_VARIANT,
  CS_SUB_STATUS_LABELS,
  formatCsDate
} from '../../utils/chargingStation';
import {
  formatProposalCost,
  getProposalAddress,
  getProposalLegalName,
  getProposalPhone
} from '../../utils/proposalGrading';
import { getProposalStatusLabel } from '../../utils/proposalProgress';

const MODEL_LABELS = {
  NQ: 'Nhượng quyền',
  TDT: 'Tự đầu tư',
  LK: 'Liên kết',
  NQ_LK: 'Nhượng quyền + Liên kết'
};

const ACTION_LABELS = {
  created: 'Khởi tạo ON trạm',
  updated: 'Cập nhật thông tin',
  contract_signing_started: 'Bắt đầu ký hợp đồng',
  contract_completed: 'Hoàn tất hợp đồng',
  infrastructure_status_changed: 'Cập nhật trạng thái hạ tầng',
  early_delivery_requested: 'Đề xuất giao trụ sớm',
  poles_exported: 'Xuất trụ khỏi kho',
  delivery_confirmed: 'Xác nhận giao trụ đến nơi',
  installation_started: 'Bắt đầu lắp đặt',
  installation_completed: 'Hoàn tất lắp đặt',
  status_changed: 'Chuyển trạng thái',
  status_rolled_back: 'Lùi bước',
  acceptance_updated: 'Cập nhật nghiệm thu',
  acceptance_passed: 'Nghiệm thu đạt',
  acceptance_failed: 'Nghiệm thu không đạt',
  acceptance_file_uploaded: 'Tải biên bản nghiệm thu',
  configuration_completed: 'Hoàn tất cấu hình ON trạm',
  image_added: 'Thêm ảnh nghiệm thu',
  image_removed: 'Gỡ ảnh nghiệm thu'
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const formatMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString('vi-VN')} đ` : '—';
};

const InfoItem = ({ label, value, children }) => (
  <div className="min-w-0">
    <dt className="text-xs font-semibold text-base-content/60">{label}</dt>
    <dd className="mt-1 break-words text-sm">{children ?? (value || '—')}</dd>
  </div>
);

const Card = ({ title, children }) => (
  <section className="space-y-4 rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
    <h2 className="font-semibold">{title}</h2>
    {children}
  </section>
);

const AdminChargingStationDetailPage = ({ stage = 'khoi-tao-hop-dong' }) => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewingFile, setViewingFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token || !id) return;
      setLoading(true);
      setError('');
      try {
        const response = await chargingStationService.getDetail(id, token);
        if (!cancelled) setRecord(response?.data || null);
      } catch (loadError) {
        if (!cancelled) {
          setRecord(null);
          setError(loadError?.message || 'Không tải được chi tiết trạm sạc');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, token]);

  if (loading) {
    return <div className="flex justify-center py-16"><span className="loading loading-spinner loading-lg" /></div>;
  }

  if (error || !record) {
    return (
      <div className="space-y-4">
        <div className="alert alert-error">{error || 'Không tìm thấy trạm sạc'}</div>
        <button type="button" className="btn btn-ghost gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Quay lại
        </button>
      </div>
    );
  }

  const proposal = record.proposal || {};
  const defaultReturnTab = stage === 'thong-tin-chung' ? 'all' : 'need';
  const returnTo = location.state?.returnTo || `/admin/on-tram/${stage}?tab=${defaultReturnTab}`;
  const historySummary = (entry) => {
    const changes = Object.values(entry.changed_fields || {})
      .map((change) => {
        const label = change.label || 'Thông tin';
        const oldValue = change.old || '—';
        const newValue = change.new || '—';
        return `${label}: ${oldValue} → ${newValue}`;
      });
    return changes.length ? changes.join(' · ') : '';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Trạm sạc ${record.ma_tram || `#${record.id}`}`}
        subtitle={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={CS_STATUS_VARIANT[record.status]}>{CS_STATUS_LABELS[record.status] || record.status}</Badge>
            {record.sub_status && (
              <Badge variant="ghost" outline>{CS_SUB_STATUS_LABELS[record.sub_status] || record.sub_status}</Badge>
            )}
          </div>
        )}
        actions={(
          <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={() => navigate(returnTo)}>
            <ArrowLeft size={16} /> Quay lại danh sách
          </button>
        )}
      />

      <Card title="Thông tin trạm sạc">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="Mã trạm" value={record.ma_tram} />
          <InfoItem label="Mã trạm trên CMS" value={record.cms_station_code} />
          <InfoItem label="Trạng thái hợp đồng">
            <Badge variant={CS_CONTRACT_VARIANT[record.contract_status] || 'ghost'} outline>
              {CS_CONTRACT_LABELS[record.contract_status] || '—'}
            </Badge>
          </InfoItem>
          <InfoItem label="Ngày tạo" value={formatDateTime(record.created_at)} />
          <InfoItem label="Ngày ON thực tế" value={formatCsDate(record.on_date)} />
          <InfoItem label="Hạ tầng điện">
            <Badge variant={CS_FLOW_VARIANT[record.infra_power_status] || 'ghost'} outline>
              {CS_FLOW_LABELS[record.infra_power_status] || '—'}
            </Badge>
          </InfoItem>
          <InfoItem label="Hạ tầng mặt bằng">
            <Badge variant={CS_FLOW_VARIANT[record.infra_site_status] || 'ghost'} outline>
              {CS_FLOW_LABELS[record.infra_site_status] || '—'}
            </Badge>
          </InfoItem>
          <InfoItem label="Tài chính">
            <Badge variant={CS_FLOW_VARIANT[record.payment_status] || 'ghost'} outline>
              {CS_PAYMENT_LABELS[record.payment_status] || '—'}
            </Badge>
          </InfoItem>
          <InfoItem label="Ngày nghiệm thu" value={formatCsDate(record.acceptance_date)} />
          <InfoItem label="Biên bản nghiệm thu">
            {record.acceptance_file_id ? (
              <button
                type="button"
                className="link link-primary inline-flex items-center gap-1 text-left"
                onClick={() => setViewingFile({
                  id: record.acceptance_file_id,
                  original_name: record.acceptance_file_name || `Biên bản nghiệm thu #${record.acceptance_file_id}`,
                  mime_type: 'application/pdf'
                })}
              >
                <FileText size={14} />
                {record.acceptance_file_name || `Biên bản nghiệm thu #${record.acceptance_file_id}`}
              </button>
            ) : '—'}
          </InfoItem>
        </dl>
        {record.contract_file_id && (
          <div className="border-t border-base-300 pt-3">
            <p className="mb-1 text-xs font-semibold text-base-content/60">File hợp đồng</p>
            <button
              type="button"
              className="link link-primary inline-flex items-center gap-1 text-left text-sm"
              onClick={() => setViewingFile({
                id: record.contract_file_id,
                original_name: record.contract_file_name || `Hợp đồng #${record.contract_file_id}`,
                mime_type: record.contract_file_mime_type
              })}
            >
              <FileText size={14} />
              {record.contract_file_name || `Hợp đồng #${record.contract_file_id}`}
            </button>
          </div>
        )}
        {record.description && (
          <div>
            <p className="text-xs font-semibold text-base-content/60">Mô tả</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{record.description}</p>
          </div>
        )}
        {record.note && (
          <div>
            <p className="text-xs font-semibold text-base-content/60">Ghi chú nội bộ</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{record.note}</p>
          </div>
        )}
      </Card>

      {record.delivery_export && (
        <Card title="Thông tin giao trụ và vận chuyển">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Bên vận chuyển" value={record.delivery_export.carrier} />
            <InfoItem label="Mã vận chuyển" value={record.delivery_export.transport_code} />
            <InfoItem label="Trạng thái vận chuyển" value={record.delivery_export.transport_status} />
            <InfoItem label="Ngày xuất kho" value={formatDateTime(record.delivery_export.export_date)} />
            <InfoItem label="Phí vận chuyển" value={formatMoney(record.delivery_export.total_amount)} />
            <InfoItem label="Lý do xuất kho" value={record.delivery_export.reason} />
          </dl>
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr><th>Loại trụ</th><th>Mô hình</th><th>Số lượng xuất</th></tr>
              </thead>
              <tbody>
                {(record.delivery_export.items || []).map((item) => (
                  <tr key={`${item.pole_id}-${item.name}`}>
                    <td>{item.name || `Trụ #${item.pole_id}`}</td>
                    <td>{item.charging_type || '—'}{item.power_kw ? ` · ${item.power_kw} kW` : ''}</td>
                    <td>{Number(item.quantity) || 0}</td>
                  </tr>
                ))}
                {!record.delivery_export.items?.length && (
                  <tr><td colSpan={3} className="text-center text-base-content/60">Phiếu xuất kho không có dòng trụ.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Thông tin chính của đề xuất">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="Mã đề xuất">
            <Link to={`/admin/proposals/chi-tiet/${record.proposal_id}`} className="link link-primary font-mono">
              {proposal.ma_de_xuat || record.ma_de_xuat || `#${record.proposal_id}`}
            </Link>
          </InfoItem>
          <InfoItem label="Trạng thái đề xuất" value={getProposalStatusLabel(proposal.status)} />
          <InfoItem label="Người đề xuất" value={proposal.user_name || proposal.owner_name || record.owner_name} />
          <InfoItem label="Tên pháp nhân" value={getProposalLegalName(proposal)} />
          <InfoItem label="SĐT liên hệ" value={getProposalPhone(proposal) || record.owner_phone} />
          <InfoItem label="Mô hình đầu tư" value={MODEL_LABELS[proposal.mo_hinh_dau_tu] || proposal.mo_hinh_dau_tu} />
          <InfoItem label="Địa chỉ" value={getProposalAddress(proposal) || record.address} />
          <InfoItem label="Tổng chi phí dự kiến" value={formatProposalCost(proposal)} />
          <InfoItem label="Ngày tạo đề xuất" value={formatDateTime(proposal.created_at)} />
        </dl>
      </Card>

      <Card title="Nhật ký hoạt động trạm sạc">
        {record.timeline?.length ? (
          <ol className="space-y-3">
            {record.timeline.map((entry) => (
              <li key={entry.id} className="border-l-2 border-base-300 pl-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <strong className="text-sm">{ACTION_LABELS[entry.action] || entry.action}</strong>
                  <time className="text-xs text-base-content/60">{formatDateTime(entry.created_at)}</time>
                </div>
                <p className="text-xs text-base-content/60">{entry.actor_name || 'Hệ thống'}</p>
                {historySummary(entry) && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{historySummary(entry)}</p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-base-content/60">Chưa có nhật ký hoạt động.</p>
        )}
      </Card>

      {viewingFile && <FileViewer file={viewingFile} onClose={() => setViewingFile(null)} fullScreen />}
    </div>
  );
};

export default AdminChargingStationDetailPage;
