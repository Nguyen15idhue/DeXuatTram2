import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, X, Sparkles, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import MarkdownText from './MarkdownText';

const SUGGESTIONS = [
  'Làm sao để hủy một đề xuất?',
  'Đăng nhập bằng email hay số điện thoại?',
  'Cách tạo đề xuất mới?',
];

const HISTORY_TURNS = 10;
const MAX_STORED_MESSAGES = HISTORY_TURNS * 2;

function SourceCards({ sources }) {
  const hasSrc = Array.isArray(sources) && sources.length > 0;
  if (!hasSrc) return null;
  return (
    <div className="mt-2 pt-2 border-t border-base-300/40 space-y-1.5">
      <p className="text-xs opacity-70">Bài liên quan:</p>
      {sources.map((s) => (
        <Link
          key={s.slug}
          to={`/huong-dan${s.category ? `?s=${encodeURIComponent(s.category)}` : ''}#${s.slug}`}
          className="flex items-center gap-2 rounded-lg border border-base-300/60 bg-base-100/60 p-1.5 hover:bg-base-200 transition-colors"
          title={s.title}
        >
          {s.images && s.images[0]
            ? <img src={s.images[0]} alt="" className="w-12 h-9 rounded object-cover border border-base-300 shrink-0" loading="lazy" />
            : <span className="w-12 h-9 rounded bg-base-300/60 flex items-center justify-center text-[10px] opacity-60 shrink-0">#{s.id}</span>}
          <span className="min-w-0">
            <span className="block text-xs font-medium truncate">{s.title}</span>
            <span className="block text-[10px] opacity-60 truncate">#{s.id}{s.route ? ` · ${s.route}` : ''}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function AssistantChat({ variant = 'floating' }) {
  const { token, user } = useAuth();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const persistRef = useRef(true);
  const storageKey = `assistant_chat_history:${user?.id || 'guest'}`;

  useEffect(() => {
    let cancelled = false;
    api.get('/assistant/status')
      .then((res) => { if (!cancelled && res && res.success) setAvailable(!!res.data.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    persistRef.current = false;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setMessages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (persistRef.current === false) {
      persistRef.current = true;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
    } catch { /* silent */ }
  }, [messages, storageKey]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, open]);

  const resetConversation = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch { /* silent */ }
  }, [storageKey]);

  const send = useCallback(async (text) => {
    const question = String(text !== undefined ? text : input).trim();
    if (!question || loading) return;
    setInput('');
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'bot')
      .map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.role === 'user' ? m.text : (m.answer || '') }))
      .filter((m) => m.content)
      .slice(-MAX_STORED_MESSAGES);
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const body = { question, history };
      const res = token
        ? await api.postWithAuth('/assistant/ask', body, token)
        : await api.post('/assistant/ask', body);
      if (res && res.success) {
        setMessages((m) => [...m, { role: 'bot', ...res.data }]);
      } else {
        setMessages((m) => [...m, { role: 'bot', answer: (res && res.message) || 'Không trả lời được, thử lại sau.', sources: [] }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'bot', answer: 'Lỗi kết nối, thử lại sau.', sources: [] }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, token, messages]);

  if (!available) return null;

  const inline = variant === 'inline';
  const panelPos = inline ? 'bottom-24 right-4' : 'bottom-6 right-6';

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={inline
            ? 'map-fab assistant-fab'
            : 'fixed bottom-6 right-6 z-[1002] btn btn-primary btn-circle shadow-lg'}
          title="Hỏi trợ lý hướng dẫn"
          style={inline ? { color: '#7c3aed' } : { width: 60, height: 60, minHeight: 60 }}
        >
          <MessageCircle size={28} />
        </button>
      )}

      {open && (
        <div className={`fixed z-[1002] bg-base-100 border border-base-300 rounded-xl shadow-2xl flex flex-col w-[min(92vw,390px)] h-[min(72vh,560px)] ${panelPos}`}>
          <div className="flex items-center gap-2 p-3 border-b border-base-300">
            <Sparkles size={16} className="text-primary" />
            <span className="font-semibold text-sm">Trợ lý hướng dẫn</span>
            <div className="ml-auto flex items-center gap-1">
              <Link to="/huong-dan" className="btn btn-xs btn-ghost" title="Mở trang hướng dẫn đầy đủ">Hướng dẫn</Link>
              <button type="button" className="btn btn-xs btn-ghost" title="Cuộc trò chuyện mới (xóa lịch sử chat)" onClick={resetConversation}><RefreshCw size={13} /></button>
              <button type="button" className="btn btn-xs btn-ghost" title="Đóng" onClick={() => setOpen(false)}><X size={14} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-base-content/60">Hỏi mình về cách dùng hệ thống. Mình trả lời dựa trên tài liệu hướng dẫn và kèm bài viết liên quan.</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="btn btn-xs btn-outline btn-block justify-start" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="chat chat-end">
                  <div className="chat-bubble chat-bubble-primary text-sm">{m.text}</div>
                </div>
              ) : (
                <div key={i} className="chat chat-start">
                  <div className="chat-bubble text-sm max-w-full">
                    {m.answer ? <MarkdownText text={m.answer} /> : null}
                    {m.provider && (
                      <span className={`badge badge-xs ml-1 ${m.provider === 'gemini' ? 'badge-info' : 'badge-secondary'}`}>
                        {m.provider === 'gemini' ? 'Gemini' : 'OpenRouter'}
                      </span>
                    )}
                    {m.cached && <span className="badge badge-xs badge-ghost ml-1">cache</span>}
                    <SourceCards sources={m.sources} />
                  </div>
                </div>
              )
            ))}
            {loading && <div className="chat chat-start"><div className="chat-bubble text-sm"><span className="loading loading-dots loading-sm" /></div></div>}
            <div ref={endRef} />
          </div>

          <div className="p-3 border-t border-base-300 flex items-center gap-2">
            <input
              className="input input-bordered input-sm flex-1"
              placeholder="Nhập câu hỏi..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              disabled={loading}
            />
            <button type="button" className="btn btn-sm btn-primary btn-circle" onClick={() => send()} disabled={loading || !input.trim()}><Send size={14} /></button>
          </div>
        </div>
      )}
    </>
  );
}
