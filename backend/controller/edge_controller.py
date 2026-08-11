from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from dto.edge_to_ems import EdgeToEms
from db.database import get_db
from service.edge_service import save_edge_data
router = APIRouter()

@router.post("/edge")
async def receive_edge_data(payload: EdgeToEms, db: Session = Depends(get_db)):
    save_edge_data(payload, db)
    return {
        "status": "received"
    }