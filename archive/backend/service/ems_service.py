from dto.edge_to_ems import EdgeToEms
from dto.ems_to_edge import EmsToEdge

def compute_ems_commands(telemetry: EdgeToEms) -> EmsToEdge:
    """Compute EMS commands based on telemetry.

    For this test setup we use a simple rule:
    * If `grid_availability` is True, enable both EVs.
    * Otherwise, disable both EVs.
    """
    ev_on = 1 if telemetry.grid_availability else 0
    return EmsToEdge(
        ev1=ev_on,
        ev2=ev_on,
        ev1_source=0,
        ev2_source=0,
    )