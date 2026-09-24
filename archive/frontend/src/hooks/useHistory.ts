import { useState, useEffect } from 'react';
import { getHistory } from '../api/dashboard';
import type { EdgeToEms } from '../api/types';

export function useHistory(start: Date, end: Date) {
    const [data, setData] = useState<EdgeToEms[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const startKey = start.toISOString();
    const endKey = end.toISOString();

    useEffect(() => {
        let active = true;
        setLoading(true);
        console.log('[Hook] Fetching with:', { start: startKey, end: endKey });

        getHistory({ start, end, limit: 5000 })
            .then((result) => {
                if (active) {
                    setData(result);
                    setError(null);
                    console.log('[Hook] Set data, length:', result.length);
                }
            })
            .catch((err) => {
                if (active) {
                    const msg = err instanceof Error ? err.message : 'Failed to fetch';
                    setError(msg);
                    console.error('[Hook] Error:', msg);
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => { active = false; };
    }, [startKey, endKey]);

    return { data, loading, error };
}