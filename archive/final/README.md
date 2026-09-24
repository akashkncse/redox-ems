# REDOX EMS — Solar + Battery + Grid EV Charging Management System

A clean, modern, responsive large-screen Energy Management System (EMS) dashboard and backend controller built with Node.js and Express.js. Designed specifically for control rooms, large wall-mounted monitors, and tablets.

---

## ⚡ Architecture Overview

```text
+-------------------+                          +--------------------+
|                   |                          |                    |
|   ESP32 Device    |                          |  Web Dashboard     |
| (Hardware Client) |                          |  (Browser Client)  |
|                   |                          |                    |
+---------+---------+                          +---------+----------+
          |                                              |
          | 1. POST / (telemetry JSON)                   | A. Polls GET /api/status (every 1.5s)
          |                                              | B. Sends POST /api/control
          v                                              v
+-------------------------------------------------------------------+
|                       Express.js Server                           |
|                                                                   |
|  * Validates & stores latest telemetry in memory                  |
|  * Tracks ESP32 connection health (configurable timeout)          |
|  * Maintains desired EV1 & EV2 charging commands in memory        |
|  * Delivers desired control command directly in HTTP response     |
+-------------------------------------------------------------------+
          |
          | 2. HTTP 200 JSON Response (desired control command)
          v
+-------------------+
|   ESP32 Device    |
| (Applies command) |
+-------------------+
```

### Key Protocol Principle: Single-Point Handshake

> **ESP32 POSTs telemetry to `/`**
>
> **Express stores telemetry and responds directly with the current command.**

1. The ESP32 does **NOT** call separate telemetry or control endpoints.
2. The ESP32 does **NOT** require WebSockets.
3. The ESP32 is an HTTP client; the server never initiates outbound connections to the ESP32.
4. When a user interacts with the browser dashboard, the desired state is updated on the Express server in memory. The **next time** the ESP32 posts telemetry to `/`, the server responds with that updated command.

---

## 🔌 ESP32 Communication Protocol

### Endpoint

```http
POST /
Content-Type: application/json
```

### Exact ESP32 Telemetry Payload

The ESP32 sends the following JSON payload on every cycle:

```json
{
  "time": "2026-09-17T08:39:25",
  "solar_power": 245,
  "bess_power": 180,
  "grid_power": 0,
  "ev1_power": 150,
  "ev2_power": 0,
  "grid": false,
  "ev1": true,
  "ev2": false
}
```

#### Field Definitions

| Field | Type | Description |
| :--- | :--- | :--- |
| `time` | `string` | ISO timestamp or formatted string from ESP32 clock |
| `solar_power` | `number` | Measured photovoltaic power generation in Watts (W) |
| `bess_power` | `number` | Measured battery storage system exchange in Watts (W) |
| `grid_power` | `number` | Measured utility grid exchange in Watts (W) |
| `ev1_power` | `number` | Measured power delivered to EV Port 1 in Watts (W) |
| `ev2_power` | `number` | Measured power delivered to EV Port 2 in Watts (W) |
| `grid` | `boolean` | Grid availability (`true` = available, `false` = unavailable) |
| `ev1` | `boolean` | EV Port 1 charging state (`true` = charging, `false` = idle) |
| `ev2` | `boolean` | EV Port 2 charging state (`true` = charging, `false` = idle) |

---

### Exact ESP32 Response Payload

The server processes the telemetry and responds with **exactly** this JSON structure:

```json
{
  "ev1_charge": true,
  "ev2_charge": false,
  "ev1_source": 1,
  "ev2_source": 0
}
```

#### Fixed Source Mapping

Source values are strictly numeric (the server never outputs string names like `"solar"` or `"battery"`):

| Value | Source |
| :---: | :--- |
| **`0`** | **Solar** |
| **`1`** | **Battery** |
| **`2`** | **Grid** |

---

## 💻 Web Dashboard Endpoints (Browser Only)

These endpoints are strictly for the browser user interface. The ESP32 must not call them.

### 1. Serve Dashboard HTML
```http
GET /
```
Serves the control room web interface (`public/index.html`).

### 2. Status Polling API
```http
GET /api/status
```
Returns system status, latest telemetry, connection state, desired control state, and synchronization status. Polled by the dashboard every 1.5 seconds.

