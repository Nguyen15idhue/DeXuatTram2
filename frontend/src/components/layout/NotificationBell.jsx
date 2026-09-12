import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { notificationService } from '../../services/api';
import { Bell } from 'lucide-react';

const TYPE_COLORS = {
  REJECTED: { bg: '#fee2e2', border: '#ef4444', text: '#b91c1c' },
  APPROVED: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  PENDING: { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
  RESUBMITTED: { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
  REVIEWING: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }
};

export const notifyBellRefresh = () => window.dispatchEvent(new Event('notifications:refresh'));

const NotificationBell = ({ mode = 'user' }) => {
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [blink, setBlink] = useState(false);
  const [tab, setTab] = useState('mine');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 340 });
  const prevCount = useRef(0);
  const btnRef = useRef(null);
  const ddRef = useRef(null);

  const showTabs = mode === 'admin' && isAdmin;

  const loadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await notificationService.unreadCount(token);
      if (res.success) {
        const c = res.data.count || 0;
        if (c > prevCount.current) {
          setBlink(true);
          setTimeout(() => setBlink(false), 4000);
        }
        prevCount.current = c;
        setCount(c);
      }
    } catch { /* silent */ }
  }, [token]);

  const loadList = useCallback(async (which = tab) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = which === 'all'
        ? await notificationService.getAllAdmin(1, 30, token)
        : await notificationService.getAll(1, 20, token);
      if (res.success) setItems(res.data || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [token, tab]);

  useEffect(() => {
    if (!token) return;
    loadCount();
    const t = setInterval(loadCount, 30000);
    const onRefresh = () => loadCount();
    const onVisible = () => { if (document.visibilityState === 'visible') loadCount(); };
    window.addEventListener('notifications:refresh', onRefresh);
    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener('notifications:refresh', onRefresh);
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, loadCount]);

  const updatePos = useCallback(() => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 16);
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
    if (left < 8) left = 8;
    setPos({ top: Math.round(r.bottom + 6), left: Math.round(left), width: Math.round(w) });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onDoc = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (ddRef.current && ddRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      updatePos();
      setTab('mine');
      await loadList('mine');
    }
  };

  const switchTab = async (which) => {
    setTab(which);
    await loadList(which);
  };

  const handleItem = async (n) => {
    if (tab === 'mine' && !n.is_read) {
      try { await notificationService.markRead(n.id, token); } catch { /* silent */ }
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: 1 } : x));
      setCount(c => Math.max(0, c - 1));
      prevCount.current = Math.max(0, prevCount.current - 1);
    }
    setOpen(false);
    if (n.entity_type === 'station_proposals' && n.entity_id) {
      navigate(mode === 'admin' ? `/admin/proposals/view=${n.entity_id}` : `/my-proposals/view=${n.entity_id}`);
    }
  };

  const markAll = async () => {
    try { await notificationService.markAllRead(token); } catch { /* silent */ }
    setItems(prev => prev.map(x => ({ ...x, is_read: 1 })));
    setCount(0);
    prevCount.current = 0;
  };

  const dropdown = open ? createPortal(
    <div
      ref={ddRef}
      className="bell-dropdown"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
    >
      <div className="bell-head">
        {showTabs ? (
          <div className="bell-tabs">
            <button type="button" className={`bell-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => switchTab('mine')}>Của bạn</button>
            <button type="button" className={`bell-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => switchTab('all')}>Tất cả</button>
          </div>
        ) : (
          <span>Thông báo</span>
        )}
        {tab === 'mine' && count > 0 && (
          <button type="button" className="bell-markall" onClick={markAll}>Đánh dấu đã đọc</button>
        )}
      </div>
      <div className="bell-list">
        {loading ? (
          <div className="bell-empty">Đang tải...</div>
        ) : items.length === 0 ? (
          <div className="bell-empty">{tab === 'all' ? 'Không có thông báo' : 'Không có thông báo'}</div>
        ) : (
          items.map(n => {
            const c = TYPE_COLORS[n.type] || TYPE_COLORS.PENDING;
            return (
              <button
                key={n.id}
                type="button"
                className={`bell-item ${tab === 'all' ? '' : (n.is_read ? 'read' : 'unread')}`}
                style={{ borderLeftColor: c.border, background: (tab === 'all' || n.is_read) ? '#fff' : c.bg }}
                onClick={() => handleItem(n)}
              >
                <div className="bell-item-title" style={{ color: c.text }}>
                  {n.title}
                  {tab === 'all' && n.user_name ? <span className="bell-item-who"> → {n.user_name}</span> : null}
                </div>
                {n.message && <div className="bell-item-msg">{n.message}</div>}
                <div className="bell-item-time">{new Date(n.created_at).toLocaleString('vi-VN')}</div>
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="notification-bell" ref={btnRef}>
      <button type="button" className={`bell-btn ${blink ? 'blink' : ''}`} onClick={toggle} title="Thông báo">
        <Bell size={18} />
        {count > 0 && <span className="bell-badge">{count > 99 ? '99+' : count}</span>}
      </button>
      {dropdown}
    </div>
  );
};

export default NotificationBell;
