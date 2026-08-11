#!/usr/bin/env python3
"""
Single-file EMS simulator.

No third-party dependencies required.

Run:
    python simulator.py

Optional:
    python simulator.py --url http://localhost:8000/edge --interval 1
    python simulator.py --scenario sunny-day --interval 0.5
    python simulator.py --scenario grid-outage
    python simulator.py --scenario ev-charging
    python simulator.py --dry-run

The simulator maintains state instead of generating unrelated random values.
It advances a virtual clock, models solar, grid, BESS and two EVs, converts
the state into the EdgeToEms JSON payload, and POSTs it to the FastAPI endpoint.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class Config:
    url: str = "http://localhost:8000/edge"
    interval: float = 1.0          # real seconds per simulation tick
    minutes_per_tick: int = 1      # simulated minutes per tick
    start_hour: int = 6
    scenario: str = "normal-day"
    dry_run: bool = False


# ---------------------------------------------------------------------------
# Device models
# ---------------------------------------------------------------------------

@dataclass
class Solar:
    voltage: float = 230.0
    current: float = 0.0

    @property
    def power_kw(self) -> float:
        # Simplified single-phase approximation.
        return self.voltage * self.current / 1000.0


@dataclass
class Bess:
    voltage: float = 230.0
    current: float = 0.0
    soc: float = 60.0
    capacity_kwh: float = 40.0
    max_charge_kw: float = 10.0
    max_discharge_kw: float = 10.0

    @property
    def power_kw(self) -> float:
        return self.voltage * self.current / 1000.0

    def set_power(self, power_kw: float) -> None:
        """
        Positive = discharge.
        Negative = charge.
        """
        power_kw = max(
            -self.max_charge_kw,
            min(self.max_discharge_kw, power_kw),
        )

        self.current = power_kw * 1000.0 / self.voltage

    def update_soc(self, minutes: float) -> None:
        """
        Very simple energy-based SOC model.
        Positive power = discharge -> SOC falls.
        Negative power = charge -> SOC rises.
        """
        energy_kwh = self.power_kw * (minutes / 60.0)

        # 95% charge/discharge efficiency approximation.
        if energy_kwh > 0:
            self.soc -= (energy_kwh / self.capacity_kwh) * 100.0 / 0.95
        else:
            self.soc -= (energy_kwh / self.capacity_kwh) * 100.0 * 0.95

        self.soc = max(0.0, min(100.0, self.soc))


@dataclass
class EV:
    name: str
    voltage: float = 230.0
    current: float = 0.0
    soc: float = 50.0
    capacity_kwh: float = 60.0
    target_soc: float = 80.0
    max_charge_kw: float = 7.4
    plugged_in: bool = False

    @property
    def power_kw(self) -> float:
        return self.voltage * self.current / 1000.0

    def charge(self, minutes: float) -> None:
        if not self.plugged_in or self.soc >= self.target_soc:
            self.current = 0.0
            return

        power_kw = min(self.max_charge_kw, self.max_charge_kw)
        self.current = power_kw * 1000.0 / self.voltage

        energy_kwh = power_kw * minutes / 60.0
        self.soc += (energy_kwh / self.capacity_kwh) * 100.0 * 0.95
        self.soc = min(self.soc, self.target_soc, 100.0)


@dataclass
class Grid:
    voltage: float = 230.0
    current: float = 0.0
    available: bool = True

    @property
    def power_kw(self) -> float:
        return self.voltage * self.current / 1000.0


@dataclass
class SiteState:
    solar: Solar
    bess: Bess
    grid: Grid
    ev1: EV
    ev2: EV
    house_load_kw: float = 5.0


# ---------------------------------------------------------------------------
# Scenario logic
# ---------------------------------------------------------------------------

class Scenario:
    name = "normal-day"

    def update_environment(
        self,
        state: SiteState,
        simulation_time: datetime,
    ) -> None:
        """Override in scenarios."""


class NormalDay(Scenario):
    name = "normal-day"

    def update_environment(self, state: SiteState, simulation_time: datetime) -> None:
        hour = simulation_time.hour + simulation_time.minute / 60.0

        # Solar rises around 06:00, peaks around noon, falls around 18:00.
        if 6.0 <= hour <= 18.0:
            solar_factor = math.sin(math.pi * (hour - 6.0) / 12.0)
            solar_kw = max(0.0, 18.0 * solar_factor)
        else:
            solar_kw = 0.0

        # Small deterministic sensor variation.
        solar_kw *= 1.0 + random.uniform(-0.03, 0.03)

        state.solar.current = solar_kw * 1000.0 / state.solar.voltage

        # House demand has morning/evening peaks.
        morning_peak = 5.0 * math.exp(-((hour - 8.0) / 2.0) ** 2)
        evening_peak = 7.0 * math.exp(-((hour - 19.0) / 3.0) ** 2)
        state.house_load_kw = 4.0 + morning_peak + evening_peak


class EVCharging(Scenario):
    name = "ev-charging"

    def update_environment(self, state: SiteState, simulation_time: datetime) -> None:
        NormalDay().update_environment(state, simulation_time)

        hour = simulation_time.hour + simulation_time.minute / 60.0

        # EV1 arrives at 08:00; EV2 arrives at 17:00.
        state.ev1.plugged_in = 8.0 <= hour < 16.0
        state.ev2.plugged_in = 17.0 <= hour < 23.0

        state.ev1.target_soc = 90.0
        state.ev2.target_soc = 85.0


class GridOutage(Scenario):
    name = "grid-outage"

    def update_environment(self, state: SiteState, simulation_time: datetime) -> None:
        NormalDay().update_environment(state, simulation_time)

        hour = simulation_time.hour + simulation_time.minute / 60.0

        # Grid outage from 12:00 to 14:00.
        state.grid.available = not (12.0 <= hour < 14.0)

        state.ev1.plugged_in = True
        state.ev2.plugged_in = True


SCENARIOS = {
    "normal-day": NormalDay,
    "ev-charging": EVCharging,
    "grid-outage": GridOutage,
}


# ---------------------------------------------------------------------------
# EMS-ish balancing logic
# ---------------------------------------------------------------------------

def update_devices(state: SiteState, minutes: float) -> None:
    """
    Simplified power-balancing controller.

    Priority:
      1. Solar supplies house load.
      2. Solar supplies EV charging.
      3. Excess solar charges BESS.
      4. If demand exceeds solar, BESS discharges.
      5. Remaining deficit comes from grid.
    """

    # Update EV charging first.
    state.ev1.charge(minutes)
    state.ev2.charge(minutes)

    solar_kw = state.solar.power_kw
    ev_kw = state.ev1.power_kw + state.ev2.power_kw
    demand_kw = state.house_load_kw + ev_kw

    net_kw = solar_kw - demand_kw

    # Positive net = excess generation.
    # Negative net = deficit.

    if net_kw > 0:
        # Charge BESS with excess solar.
        charge_kw = min(net_kw, state.bess.max_charge_kw)

        if state.bess.soc >= 99.5:
            charge_kw = 0.0

        state.bess.set_power(-charge_kw)

        remaining_excess = net_kw - charge_kw

        # Export remaining power to grid.
        if state.grid.available:
            grid_power_kw = -remaining_excess
        else:
            grid_power_kw = 0.0

    else:
        # Need power.
        deficit_kw = -net_kw

        # Discharge BESS first.
        discharge_kw = min(deficit_kw, state.bess.max_discharge_kw)

        if state.bess.soc <= 10.0:
            discharge_kw = 0.0

        state.bess.set_power(discharge_kw)

        remaining_deficit = deficit_kw - discharge_kw

        if state.grid.available:
            grid_power_kw = remaining_deficit
        else:
            # In a real system this would trigger load shedding or alarms.
            grid_power_kw = 0.0

    state.grid.current = grid_power_kw * 1000.0 / state.grid.voltage

    state.bess.update_soc(minutes)


# ---------------------------------------------------------------------------
# Protocol adapter
# ---------------------------------------------------------------------------

def build_edge_to_ems_payload(
    state: SiteState,
    simulation_time: datetime,
) -> dict[str, Any]:
    """
    Converts internal simulator state to the API wire format.

    This is deliberately separate from the device models.
    """

    return {
        "time": simulation_time.isoformat(timespec="seconds"),
        "solar": {
            "voltage": round(state.solar.voltage, 2),
            "current": round(state.solar.current, 3),
        },
        "bess": {
            "soc": round(state.bess.soc),
            "voltage": round(state.bess.voltage, 2),
            "current": round(state.bess.current, 3),
        },
        "grid": {
            "voltage": round(state.grid.voltage, 2),
            "current": round(state.grid.current, 3),
        },
        "ev1_power": {
            "soc": round(state.ev1.soc),
            "voltage": round(state.ev1.voltage, 2),
            "current": round(state.ev1.current, 3),
        },
        "ev2_power": {
            "soc": round(state.ev2.soc),
            "voltage": round(state.ev2.voltage, 2),
            "current": round(state.ev2.current, 3),
        },
    }


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

def post_json(url: str, payload: dict[str, Any]) -> tuple[int, str]:
    data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, body

    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body

    except urllib.error.URLError as exc:
        return 0, f"connection error: {exc.reason}"


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

def print_state(
    state: SiteState,
    simulation_time: datetime,
    status: str,
) -> None:
    print(
        f"\n[{simulation_time.isoformat(timespec='seconds')}] "
        f"{status}"
    )

    print(
        f"  Solar : {state.solar.power_kw:6.2f} kW"
        f" | BESS : {state.bess.power_kw:6.2f} kW"
        f" | SOC {state.bess.soc:5.1f}%"
    )

    print(
        f"  Grid  : {state.grid.power_kw:6.2f} kW"
        f" | {'AVAILABLE' if state.grid.available else 'OUTAGE'}"
    )

    print(
        f"  EV1   : {state.ev1.power_kw:6.2f} kW"
        f" | SOC {state.ev1.soc:5.1f}%"
        f" | {'plugged' if state.ev1.plugged_in else 'unplugged'}"
    )

    print(
        f"  EV2   : {state.ev2.power_kw:6.2f} kW"
        f" | SOC {state.ev2.soc:5.1f}%"
        f" | {'plugged' if state.ev2.plugged_in else 'unplugged'}"
    )

    print(f"  Load  : {state.house_load_kw:6.2f} kW")


# ---------------------------------------------------------------------------
# Simulator
# ---------------------------------------------------------------------------

def create_initial_state() -> SiteState:
    return SiteState(
        solar=Solar(),
        bess=Bess(soc=60.0),
        grid=Grid(),
        ev1=EV(
            name="EV1",
            soc=35.0,
            target_soc=80.0,
        ),
        ev2=EV(
            name="EV2",
            soc=55.0,
            target_soc=80.0,
        ),
    )


def run(config: Config) -> None:
    random.seed(42)

    scenario_cls = SCENARIOS.get(config.scenario)
    if scenario_cls is None:
        raise ValueError(
            f"Unknown scenario '{config.scenario}'. "
            f"Choose from: {', '.join(SCENARIOS)}"
        )

    scenario = scenario_cls()
    state = create_initial_state()

    now = datetime.now(timezone.utc)
    simulation_time = now.replace(
        hour=config.start_hour,
        minute=0,
        second=0,
        microsecond=0,
    )

    print("EMS simulator started")
    print(f"Scenario : {scenario.name}")
    print(f"Endpoint : {config.url}")
    print(f"Tick     : {config.minutes_per_tick} simulated minute(s)")
    print(f"Interval : {config.interval} real second(s)")
    print(f"Dry run  : {config.dry_run}")
    print("Press Ctrl+C to stop.")

    while True:
        scenario.update_environment(state, simulation_time)
        update_devices(state, config.minutes_per_tick)

        payload = build_edge_to_ems_payload(
            state,
            simulation_time,
        )

        if config.dry_run:
            status = "DRY RUN"
            print_state(state, simulation_time, status)
            print(json.dumps(payload, indent=2))
        else:
            status_code, response = post_json(config.url, payload)

            if status_code == 0:
                print_state(state, simulation_time, "ERROR")
                print(f"  {response}")
            elif 200 <= status_code < 300:
                print_state(
                    state,
                    simulation_time,
                    f"POST {status_code}",
                )
            else:
                print_state(
                    state,
                    simulation_time,
                    f"POST {status_code}",
                )
                print(f"  Response: {response}")

        simulation_time += timedelta(
            minutes=config.minutes_per_tick
        )

        time.sleep(config.interval)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> Config:
    parser = argparse.ArgumentParser(
        description="Single-file EMS simulator"
    )

    parser.add_argument(
        "--url",
        default="http://localhost:8000/edge",
        help="FastAPI endpoint",
    )

    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Real seconds between simulation ticks",
    )

    parser.add_argument(
        "--minutes-per-tick",
        type=int,
        default=1,
        help="Simulation minutes advanced per tick",
    )

    parser.add_argument(
        "--start-hour",
        type=int,
        default=6,
        choices=range(24),
        help="Starting simulation hour",
    )

    parser.add_argument(
        "--scenario",
        choices=sorted(SCENARIOS),
        default="normal-day",
        help="Simulation scenario",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate payloads without POSTing them",
    )

    args = parser.parse_args()

    if args.interval <= 0:
        parser.error("--interval must be greater than 0")

    if args.minutes_per_tick <= 0:
        parser.error("--minutes-per-tick must be greater than 0")

    return Config(
        url=args.url,
        interval=args.interval,
        minutes_per_tick=args.minutes_per_tick,
        start_hour=args.start_hour,
        scenario=args.scenario,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    try:
        run(parse_args())
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
        sys.exit(0)
