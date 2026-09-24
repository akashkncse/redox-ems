export interface Power {
  voltage: number;
  current: number;
}

export interface PowerWithSoc extends Power {
  soc: number;
}

export interface EdgeToEms {
  time: string;
  solar: Power;
  bess: PowerWithSoc;
  grid: Power;
  ev1_power: PowerWithSoc;
  ev2_power: PowerWithSoc;
}

export interface EmsToEdge {
  ev1: number;
  ev2: number;
  ev1_source: number;
  ev2_source: number;
}

export interface DashboardLatest {
  telemetry: EdgeToEms;
  commands: EmsToEdge;
}
export interface HistoryParams {
  start: Date;
  end: Date;
  limit?: number;
}