from pydantic import BaseModel

class EmsToEdge(BaseModel):
    ev1: int
    ev2: int
    ev1_source: int
    ev2_source: int