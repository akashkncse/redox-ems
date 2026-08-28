from datetime import datetime

from sqlalchemy import Integer, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from db.database import Base


class EdgeToEmsModel(Base):
    """SQLAlchemy model storing telemetry from ESP32.

    Uses flat integer fields and a boolean flag for grid availability.
    """
    __tablename__ = "edge_to_ems"

    id: Mapped[int] = mapped_column(primary_key=True)
    time: Mapped[datetime] = mapped_column(DateTime)  # proper datetime column
    solarPower: Mapped[int] = mapped_column(Integer)
    bessPower: Mapped[int] = mapped_column(Integer)
    gridPower: Mapped[int] = mapped_column(Integer)
    ev1Power: Mapped[int] = mapped_column(Integer)
    ev2Power: Mapped[int] = mapped_column(Integer)
    ev1: Mapped[bool] = mapped_column(Boolean)
    ev2: Mapped[bool] = mapped_column(Boolean)
    grid_availability: Mapped[bool] = mapped_column(Boolean)