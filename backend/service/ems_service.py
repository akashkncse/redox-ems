from dto.edge_to_ems import EdgeToEms
from dto.ems_to_edge import EmsToEdge

def compute_ems_commands(telemetry: EdgeToEms) -> EmsToEdge:
    solar_kw = telemetry.solar.voltage * telemetry.solar.current / 1000.0
    bess_kw = telemetry.bess.voltage * telemetry.bess.current / 1000.0
    grid_available = abs(telemetry.grid.voltage) > 200
    
    ev1_on = 0
    ev2_on = 0
    ev1_source = 0
    ev2_source = 0
    
    solar_surplus = solar_kw
    
    if solar_surplus > 1.0 and telemetry.ev1_power.soc < 95:
        ev1_on = 1
        ev1_source = 0  
        
    elif telemetry.bess.soc > 70 and telemetry.ev2_power.soc < 90:
        ev2_on = 1
        ev2_source = 2  
        
    elif grid_available and telemetry.ev1_power.soc < 20:
        ev1_on = 1
        ev1_source = 1  
    
    return EmsToEdge(
        ev1=ev1_on,
        ev2=ev2_on,
        ev1_source=ev1_source,
        ev2_source=ev2_source,
    )