**Sample Response:**
```json
{
  "connected": true,
  "connectionStatus": "CONNECTED",
  "timeoutMs": 10000,
  "lastReceivedAt": "2026-09-17T08:39:25.000Z",
  "lastControlUpdatedAt": "2026-09-17T08:39:26.100Z",
  "telemetry": {
    "time": "2026-09-17T08:39:25",
    "solar_power": 245,
    "bess_power": 180,
    "grid_power": 0,
    "ev1_power": 150,
    "ev2_power": 0,
    "grid": false,
    "ev1": true,
    "ev2": false,
    "soc": null
  },
  "desiredControl": {
    "ev1_charge": true,
    "ev2_charge": false,
    "ev1_source": 1,
    "ev2_source": 0,
    "ev1_source_label": "BATTERY",
    "ev2_source_label": "SOLAR"
  },
  "syncStatus": {
    "ev1_pending": false,
    "ev2_pending": false,
    "all_synced": true
  }
}
```

### 3. Browser Control Update API
```http
POST /api/control
Content-Type: application/json
```

**Payload:**
```json
{
  "ev1_charge": true,
  "ev2_charge": false,
  "ev1_source": 1,
  "ev2_source": 0
}
```

**Validation Rules:**
* `ev1_charge`: boolean
* `ev2_charge`: boolean
* `ev1_source`: 0, 1, or 2
* `ev2_source`: 0, 1, or 2

---

## 🔋 Battery SOC Design

* The hardware team will provide battery SOC information separately.
* The existing telemetry payload format is strictly preserved.
* Until valid hardware SOC is transmitted, the dashboard explicitly displays:
  ```text
  -- %
  ```
* When the circuit is ready and provides `soc: 85` (or `battery_soc: 85`), the application automatically parses and displays it cleanly without breaking backward compatibility.

---

## 🔌 Connection & Command Sync Status

* **ESP32 Connection Status**:
  * `CONNECTED`: Telemetry received within `ESP32_TIMEOUT_MS`.
  * `WAITING`: Server started, waiting for first packet from ESP32.
  * `DISCONNECTED`: No telemetry packet received within the configured timeout.
* **Command Feedback**:
  * Displays **`COMMAND PENDING`** when requested control does not yet match the physical telemetry state from the ESP32.
  * Displays **`IN SYNC WITH ESP32`** once the ESP32 has acknowledged and applied the desired state.

---

## 🚀 Quickstart & Installation

### 1. Prerequisites
* Node.js v18+ (tested on Node.js v22)
* npm

### 2. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 3. Configure Environment Variables
Create or edit `.env`:
```bash
cp .env.example .env
```

Default variables:
```env
PORT=3000
ESP32_TIMEOUT_MS=10000
```

### 4. Start the Application
```bash
npm start
```
* Dashboard URL: `http://localhost:3000/`
* ESP32 Target: `http://<YOUR_LOCAL_IP>:3000/`

---

## 🧪 Testing & Simulation

### Run Automated Tests
Runs verification tests asserting HTTP routes, payload validation, command staging, timeout triggers, and error isolation:
```bash
npm test
```

### Run ESP32 Hardware Simulator
Test the complete real-time loop without physical hardware:
```bash
npm run simulate
```
The simulator:
1. Sends realistic telemetry to `POST http://localhost:3000/` every 2 seconds.
2. Logs the received command response from Express.
3. Automatically updates EV charging states to demonstrate live two-way synchronization in the dashboard.

---

## 📁 Project Structure

```text
.
├── server.js               # Main Express application & routing
├── package.json            # Dependencies & npm scripts
├── .env                    # Runtime configuration
├── .env.example            # Environment template
├── README.md               # Complete documentation
├── src/
│   └── services/
│       └── esp32.js        # ESP32 intake & control state service abstraction
├── public/
│   ├── index.html          # Large-screen HTML5 dashboard
│   ├── styles.css          # Control-room dark theme stylesheet
│   └── app.js              # Polling, UI rendering & control dispatch
├── scripts/
│   └── simulate-esp32.js   # Hardware simulator for local testing
└── test/
    └── test-api.js         # Automated test suite
```
