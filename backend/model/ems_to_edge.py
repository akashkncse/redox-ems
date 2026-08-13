from datetime import datetime
from sqlalchemy import DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base

class EmsToEdgeModel(Base):
    __tablename__ = "ems_to_edge"

    id: Mapped[int] = mapped_column(primary_key=True)
    time: Mapped[datetime] = mapped_column(DateTime, index=True)
    
    
    ev1: Mapped[int] = mapped_column(Integer)     
    ev2: Mapped[int] = mapped_column(Integer)     
    ev1_source: Mapped[int] = mapped_column(Integer) 
    ev2_source: Mapped[int] = mapped_column(Integer)
    
    telemetry_id: Mapped[int | None] = mapped_column(
        ForeignKey("edge_to_ems.id"), nullable=True
    )