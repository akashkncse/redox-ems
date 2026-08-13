from datetime import datetime
from sqlalchemy import DateTime, Integer, Float, Text
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base

class TelemetryRecordModel(Base):
    __tablename__ = "telemetry_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    time: Mapped[datetime] = mapped_column(DateTime, index=True)
    
    solar_voltage: Mapped[float] = mapped_column(Float)
    solar_current: Mapped[float] = mapped_column(Float)
    bess_soc: Mapped[float] = mapped_column(Float)
    bess_voltage: Mapped[float] = mapped_column(Float)
    bess_current: Mapped[float] = mapped_column(Float)
    grid_voltage: Mapped[float] = mapped_column(Float)
    grid_current: Mapped[float] = mapped_column(Float)
    ev1_soc: Mapped[float] = mapped_column(Float)
    ev1_voltage: Mapped[float] = mapped_column(Float)
    ev1_current: Mapped[float] = mapped_column(Float)
    ev2_soc: Mapped[float] = mapped_column(Float)
    ev2_voltage: Mapped[float] = mapped_column(Float)
    ev2_current: Mapped[float] = mapped_column(Float)
    
    cmd_ev1: Mapped[int] = mapped_column(Integer)
    cmd_ev2: Mapped[int] = mapped_column(Integer)
    cmd_ev1_source: Mapped[int] = mapped_column(Integer)
    cmd_ev2_source: Mapped[int] = mapped_column(Integer)