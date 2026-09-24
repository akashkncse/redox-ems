import type { DashboardLatest, EdgeToEms, HistoryParams } from './types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail?.[0]?.msg || `HTTP ${res.status}`);
    }
    return res.json();
}

export async function getLatest(): Promise<DashboardLatest> {
    return fetchJson<DashboardLatest>(`${BASE_URL}/dashboard`);
}

// export async function getHistory(params: HistoryParams): Promise<EdgeToEms[]> {
//   const query = new URLSearchParams({
//     start: params.start.toISOString(),
//     end: params.end.toISOString(),
//     limit: String(params.limit ?? 1000),
//     resolution: params.resolution ?? 'raw',
//   });
//   return fetchJson<EdgeToEms[]>(`${BASE_URL}/dashboard/history?${query}`);
export async function getHistory(params: HistoryParams): Promise<EdgeToEms[]> {
    const formatNaive = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const query = new URLSearchParams({
        start: formatNaive(params.start),
        end: formatNaive(params.end),
        limit: String(params.limit ?? 1000),
    });

    const url = `${BASE_URL}/dashboard/history?${query.toString()}`;
    console.log('[API] Fetching history:', url);

    const result = await fetchJson<EdgeToEms[]>(url);
    console.log('[API] Received', result.length, 'records');
    return result;
} 