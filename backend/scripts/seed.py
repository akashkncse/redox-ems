from datetime import datetime, timedelta
import random
import math
from db.database import SessionLocal, engine, Base
from model.edge_to_ems import EdgeToEmsModel

def seed_week():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    start = datetime(2026, 8, 12, 0, 0, 0)
    records = []
    
    for minute_offset in range(7 * 24 * 60):
        t = start + timedelta(minutes=minute_offset)
        hour = t.hour + t.minute / 60.0
        
        if 6.0 <= hour <= 18.0:
            solar_kw = max(0.0, 18.0 * math.sin(math.pi * (hour - 6.0) / 12.0))
        else:
            solar_kw = 0.0
        solar_kw *= 1.0 + random.uniform(-0.05, 0.05)
        
        morning = 5.0 * math.exp(-((hour - 8.0) / 2.0) ** 2)
        evening = 7.0 * math.exp(-((hour - 19.0) / 3.0) ** 2)
        house_kw = 4.0 + morning + evening
        
        bess_soc = 60.0 + 30.0 * math.sin(math.pi * (hour - 6.0) / 24.0)
        bess_soc = max(10.0, min(100.0, bess_soc + random.uniform(-2, 2)))
        bess_current = (solar_kw - house_kw) * 1000.0 / 230.0 * 0.3
        
        grid_current = (house_kw - solar_kw) * 1000.0 / 230.0
        
        ev1_soc = 35.0 + (minute_offset % (24*60)) / (24*60) * 45.0
        ev2_soc = 55.0 + ((minute_offset + 12*60) % (24*60)) / (24*60) * 30.0
        
        records.append(EdgeToEmsModel(
            time=t,
            solar_voltage=230.0,
            solar_current=round(solar_kw * 1000.0 / 230.0, 3),
            bess_voltage=230.0,
            bess_current=round(bess_current, 3),
            bess_soc=int(round(bess_soc)),
            grid_voltage=230.0,
            grid_current=round(grid_current, 3),
            ev1_voltage=230.0,
            ev1_current=0.0,
            ev1_soc=int(round(ev1_soc)),
            ev2_voltage=230.0,
            ev2_current=0.0,
            ev2_soc=int(round(ev2_soc)),
        ))
    
    db.bulk_save_objects(records)
    db.commit()
    db.close()
    print(f"Seeded {len(records)} records from {start} to {start + timedelta(days=7)}")

if __name__ == "__main__":
    seed_week()