/**
 * ESP32 Hardware Simulator
 * Simulates an ESP32 sending telemetry via HTTP POST / to the Express server
 * and receiving the current EV control command in the HTTP response.
 *
 * Run with: npm run simulate
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const INTERVAL_MS = 2000;

// Internal simulated state of the physical hardware
let simulatedHardware = {
  solar_power: 245,
  bess_power: 180,
  grid_power: 0,
  grid: true,
  ev1_power: 0,
  ev2_power: 0,
  ev1: false,
  ev2: false
};

async function sendTelemetry() {
  const nowStr = new Date().toISOString().replace(/\.\d{3}Z$/, '');

  // Add realistic subtle fluctuations
  const solarVariation = Math.floor(Math.random() * 11) - 5;
  const solar = Math.max(0, 240 + solarVariation);

  // Exact ESP32 Telemetry payload format required by protocol
  const payload = {
    time: nowStr,
    solar_power: solar,
    bess_power: simulatedHardware.ev1 || simulatedHardware.ev2 ? 180 : 20,
    grid_power: simulatedHardware.grid ? 0 : 0,
    ev1_power: simulatedHardware.ev1 ? (145 + Math.floor(Math.random() * 10)) : 0,
    ev2_power: simulatedHardware.ev2 ? (190 + Math.floor(Math.random() * 15)) : 0,
    grid: simulatedHardware.grid,
    ev1: simulatedHardware.ev1,
    ev2: simulatedHardware.ev2
  };

  try {
    console.log(`\n------------------------------------------------------------`);
    console.log(`[ESP32] Sending POST ${SERVER_URL}/`);
    console.log(`[ESP32] Telemetry:`, JSON.stringify(payload, null, 2));

    const res = await fetch(`${SERVER_URL}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[ESP32] Server returned HTTP ${res.status}:`, err);
      return;
    }

    const command = await res.json();
    console.log(`[ESP32] Received Control Command in Response:`, JSON.stringify(command, null, 2));

    // Apply the received command to the simulated physical state
    // (This mimics the ESP32 relays and power switches reacting to the server's command)
    simulatedHardware.ev1 = Boolean(command.ev1_charge);
    simulatedHardware.ev2 = Boolean(command.ev2_charge);

    const sourceNames = { 0: 'SOLAR', 1: 'BATTERY', 2: 'GRID' };
    console.log(`[ESP32] Applied State -> EV1: ${simulatedHardware.ev1 ? 'CHARGING (' + sourceNames[command.ev1_source] + ')' : 'OFF'} | EV2: ${simulatedHardware.ev2 ? 'CHARGING (' + sourceNames[command.ev2_source] + ')' : 'OFF'}`);

  } catch (err) {
    console.error(`[ESP32] Connection failed:`, err.message);
  }
}

console.log(`⚡ Starting ESP32 Simulator targeting ${SERVER_URL}/`);
console.log(`⏱️ Polling cadence: every ${INTERVAL_MS / 1000}s`);

// Run immediately and schedule
sendTelemetry();
setInterval(sendTelemetry, INTERVAL_MS);
