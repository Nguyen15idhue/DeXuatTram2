import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { viewService } from '../services/api';

const cache = {};

export default function useDefaultViewId(entity, fallbackId) {
  const { token } = useAuth();
  const [viewId, setViewId] = useState(() => cache[entity] || fallbackId);

  useEffect(() => {
    if (!entity) return;
    let cancelled = false;
    viewService
      .getAll(`entity=${entity}&usage=table&status=active&limit=1`, token)
      .then((res) => {
        const first = res && res.success && Array.isArray(res.data) ? res.data[0] : null;
        if (cancelled) return;
        if (first && first.id) {
          cache[entity] = first.id;
          setViewId(first.id);
        } else {
          delete cache[entity];
          setViewId(null);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [entity, token]);

  return viewId;
}
