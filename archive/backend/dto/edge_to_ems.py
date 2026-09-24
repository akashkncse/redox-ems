from pydantic import BaseModel
from datetime import datetime


class EdgeToEms(BaseModel):
    """DTO representing telemetry sent from ESP32 to EMS.

    Fields are flat scalar values matching the JSON payload contract.
    """
    time: datetime
    solarPower: int
    bessPower: int
    gridPower: int
    ev1Power: int
    ev2Power: int
    ev1: bool
    ev2: bool
    grid_availability: bool