from sqlalchemy.orm import Session

from dto.edge_to_ems import EdgeToEms
from model.edge_to_ems import EdgeToEmsModel


def save_edge_data(
    payload: EdgeToEms,
    db: Session,
):
    record = EdgeToEmsModel(
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
    )

    db.add(record)
    db.commit()

    return record