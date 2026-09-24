from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from db.database import get_db
from model.edge_to_ems import EdgeToEmsModel
from dto.dashboard.latest import DashboardLatest
from dto.edge_to_ems import EdgeToEms
from dto.ems_to_edge import EmsToEdge
from datetime import datetime
dashboard_router = APIRouter()
def map_to_dto(r):
    return EdgeToEms(
        time=r.time,
        solar={"voltage": r.solar_voltage, "current": r.solar_current},
        bess={"soc": r.bess_soc, "voltage": r.bess_voltage, "current": r.bess_current},
        grid={"voltage": r.grid_voltage, "current": r.grid_current},
        ev1_power={"soc": r.ev1_soc, "voltage": r.ev1_voltage, "current": r.ev1_current},
        ev2_power={"soc": r.ev2_soc, "voltage": r.ev2_voltage, "current": r.ev2_current},
    )
@dashboard_router.get("/dashboard")
def get_latest(db: Session = Depends(get_db)):
    response = DashboardLatest
    e = db.query(EdgeToEmsModel).order_by(EdgeToEmsModel.time.desc()).first()
    if e is None:
        return {"message": "No data available yet"}
    telemetry = EdgeToEms(
        time=e.time,
        solar={"voltage": e.solar_voltage, "current": e.solar_current},
        bess={"soc": e.bess_soc, "voltage": e.bess_voltage, "current": e.bess_current},
        grid={"voltage": e.grid_voltage, "current": e.grid_current},
        ev1_power={"soc": e.ev1_soc, "voltage": e.ev1_voltage, "current": e.ev1_current},
        ev2_power={"soc": e.ev2_soc, "voltage": e.ev2_voltage, "current": e.ev2_current},
    )
    commands = EmsToEdge(ev1=1, ev2=1, ev1_source=0, ev2_source=0)
    return DashboardLatest(telemetry=telemetry, commands=commands)

@dashboard_router.get("/dashboard/history")
def get_history(
    start: datetime = Query(...),
    end: datetime = Query(...),
    limit: int = Query(default=10000, le=50000),
    db: Session = Depends(get_db),
):
    trunc_minute = func.date_trunc('minute', EdgeToEmsModel.time)

    results = (
        db.query(
            trunc_minute.label("time"),
            func.avg(EdgeToEmsModel.solar_voltage).label("solar_voltage"),
            func.avg(EdgeToEmsModel.solar_current).label("solar_current"),
            func.avg(EdgeToEmsModel.bess_soc).label("bess_soc"),
            func.avg(EdgeToEmsModel.bess_voltage).label("bess_voltage"),
            func.avg(EdgeToEmsModel.bess_current).label("bess_current"),
            func.avg(EdgeToEmsModel.grid_voltage).label("grid_voltage"),
            func.avg(EdgeToEmsModel.grid_current).label("grid_current"),
            func.avg(EdgeToEmsModel.ev1_soc).label("ev1_soc"),
            func.avg(EdgeToEmsModel.ev1_voltage).label("ev1_voltage"),
            func.avg(EdgeToEmsModel.ev1_current).label("ev1_current"),
            func.avg(EdgeToEmsModel.ev2_soc).label("ev2_soc"),
            func.avg(EdgeToEmsModel.ev2_voltage).label("ev2_voltage"),
            func.avg(EdgeToEmsModel.ev2_current).label("ev2_current"),
        )
        .filter(EdgeToEmsModel.time >= start, EdgeToEmsModel.time <= end)
        .group_by(trunc_minute)
        .order_by(trunc_minute.asc())
        .limit(limit)
        .all()
    )

    return [
        EdgeToEms(
            time=r.time,
            solar={"voltage": round(r.solar_voltage, 3), "current": round(r.solar_current, 3)},
            bess={"soc": int(round(r.bess_soc)), "voltage": round(r.bess_voltage, 3), "current": round(r.bess_current, 3)},
            grid={"voltage": round(r.grid_voltage, 3), "current": round(r.grid_current, 3)},
            ev1_power={"soc": int(round(r.ev1_soc)), "voltage": round(r.ev1_voltage, 3), "current": round(r.ev1_current, 3)},
            ev2_power={"soc": int(round(r.ev2_soc)), "voltage": round(r.ev2_voltage, 3), "current": round(r.ev2_current, 3)},
        )
        for r in results
    ]