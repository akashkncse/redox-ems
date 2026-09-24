import requests
import time
import random

URL = "http://127.0.0.1:5000/api/telemetry"

for i in range(50):

    payload = {
        "time": f"2026-08-22T20:{i:02d}:00",
        "solar_power": random.randint(1000, 5000),
        "bess_power": random.randint(-2000, 2000),
        "grid_power": random.randint(0, 4000),
        "ev1_power": random.randint(0, 3000),
        "ev2_power": random.randint(0, 3000),
        "grid": random.choice([True, False]),
        "ev1": random.choice([True, False]),
        "ev2": random.choice([True, False])
    }

    try:
        response = requests.post(
            URL,
            json=payload,
            timeout=5
        )

        print(f"\nRequest #{i + 1}")
        print("Telemetry sent:")
        print(payload)

        print("Command received:")
        print(response.json())

        print("-" * 60)

    except requests.exceptions.RequestException as e:
        print("Could not connect to server:")
        print(e)
        break

    # Simulate ESP32 sending telemetry periodically
    time.sleep(1)