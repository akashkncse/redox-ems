// src/lib/api.ts
/**
 * Types and utilities for fetching data from the backend.
 */
import { API_BASE_URL } from './config';

/**
 * Represents a single record returned by the backend `/latest` endpoint.
 */
export interface Record {
  /** Unique identifier */
  id: number;
  /** Timestamp string, e.g. ISO8601 */
  timestamp: string;
  /** Solar power generation (kW, MW, etc.) */
  solar_power: number;
  /** State of charge for EV1 (0-1 or percentage) */
  ev1_soc: number;
  /** State of charge for EV2 */
  ev2_soc: number;
  /** State of charge for BESS (battery energy storage system) */
  bess_soc: number;
  /** Whether the grid is currently available */
  grid_availability: boolean;
  /** EV1 presence flag */
  ev1: boolean;
  /** Source identifier for EV1 (e.g., charger ID) */
  ev1_source: number;
  /** EV2 presence flag */
  ev2: boolean;
  /** Source identifier for EV2 */
  ev2_source: number;
}

/**
 * Fetches the latest {@link Record} from the backend.
 *
 * @returns A promise that resolves to the latest record.
 * @throws If the network request fails or the response is not ok.
 */
export async function fetchServerStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/`);
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
