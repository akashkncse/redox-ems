export interface Record {
  id: number;
  timestamp: string;
  solar_power: number;
  ev1_soc: number;
  ev2_soc: number;
  bess_soc: number;
  grid_availability: boolean;
  ev1: boolean;
  ev1_source: number;
  ev2: boolean;
  ev2_source: number;
}
