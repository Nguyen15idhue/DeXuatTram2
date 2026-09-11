import { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { oneOfficeSyncService, adminProposalService } from '../../services/api';
import Toast from '../Toast';
import { Send, Download, Link2, Search, CheckCircle, XCircle, Loader2, X, RefreshCw, Eye, FileText } from 'lucide-react';

const SyncPanel = ({ configId, onClose }) => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('push');
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [loading, setLoading] = useState(false);

  const [pushState, setPushState] = useState({
    proposals: [],
    selected: [],
    loadingProposals: false,
    preview: null,
    pushing: false
  });

  const [pullState, setPullState] = useState({
    filter: '',
    pulling: false
  });

  const [linkState, setLinkState] = useState({
    query: '',
    results: [],
    searching: false,
    linking: false,
    selectedContact: null,
    linkingProposalId: ''
  });

  const [previewState, setPreviewState] = useState({
    proposalId: '',
    loading: false,
    html: '',
    files: []
  });

  const loadProposals = useCallback(async () => {
    setPushState(prev => ({ ...prev, loadingProposals: true }));
    try {
      const res = await adminProposalService.getAll('', token);
      if (res.success) {
        const list = (res.data || []).filter(p => !p.contact_1office_code);
        setPushState(prev => ({ ...prev, proposals: list, loadingProposals: false }));
      }
    } catch {
      setPushState(prev => ({ ...prev, loadingProposals: false }));
    }
  }, [token]);

  const handlePush = async () => {
    if (pushState.selected.length === 0) {
      setToast({ message: 'Chọn ít nhất 1 đề xuất', type: 'error' });
      return;
    }
    setPushState(prev => ({ ...prev, pushing: true }));
    try {
      const res = await oneOfficeSyncService.push({
        apiConfigId: configId,
        proposalIds: pushState.selected
      }, token);
      if (res.success) {
        const created = res.data.filter(r => r.success).length;
        const failed = res.data.filter(r => !r.success);
        const warnings = res.data.flatMap(r => r.warnings || []);
        const parts = [`Tạo ${created} job`];
        if (failed.length > 0) parts.push(`${failed.length} lỗi`);
        if (warnings.length > 0) parts.push(`${warnings.length} cảnh báo (nhân sự chưa có tài khoản 1Office)`);
        setToast({ message: parts.join(', '), type: warnings.length > 0 ? 'warning' : 'success' });
        setPushState(prev => ({ ...prev, selected: [], pushing: false }));
        loadProposals();
      } else {
        setToast({ message: res.message || 'Lỗi push', type: 'error' });
        setPushState(prev => ({ ...prev, pushing: false }));
      }
    } catch (e) {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
      setPushState(prev => ({ ...prev, pushing: false }));
    }
  };

  const handlePull = async () => {
    setPullState(prev => ({ ...prev, pulling: true }));
    try {
      const res = await oneOfficeSyncService.pull({
        apiConfigId: configId,
        filter: pullState.filter ? { type: pullState.filter } : {}
      }, token);
      if (res.success) {
        setToast({ message: `Pull job #${res.data.jobId} đã tạo`, type: 'success' });
      } else {
        setToast({ message: res.message || 'Lỗi pull', type: 'error' });
      }
    } catch (e) {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    } finally {
      setPullState(prev => ({ ...prev, pulling: false }));
    }
  };

  const handleSearchContacts = async () => {
    if (!linkState.query.trim()) return;
    setLinkState(prev => ({ ...prev, searching: true }));
    try {
      const res = await oneOfficeSyncService.searchContacts(configId, linkState.query, token);
      if (res.success) {
        setLinkState(prev => ({ ...prev, results: res.data.contacts || [], searching: false }));
      } else {
        setLinkState(prev => ({ ...prev, searching: false }));
        setToast({ message: res.message || 'Lỗi tìm contacts', type: 'error' });
      }
    } catch {
      setLinkState(prev => ({ ...prev, searching: false }));
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
    }
  };

  const handleLink = async () => {
    if (!linkState.selectedContact || !linkState.linkingProposalId) {
      setToast({ message: 'Chọn contact và proposal', type: 'error' });
      return;
    }
    setLinkState(prev => ({ ...prev, linking: true }));
    try {
      const res = await oneOfficeSyncService.link({
        proposalId: parseInt(linkState.linkingProposalId),
        contactCode: linkState.selectedContact.code,
        apiConfigId: configId
      }, token);
      if (res.success) {
        setToast({ message: 'Liên kết thành công', type: 'success' });
        setLinkState(prev => ({ ...prev, selectedContact: null, linkingProposalId: '', linking: false, query: '', results: [] }));
      } else {
        setToast({ message: res.message || 'Lỗi link', type: 'error' });
        setLinkState(prev => ({ ...prev, linking: false }));
      }
    } catch (e) {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
      setLinkState(prev => ({ ...prev, linking: false }));
    }
  };

  const toggleSelectProposal = (id) => {
    setPushState(prev => ({
      ...prev,
      selected: prev.selected.includes(id) ? prev.selected.filter(x => x !== id) : [...prev.selected, id]
    }));
  };

  const selectAll = () => {
    setPushState(prev => ({
      ...prev,
      selected: prev.selected.length === prev.proposals.length ? [] : prev.proposals.map(p => p.id)
    }));
  };

  const handlePreview = async () => {
    if (!previewState.proposalId) {
      setToast({ message: 'Nhập ID proposal', type: 'error' });
      return;
    }
    setPreviewState(prev => ({ ...prev, loading: true }));
    try {
      const res = await oneOfficeSyncService.previewDesc(configId, parseInt(previewState.proposalId), token);
      if (res.success) {
        setPreviewState(prev => ({ ...prev, html: res.data.html, loading: false }));
      } else {
        setToast({ message: res.message || 'Lỗi preview', type: 'error' });
        setPreviewState(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setToast({ message: 'Lỗi kết nối server', type: 'error' });
      setPreviewState(prev => ({ ...prev, loading: false }));
    }
  };

  const tabs = [
    { key: 'push', label: 'Push', icon: Send, desc: 'Gửi đề xuất sang 1Office' },
    { key: 'pull', label: 'Pull', icon: Download, desc: 'Đồng bộ từ 1Office' },
    { key: 'link', label: 'Link', icon: Link2, desc: 'Liên kết đề xuất - contact' },
    { key: 'preview', label: 'Preview', icon: Eye, desc: 'Xem trước HTML desc' }
  ];

  return (
    <div className="border border-base-300 rounded-lg p-4 bg-base-200/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RefreshCw size={18} className="text-primary" />
          <h3 className="font-bold">Sync Operations</h3>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="tabs tabs-boxed mb-4 bg-base-100">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`tab gap-1 ${activeTab === tab.key ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'push' && (
        <div>
          <p className="text-sm text-base-content/60 mb-3">Chọn đề xuất chưa liên kết để gửi sang 1Office</p>
          <div className="flex gap-2 mb-3">
            <button className="btn btn-outline btn-sm gap-1" onClick={loadProposals} disabled={pushState.loadingProposals}>
              <RefreshCw size={14} className={pushState.loadingProposals ? 'animate-spin' : ''} />
              Tải đề xuất
            </button>
            {pushState.proposals.length > 0 && (
              <button className="btn btn-ghost btn-xs" onClick={selectAll}>
                {pushState.selected.length === pushState.proposals.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            )}
          </div>

          {pushState.proposals.length > 0 && (
            <div className="max-h-60 overflow-y-auto border border-base-300 rounded bg-base-100 mb-3">
              {pushState.proposals.map(p => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-base-200 cursor-pointer border-b border-base-200 last:border-0">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={pushState.selected.includes(p.id)}
                    onChange={() => toggleSelectProposal(p.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.owner_name || `#${p.id}`}</div>
                    <div className="text-xs text-base-content/50">{p.address || 'Chưa có địa chỉ'}</div>
                  </div>
                  <span className="text-xs text-base-content/40">#{p.id}</span>
                </label>
              ))}
            </div>
          )}

          {pushState.selected.length > 0 && (
            <div className="alert alert-info py-2 mb-3">
              <span className="text-sm">Đã chọn {pushState.selected.length} đề xuất</span>
            </div>
          )}

          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={handlePush}
            disabled={pushState.selected.length === 0 || pushState.pushing}
          >
            {pushState.pushing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Gửi sang 1Office
          </button>
        </div>
      )}

      {activeTab === 'pull' && (
        <div>
          <p className="text-sm text-base-content/60 mb-3">Đồng bộ contacts từ 1Office về hệ thống</p>
          <div className="flex gap-2 mb-3">
            <select
              className="select select-bordered select-sm flex-1"
              value={pullState.filter}
              onChange={(e) => setPullState(prev => ({ ...prev, filter: e.target.value }))}
            >
              <option value="">Tất cả</option>
              <option value="personal">Cá nhân</option>
              <option value="company">Công ty</option>
            </select>
          </div>
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={handlePull}
            disabled={pullState.pulling}
          >
            {pullState.pulling ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Đồng bộ
          </button>
        </div>
      )}

      {activeTab === 'link' && (
        <div>
          <p className="text-sm text-base-content/60 mb-3">Liên kết đề xuất với contact có sẵn trên 1Office</p>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              className="input input-bordered input-sm flex-1"
              placeholder="Tìm contact theo tên/mã..."
              value={linkState.query}
              onChange={(e) => setLinkState(prev => ({ ...prev, query: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchContacts()}
            />
            <button className="btn btn-outline btn-sm gap-1" onClick={handleSearchContacts} disabled={linkState.searching}>
              <Search size={14} />
              Tìm
            </button>
          </div>

          {linkState.results.length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-base-300 rounded bg-base-100 mb-3">
              {linkState.results.map(c => (
                <label key={c.code} className="flex items-center gap-2 px-3 py-2 hover:bg-base-200 cursor-pointer border-b border-base-200 last:border-0">
                  <input
                    type="radio"
                    name="contact"
                    className="radio radio-sm radio-primary"
                    checked={linkState.selectedContact?.code === c.code}
                    onChange={() => setLinkState(prev => ({ ...prev, selectedContact: c }))}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name || c.code}</div>
                    <div className="text-xs text-base-content/50">{c.code}</div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {linkState.selectedContact && (
            <div className="alert alert-success py-2 mb-3">
              <CheckCircle size={16} />
              <span className="text-sm">Đã chọn: {linkState.selectedContact.name || linkState.selectedContact.code}</span>
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <input
              type="number"
              className="input input-bordered input-sm flex-1"
              placeholder="ID đề xuất cần liên kết"
              value={linkState.linkingProposalId}
              onChange={(e) => setLinkState(prev => ({ ...prev, linkingProposalId: e.target.value }))}
            />
          </div>

          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={handleLink}
            disabled={!linkState.selectedContact || !linkState.linkingProposalId || linkState.linking}
          >
            {linkState.linking ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Liên kết
          </button>
        </div>
      )}

      {activeTab === 'preview' && (
        <div>
          <p className="text-sm text-base-content/60 mb-3">Xem trước HTML desc sẽ được gửi sang 1Office</p>
          <div className="flex gap-2 mb-3">
            <input
              type="number"
              className="input input-bordered input-sm flex-1"
              placeholder="Proposal ID"
              value={previewState.proposalId}
              onChange={(e) => setPreviewState(prev => ({ ...prev, proposalId: e.target.value }))}
            />
            <button
              className="btn btn-primary btn-sm gap-1"
              onClick={handlePreview}
              disabled={previewState.loading || !previewState.proposalId}
            >
              {previewState.loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              Xem trước
            </button>
          </div>

          {previewState.html && (
            <div className="border border-base-300 rounded bg-base-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} className="text-primary" />
                <span className="text-sm font-medium">HTML Preview</span>
                <span className="text-xs text-base-content/50">({previewState.html.length} chars)</span>
              </div>
              <div
                className="bg-white p-4 rounded border border-base-300 overflow-auto max-h-96"
                dangerouslySetInnerHTML={{ __html: previewState.html }}
              />
            </div>
          )}
        </div>
      )}

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: toast.type })} />
    </div>
  );
};

export default SyncPanel;
