from sqlalchemy.orm import Session

from dto.edge_to_ems import EdgeToEms
from model.edge_to_ems import EdgeToEmsModel


def save_edge_data(
    payload: EdgeToEms,
    db: Session,
):
    record = EdgeToEmsModel(
        time=payload.time,
        solarPower=payload.solarPower,
        bessPower=payload.bessPower,
        gridPower=payload.gridPower,
        ev1Power=payload.ev1Power,
        ev2Power=payload.ev2Power,
        ev1=payload.ev1,
        ev2=payload.ev2,
        grid_availability=payload.grid_availability,
    )

    db.add(record)
    db.commit()

    return record