import unittest
import json
from datetime import datetime

from fastapi.testclient import TestClient

# Import the FastAPI app
from main import app

# Import DB utilities and Base
from db import database as db_mod
from db.database import Base, engine
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import models to register them with Base metadata
import model.edge_to_ems  # noqa: F401
import model.telemetry_record  # noqa: F401

# Override the get_db dependency to use an in-memory SQLite DB for testing
SQLITE_URL = "sqlite:///./test.db"
TestEngine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TestEngine)

# Create all tables in the in-memory database
Base.metadata.create_all(bind=TestEngine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Apply the dependency override
app.dependency_overrides[db_mod.get_db] = override_get_db

client = TestClient(app)

class TestEdgeWorkflow(unittest.TestCase):
    def setUp(self):
        # Ensure a fresh DB for each test method
        Base.metadata.drop_all(bind=TestEngine)
        Base.metadata.create_all(bind=TestEngine)

    def test_payload_ingest_and_command_response(self):
        # First payload with grid availability true
        payload1 = {
            "time": datetime.utcnow().isoformat() + "Z",
            "solarPower": 1200,
            "bessPower": 800,
            "gridPower": 500,
            "ev1Power": 300,
            "ev2Power": 200,
            "ev1": False,
            "ev2": False,
            "grid_availability": True,
        }
        response1 = client.post("/edge", json=payload1)
        self.assertEqual(response1.status_code, 200)
        data1 = response1.json()
        # Grid is available => both EVs should be commanded ON (1)
        self.assertEqual(data1["ev1"], 1)
        self.assertEqual(data1["ev2"], 1)

        # Verify database records were created
        with TestingSessionLocal() as db:
            from model.edge_to_ems import EdgeToEmsModel
            from model.telemetry_record import TelemetryRecordModel
            edge = db.query(EdgeToEmsModel).first()
            telemetry = db.query(TelemetryRecordModel).first()
            self.assertIsNotNone(edge)
            self.assertIsNotNone(telemetry)
            self.assertEqual(edge.solarPower, payload1["solarPower"])
            self.assertEqual(edge.grid_availability, payload1["grid_availability"])

        # Second payload with grid availability false and flipped EV flags
        payload2 = {
            "time": datetime.utcnow().isoformat() + "Z",
            "solarPower": 1000,
            "bessPower": 600,
            "gridPower": 0,
            "ev1Power": 0,
            "ev2Power": 0,
            "ev1": True,
            "ev2": True,
            "grid_availability": False,
        }
        response2 = client.post("/edge", json=payload2)
        self.assertEqual(response2.status_code, 200)
        data2 = response2.json()
        # Grid not available => both EVs should be commanded OFF (0)
        self.assertEqual(data2["ev1"], 0)
        self.assertEqual(data2["ev2"], 0)

        # Verify two sets of records now exist
        with TestingSessionLocal() as db:
            from model.edge_to_ems import EdgeToEmsModel
            from model.telemetry_record import TelemetryRecordModel
            edges = db.query(EdgeToEmsModel).all()
            telemetries = db.query(TelemetryRecordModel).all()
            self.assertEqual(len(edges), 2)
            self.assertEqual(len(telemetries), 2)

if __name__ == "__main__":
    unittest.main()
