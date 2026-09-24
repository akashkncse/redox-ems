from pydantic import BaseModel
from dto.edge_to_ems import EdgeToEms
from dto.ems_to_edge import EmsToEdge

class DashboardLatest(BaseModel):
    telemetry: EdgeToEms
    commands: EmsToEdge