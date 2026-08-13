from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from dto.edge_to_ems import EdgeToEms
from db.database import get_db
from service.edge_service import save_edge_data
from service.ems_service import compute_ems_commands
from model.ems_to_edge import EmsToEdgeModel
from model.telemetry_record import TelemetryRecordModel

router = APIRouter()

@router.post("/edge")
async def receive_edge_data(payload: EdgeToEms, db: Session = Depends(get_db)):
    telemetry_record = save_edge_data(payload, db)
    
    commands = compute_ems_commands(payload)
    
    cmd_record = EmsToEdgeModel(
        time=payload.time,
        ev1=commands.ev1,
        ev2=commands.ev2,
        ev1_source=commands.ev1_source,
        ev2_source=commands.ev2_source,
        telemetry_id=telemetry_record.id,
    )
    db.add(cmd_record)
    
    concat = TelemetryRecordModel(
        time=payload.time,
        solar_voltage=payload.solar.voltage,
        solar_current=payload.solar.current,
        bess_soc=payload.bess.soc,
        bess_voltage=payload.bess.voltage,
        bess_current=payload.bess.current,
        grid_voltage=payload.grid.voltage,
        grid_current=payload.grid.current,
        ev1_soc=payload.ev1_power.soc,
        ev1_voltage=payload.ev1_power.voltage,
        ev1_current=payload.ev1_power.current,
        ev2_soc=payload.ev2_power.soc,
        ev2_voltage=payload.ev2_power.voltage,
        ev2_current=payload.ev2_power.current,
        cmd_ev1=commands.ev1,
        cmd_ev2=commands.ev2,
        cmd_ev1_source=commands.ev1_source,
        cmd_ev2_source=commands.ev2_source,
    )
    db.add(concat)
    db.commit()
    
    return commands.model_dump();