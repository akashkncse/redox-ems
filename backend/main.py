from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from controller import edge_controller
from db.database import Base, engine
from model.edge_to_ems import EdgeToEmsModel


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
app.include_router(edge_controller.router)



@app.get("/")
def read_root():
    return {"Hello": "World"}



