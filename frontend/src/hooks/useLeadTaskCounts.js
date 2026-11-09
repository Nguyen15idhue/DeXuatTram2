import { useCallback, useEffect, useRef, useState } from 'react';
import { leadService } from '../services/api';
import { LEAD_TASK_COUNTS_CHANGED_EVENT } from '../utils/leadTaskCounts';

export default function useLeadTaskCounts(token, enabled) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!token || !enabled) return;
    const current = ++sequence.current;
    try {
      const response = await leadService.getTaskCounts(token);
      const result = response?.data;
      if (!response?.success || !Array.isArray(result?.tabs) || !result.counts
        || !Number.isInteger(result.total) || result.total < 0
        || result.tabs.some(tab => !Number.isInteger(result.counts[tab]) || result.counts[tab] < 0)) {
        throw new Error('Dữ liệu số lượng khách hàng không hợp lệ');
      }
      if (sequence.current === current) { setData(result); setError(''); }
    } catch (err) {
      console.error('Load customer task counts error:', err);
      if (sequence.current === current) { setData(null); setError(err.message || 'Không tải được số lượng khách hàng'); }
    }
  }, [token, enabled]);
  useEffect(() => {
    setData(null);
    setError('');
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const interval = window.setInterval(onVisible, 30000);
    window.addEventListener('focus', onVisible);
    window.addEventListener(LEAD_TASK_COUNTS_CHANGED_EVENT, refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sequence.current++;
      window.clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener(LEAD_TASK_COUNTS_CHANGED_EVENT, refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  return { data, error, refresh };
}
