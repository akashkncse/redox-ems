from datetime import datetime
from sqlalchemy import DateTime, Integer, Float, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base

class TelemetryRecordModel(Base):
    __tablename__ = "telemetry_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    time: Mapped[datetime] = mapped_column(DateTime, index=True)
    
    solar_power: Mapped[int] = mapped_column(Integer)
    bess_power: Mapped[int] = mapped_column(Integer)
    grid_power: Mapped[int] = mapped_column(Integer)
    ev1_power: Mapped[int] = mapped_column(Integer)
    ev2_power: Mapped[int] = mapped_column(Integer)
    grid_availability: Mapped[bool] = mapped_column(Boolean)
    
    cmd_ev1: Mapped[int] = mapped_column(Integer)
    cmd_ev2: Mapped[int] = mapped_column(Integer)
    cmd_ev1_source: Mapped[int] = mapped_column(Integer)
    cmd_ev2_source: Mapped[int] = mapped_column(Integer)