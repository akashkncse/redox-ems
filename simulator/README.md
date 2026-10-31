# EMS simulator

This dependency-free simulator sends ESP32-style telemetry to the Spring Boot
endpoint and applies the returned EMS controls before the next report.

```text
python simulator.py
```

Options:

```text
python simulator.py --url http://localhost:5000/api/telemetry --interval 5
python simulator.py --dry-run
```
