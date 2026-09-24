import http.server
import json
import random
import socketserver
import threading
import time
import webbrowser
from datetime import datetime
import requests

BACKEND_URL = "http://localhost:8080/"
DASHBOARD_PORT = 5050

# In-memory shared state for telemetry and control
state = {
    "status": "Initializing...",
    "last_sync": None,
    "payload": None,
    "control": None,
    "history": []
}

# Simulated hardware variables
sim_vars = {
    "solar_power": 3200.0,
    "ev1_soc": 45.0,
    "ev2_soc": 60.0,
    "bess_soc": 80.0,
    "grid_availability": True
}


def simulate_hardware_step(control):
    """Update simulated state based on elapsed time and current control signals."""
    # Simulate fluctuating solar power
    sim_vars["solar_power"] = max(0.0, round(sim_vars["solar_power"] + random.uniform(-150, 150), 2))

    # If EV1 is charging according to received control, increase its SOC
    if control and control.get("ev1", False):
        sim_vars["ev1_soc"] = min(100.0, round(sim_vars["ev1_soc"] + 0.5, 2))

    # If EV2 is charging according to received control, increase its SOC
    if control and control.get("ev2", False):
        sim_vars["ev2_soc"] = min(100.0, round(sim_vars["ev2_soc"] + 0.4, 2))

    # BESS SOC slight discharge or recharge
    sim_vars["bess_soc"] = max(10.0, min(100.0, round(sim_vars["bess_soc"] + random.uniform(-0.2, 0.2), 2)))


def run_simulator():
    """Loop running every 5 seconds to send payload and receive control."""
    while True:
        try:
            simulate_hardware_step(state["control"])

            payload = {
                "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                "solar_power": sim_vars["solar_power"],
                "ev1_soc": sim_vars["ev1_soc"],
                "ev2_soc": sim_vars["ev2_soc"],
                "bess_soc": sim_vars["bess_soc"],
                "grid_availability": sim_vars["grid_availability"]
            }

            response = requests.post(BACKEND_URL, json=payload, timeout=4)

            if response.status_code == 200:
                control = response.json()
                state["status"] = "Connected"
                state["last_sync"] = datetime.now().strftime("%H:%M:%S")
                state["payload"] = payload
                state["control"] = control

                log_entry = {
                    "time": state["last_sync"],
                    "solar": payload["solar_power"],
                    "ev1_soc": payload["ev1_soc"],
                    "ev2_soc": payload["ev2_soc"],
                    "bess_soc": payload["bess_soc"],
                    "grid": payload["grid_availability"],
                    "ctrl_ev1": control.get("ev1"),
                    "ctrl_ev1_src": control.get("ev1_source"),
                    "ctrl_ev2": control.get("ev2"),
                    "ctrl_ev2_src": control.get("ev2_source")
                }
                state["history"].insert(0, log_entry)
                if len(state["history"]) > 20:
                    state["history"].pop()

                print(f"[{state['last_sync']}] Sent Payload -> Received Control: {control}")
            else:
                state["status"] = f"Backend returned HTTP {response.status_code}"
                print(f"Error: HTTP {response.status_code}")

        except Exception as e:
            state["status"] = f"Connection error: {e}"
            print(f"Backend connection failed: {e}")

        time.sleep(5)


HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Redox EMS - Hardware Simulation Monitor</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      margin: 0;
      padding: 24px;
    }
    h1 {
      margin-top: 0;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 9999px;
      background: #1e293b;
      color: #94a3b8;
    }
    .badge.connected {
      background: #065f46;
      color: #34d399;
    }
    .badge.error {
      background: #7f1d1d;
      color: #f87171;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);
    }
    .card h2 {
      margin-top: 0;
      font-size: 18px;
      border-bottom: 1px solid #334155;
      padding-bottom: 10px;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #1e293b;
    }
    .metric-label {
      color: #94a3b8;
    }
    .metric-value {
      font-weight: 600;
      font-family: monospace;
      font-size: 15px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 13px;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #334155;
    }
    th {
      background: #0f172a;
      color: #94a3b8;
    }
    pre {
      background: #0f172a;
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <h1>
    Redox EMS Hardware Communication Monitor
    <span id="statusBadge" class="badge">Connecting...</span>
  </h1>
  <p style="color: #94a3b8;">Syncing every 5 seconds with backend at <code>http://localhost:8080/</code></p>

  <div class="grid">
    <div class="card">
      <h2 style="color: #38bdf8;">Latest Payload (ESP32 Request &rarr;)</h2>
      <div id="payloadMetrics">Waiting for data...</div>
      <h3>Raw JSON</h3>
      <pre id="payloadRaw">{}</pre>
    </div>

    <div class="card">
      <h2 style="color: #a78bfa;">Latest Control (EMS Response &larr;)</h2>
      <div id="controlMetrics">Waiting for data...</div>
      <h3>Raw JSON</h3>
      <pre id="controlRaw">{}</pre>
    </div>
  </div>

  <div class="card">
    <h2>Recent Communication History</h2>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Solar (W)</th>
          <th>EV1 SOC</th>
          <th>EV2 SOC</th>
          <th>BESS SOC</th>
          <th>Grid Available</th>
          <th>EV1 Charge</th>
          <th>EV1 Source</th>
          <th>EV2 Charge</th>
          <th>EV2 Source</th>
        </tr>
      </thead>
      <tbody id="historyTable">
        <tr><td colspan="10" style="text-align:center; color:#64748b;">No records yet</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    async function updateDashboard() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();

        const badge = document.getElementById('statusBadge');
        badge.textContent = data.status + (data.last_sync ? ` (${data.last_sync})` : '');
        badge.className = 'badge ' + (data.status === 'Connected' ? 'connected' : 'error');

        if (data.payload) {
          document.getElementById('payloadRaw').textContent = JSON.stringify(data.payload, null, 2);
          document.getElementById('payloadMetrics').innerHTML = `
            <div class="metric"><span class="metric-label">Timestamp:</span><span class="metric-value">${data.payload.timestamp}</span></div>
            <div class="metric"><span class="metric-label">Solar Power:</span><span class="metric-value">${data.payload.solar_power} W</span></div>
            <div class="metric"><span class="metric-label">EV1 SOC:</span><span class="metric-value">${data.payload.ev1_soc}%</span></div>
            <div class="metric"><span class="metric-label">EV2 SOC:</span><span class="metric-value">${data.payload.ev2_soc}%</span></div>
            <div class="metric"><span class="metric-label">BESS SOC:</span><span class="metric-value">${data.payload.bess_soc}%</span></div>
            <div class="metric"><span class="metric-label">Grid Availability:</span><span class="metric-value">${data.payload.grid_availability ? 'YES' : 'NO'}</span></div>
          `;
        }

        if (data.control) {
          document.getElementById('controlRaw').textContent = JSON.stringify(data.control, null, 2);
          document.getElementById('controlMetrics').innerHTML = `
            <div class="metric"><span class="metric-label">EV1 Charging:</span><span class="metric-value">${data.control.ev1 ? 'ON' : 'OFF'}</span></div>
            <div class="metric"><span class="metric-label">EV1 Source:</span><span class="metric-value">${data.control.ev1_source}</span></div>
            <div class="metric"><span class="metric-label">EV2 Charging:</span><span class="metric-value">${data.control.ev2 ? 'ON' : 'OFF'}</span></div>
            <div class="metric"><span class="metric-label">EV2 Source:</span><span class="metric-value">${data.control.ev2_source}</span></div>
          `;
        }

        if (data.history && data.history.length > 0) {
          const rows = data.history.map(h => `
            <tr>
              <td>${h.time}</td>
              <td>${h.solar}</td>
              <td>${h.ev1_soc}%</td>
              <td>${h.ev2_soc}%</td>
              <td>${h.bess_soc}%</td>
              <td>${h.grid ? '✅' : '❌'}</td>
              <td>${h.ctrl_ev1 ? '⚡ ON' : 'OFF'}</td>
              <td>${h.ctrl_ev1_src}</td>
              <td>${h.ctrl_ev2 ? '⚡ ON' : 'OFF'}</td>
              <td>${h.ctrl_ev2_src}</td>
            </tr>
          `).join('');
          document.getElementById('historyTable').innerHTML = rows;
        }
      } catch (err) {
        console.error(err);
      }
    }

    setInterval(updateDashboard, 1000);
    updateDashboard();
  </script>
</body>
</html>
"""


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_PAGE.encode("utf-8"))
        elif self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(state).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Silence default HTTP server request logging
        pass


def run_web_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", DASHBOARD_PORT), DashboardHandler) as httpd:
        print(f"Monitoring Dashboard running at http://localhost:{DASHBOARD_PORT}")
        httpd.serve_forever()


if __name__ == "__main__":
    # Start web server thread
    server_thread = threading.Thread(target=run_web_server, daemon=True)
    server_thread.start()

    # Open the browser dashboard
    time.sleep(0.5)
    webbrowser.open(f"http://localhost:{DASHBOARD_PORT}")

    # Start simulation loop in main thread
    print("Starting hardware simulation loop (interval = 5s)...")
    run_simulator()
