Start the database with `docker compose -f backend\docker-compose.yaml up -d`.

Run the backend on `http://localhost:5000` and the frontend on `http://localhost:8000`.

The ESP32 telemetry endpoint is `POST http://localhost:5000/edge`.

The `/edge` response follows the controls last submitted through `POST /control`;
the simulator applies those commands on its next cycle.