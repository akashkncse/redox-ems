import { AI_API_BASE_URL, API_BASE_URL } from './config';
import type { Record } from './Record';

export async function fetchServerStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/latest`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchLatestRecord(): Promise<Record> {
  const response = await fetch(`${API_BASE_URL}/latest`);
  if (!response.ok) {
    throw new Error(`Failed to fetch latest record: ${response.status} ${response.statusText}`);
  }
  // Assuming the backend returns JSON that matches the Record shape.
  const data: Record = await response.json();
  return data;
}

export async function fetchRecentRecords(): Promise<Record[]> {
  const response = await fetch(`${API_BASE_URL}/recent`);
  if (!response.ok) {
    throw new Error(`Failed to fetch recent records: ${response.status} ${response.statusText}`);
  }
  const data: Record[] = await response.json();
  return data;
}

export type SourceType = 0 | 1 | 2;

export const SOURCE_OPTIONS = [
  { value: 0 as const, label: 'Solar' },
  { value: 1 as const, label: 'Battery' },
  { value: 2 as const, label: 'Grid' },
];

export interface ControlPayload {
  ev1: boolean;
  ev1_source: SourceType;
  ev2: boolean;
  ev2_source: SourceType;
}

export async function postControl(payload: ControlPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/control`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // const reponse = await httpClient.post('/control')

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update control: ${response.status} ${text}`);
  }
}

export interface ChatResponse {
  reply: string;
  control: ControlPayload | null;
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  const response = await fetch(`${AI_API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI backend request failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<ChatResponse>;
}
