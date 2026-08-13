import { useState, useEffect } from 'react';
import { getLatest } from '../api/dashboard';
import type { DashboardLatest } from '../api/types';

export function useLatest(intervalMs = 5000) {
  const [data, setData] = useState<DashboardLatest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetch = async () => {
      try {
        const result = await getLatest();
        if (active) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to fetch');
          setLoading(false);
        }
      }
    };

    fetch();
    const interval = setInterval(fetch, intervalMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return { data, error, loading };
}