from pydantic import BaseModel
from dto.shared import Power, PowerWithSoc
from datetime import datetime


class EdgeToEms(BaseModel):
    time: datetime
    solar: Power
    bess: PowerWithSoc
    grid: Power
    ev1_power: PowerWithSoc
    ev2_power: PowerWithSoc