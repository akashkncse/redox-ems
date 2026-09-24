from pydantic import BaseModel

class Power(BaseModel):
    voltage: float
    current: float

class PowerWithSoc(Power):
    soc: int