export interface Record {
  id: number;
  timestamp: string;
  solar_power: number | null;
  ev1_soc: number | null;
  ev2_soc: number | null;
  bess_soc: number | null;
  grid_availability: boolean;
  ev1: boolean;
  ev1_source: number;
  ev2: boolean;
  ev2_source: number;
}
