from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base
from datetime import datetime

class SummaryModel(Base):
    __tablename__ = "summaries"
    id: Mapped[int] = mapped_column(primary_key=True)
    time: Mapped[datetime] = mapped_column(DateTime, index=True)
    content: Mapped[str] = mapped_column(Text)