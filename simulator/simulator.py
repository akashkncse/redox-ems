#!/usr/bin/env python3
"""Small ESP32/EMS simulator for the Spring Boot /edge endpoint."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class SimulatorState:
    ev1_soc: float = 35.0
    ev2_soc: float = 55.0
    bess_soc: float = 60.0
    ev1_charging: bool = False
    ev2_charging: bool = False
    grid_available: bool = True
    simulated_minute: int = 6 * 60


def build_payload(state: SimulatorState) -> dict[str, Any]:
    hour = (state.simulated_minute % (24 * 60)) / 60.0
    solar_kw = 0.0
    if 6.0 <= hour <= 18.0:
        solar_kw = 18.0 * math.sin(math.pi * (hour - 6.0) / 12.0)

    ev1_power = 7400 if state.ev1_charging and state.ev1_soc < 90.0 else 0
    ev2_power = 7400 if state.ev2_charging and state.ev2_soc < 85.0 else 0
    house_power = 4000
    total_load = house_power + ev1_power + ev2_power
    solar_power = round(solar_kw * 1000)
    net_power = solar_power - total_load

    if net_power >= 0:
        bess_power = -min(net_power, 10000)
        grid_power = -(net_power + bess_power) if state.grid_available else 0
    else:
        bess_power = min(-net_power, 10000)
        grid_power = (-net_power - bess_power) if state.grid_available else 0

    return {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "solarPower": solar_power,
        "bessPower": bess_power,
        "gridPower": grid_power,
        "ev1Power": ev1_power,
        "ev2Power": ev2_power,
        "ev1_soc": round(state.ev1_soc, 1),
        "ev2_soc": round(state.ev2_soc, 1),
        "bess_soc": round(state.bess_soc, 1),
        "ev1": state.ev1_charging,
        "ev2": state.ev2_charging,
        "grid_availability": state.grid_available,
    }


def post_json(url: str, payload: dict[str, Any]) -> tuple[int, str]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as error:
        return 0, f"connection error: {error.reason}"


def apply_command(state: SimulatorState, response: str) -> str:
    command = json.loads(response)
    state.ev1_charging = bool(command["ev1"])
    state.ev2_charging = bool(command["ev2"])
    return (
        f"EV1={'CHARGING' if state.ev1_charging else 'OFF'} "
        f"EV2={'CHARGING' if state.ev2_charging else 'OFF'} "
        f"(sources: {command['ev1_source']}/{command['ev2_source']})"
    )


def update_bess_soc(state: SimulatorState, bess_power: int) -> None:
    """Update SOC for one simulated minute; positive power means discharge."""
    energy_kwh = bess_power / 1000.0 / 60.0
    capacity_kwh = 40.0

    if energy_kwh >= 0:
        state.bess_soc -= (energy_kwh / capacity_kwh) * 100.0 / 0.95
    else:
        state.bess_soc -= (energy_kwh / capacity_kwh) * 100.0 * 0.95

    state.bess_soc = max(0.0, min(100.0, state.bess_soc))


def run(endpoint: str, interval: float, dry_run: bool) -> None:
    state = SimulatorState()
    print(f"Simulator started: {endpoint}")
    print("Press Ctrl+C to stop.")

    while True:
        payload = build_payload(state)
        status, response = (200, '{"ev1": 0, "ev2": 0, "ev1_source": 0, "ev2_source": 0}') \
            if dry_run else post_json(endpoint, payload)

        if status == 0:
            print(f"ERROR: {response}")
        elif 200 <= status < 300:
            try:
                command_status = apply_command(state, response)
            except (KeyError, json.JSONDecodeError, TypeError) as error:
                command_status = f"invalid command response: {error}"
            print(
                f"[{payload['time']}] POST {status} | "
                f"grid={'ON' if state.grid_available else 'OFF'} | "
                f"solar={payload['solarPower']}W | "
                f"bess={payload['bess_soc']}% | "
                f"reported EV1={'ON' if payload['ev1'] else 'OFF'} "
                f"EV2={'ON' if payload['ev2'] else 'OFF'} | {command_status}"
            )
        else:
            print(f"POST {status}: {response}")

        update_bess_soc(state, payload["bessPower"])
        state.ev1_soc = min(90.0, state.ev1_soc + (0.2 if state.ev1_charging else 0))
        state.ev2_soc = min(85.0, state.ev2_soc + (0.2 if state.ev2_charging else 0))
        state.simulated_minute = (state.simulated_minute + 1) % (24 * 60)
        time.sleep(interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate an ESP32 sending telemetry.")
    parser.add_argument("--url", default="http://localhost:5000/api/telemetry")
    parser.add_argument("--interval", type=float, default=5.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.interval <= 0:
        parser.error("--interval must be greater than 0")
    return args


if __name__ == "__main__":
    try:
        args = parse_args()
        run(args.url, args.interval, args.dry_run)
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
        sys.exit(0)
