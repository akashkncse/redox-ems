require('dotenv').config();
const path = require('path');
const express = require('express');
const { Esp32Service } = require('./src/services/esp32');

const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const ESP32_TIMEOUT_MS = parseInt(process.env.ESP32_TIMEOUT_MS, 10) || 10000;

// Initialize ESP32 service
const esp32Service = new Esp32Service({
  timeoutMs: ESP32_TIMEOUT_MS
});

// Middleware: Parse JSON bodies
app.use(express.json());

// Middleware: Handle invalid JSON syntax gracefully (without crashing or leaking stack traces)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  next(err);
});

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================================================
   ESP32 INTAKE & COMMAND DISPATCH PROTOCOL
   ========================================================================== */

/**
 * ESP32 Primary Endpoint: POST /
 * The ESP32 sends telemetry to this endpoint.
 * The server processes telemetry, stores it, and immediately returns
 * the desired EV control command in the HTTP response.
 *
 * Expected Request Payload:
 * {
 *   "time": "2026-09-17T08:39:25",
 *   "solar_power": 245,
 *   "bess_power": 180,
 *   "grid_power": 0,
 *   "ev1_power": 150,
 *   "ev2_power": 0,
 *   "grid": false,
 *   "ev1": true,
 *   "ev2": false
 * }
 *
 * Exact Response Payload:
 * {
 *   "ev1_charge": true,
 *   "ev2_charge": false,
 *   "ev1_source": 1,
 *   "ev2_source": 0
 * }
 */
app.post('/', (req, res) => {
  try {
    const controlResponse = esp32Service.handleEsp32Post(req.body);
    return res.status(200).json(controlResponse);
  } catch (err) {
    return res.status(400).json({
      error: err.message || 'Invalid ESP32 telemetry payload'
    });
  }
});

/* ==========================================================================
   WEB DASHBOARD CLIENT ENDPOINTS
   ========================================================================== */

/**
 * Browser Dashboard UI: GET /
 * Delivers the single large-screen monitoring & control dashboard.
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Browser Status Endpoint: GET /api/status
 * Exposes latest telemetry, connection health, desired controls, and sync state.
 * For browser dashboard use only (ESP32 must not call this).
 */
app.get('/api/status', (req, res) => {
  try {
    const status = esp32Service.getStatus();
    return res.status(200).json(status);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve system status' });
  }
});

/**
 * Browser Control Endpoint: POST /api/control
 * Updates server's desired EV control state.
 * Validates strictly. Does NOT directly contact the ESP32.
 * The ESP32 receives this command upon its next POST / call.
 *
 * Expected Request:
 * {
 *   "ev1_charge": true,
 *   "ev2_charge": false,
 *   "ev1_source": 1,
 *   "ev2_source": 0
 * }
 */
app.post('/api/control', (req, res) => {
  try {
    const updatedControl = esp32Service.setDesiredControl(req.body);
    return res.status(200).json({
      success: true,
      desiredControl: updatedControl
    });
  } catch (err) {
    return res.status(400).json({
      error: err.message || 'Invalid control parameters'
    });
  }
});

/* ==========================================================================
   CENTRALIZED ERROR & 404 HANDLING
   ========================================================================== */

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

/* ==========================================================================
   START SERVER
   ========================================================================== */

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`⚡ Solar + Battery + Grid EV Charging EMS Server`);
    console.log(`📡 ESP32 Telemetry & Control: POST http://localhost:${PORT}/`);
    console.log(`💻 Web Dashboard:              GET  http://localhost:${PORT}/`);
    console.log(`📊 Browser Status API:         GET  http://localhost:${PORT}/api/status`);
    console.log(`🎛️ Browser Control API:        POST http://localhost:${PORT}/api/control`);
    console.log(`⏱️ ESP32 Disconnect Timeout:   ${ESP32_TIMEOUT_MS} ms`);
    console.log(`====================================================`);
  });
}

module.exports = { app, esp32Service };
