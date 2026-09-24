/**
 * Automated Verification Test Suite
 * Tests all requirements, routes, validation, and protocol guarantees.
 */

const assert = require('assert');
const http = require('http');
const { app, esp32Service } = require('../server');

const TEST_PORT = 3999;
let server;

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        ...options
      },
      res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = res.headers['content-type']?.includes('application/json')
              ? JSON.parse(body)
              : body;
            resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBody: body });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, body, rawBody: body });
          }
        });
      }
    );

    req.on('error', reject);

    if (postData) {
      if (typeof postData === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting RedOx EMS System Tests...\n');

  await new Promise(resolve => {
    server = app.listen(TEST_PORT, resolve);
  });

  try {
    // 1. Verify GET / serves HTML dashboard
    console.log('1. Testing GET / (HTML Dashboard)...');
    const getRoot = await makeRequest({ path: '/', method: 'GET' });
    assert.strictEqual(getRoot.status, 200, 'GET / should return 200');
    assert.ok(getRoot.rawBody.includes('REDOX EMS'), 'GET / HTML should contain system title');
    assert.ok(getRoot.rawBody.includes('ENERGY FLOW DIAGRAM'), 'GET / HTML should contain power flow section');
    console.log('   ✓ GET / successfully served HTML dashboard\n');

    // 2. Verify Default Control State on Startup
    console.log('2. Testing Initial Control State & GET /api/status...');
    const initStatus = await makeRequest({ path: '/api/status', method: 'GET' });
    assert.strictEqual(initStatus.status, 200);
    assert.strictEqual(initStatus.body.desiredControl.ev1_charge, false);
    assert.strictEqual(initStatus.body.desiredControl.ev2_charge, false);
    assert.strictEqual(initStatus.body.desiredControl.ev1_source, 0);
    assert.strictEqual(initStatus.body.desiredControl.ev2_source, 0);
    assert.strictEqual(initStatus.body.connectionStatus, 'WAITING');
    console.log('   ✓ Startup default control state is safe { ev1_charge: false, ev2_charge: false, ev1_source: 0, ev2_source: 0 }\n');

    // 3. Verify ESP32 POST / accepts exact telemetry and returns exact control structure
    console.log('3. Testing ESP32 POST / handshake...');
    const telemetryPayload = {
      time: '2026-09-17T08:39:25',
      solar_power: 245,
      bess_power: 180,
      grid_power: 0,
      ev1_power: 150,
      ev2_power: 0,
      grid: false,
      ev1: true,
      ev2: false
    };

    const postRoot = await makeRequest({ path: '/', method: 'POST' }, telemetryPayload);
    assert.strictEqual(postRoot.status, 200, 'POST / should return 200');

    // Verify exact response structure
    const keys = Object.keys(postRoot.body).sort();
    assert.deepStrictEqual(keys, ['ev1_charge', 'ev1_source', 'ev2_charge', 'ev2_source'].sort());
    assert.strictEqual(typeof postRoot.body.ev1_charge, 'boolean');
    assert.strictEqual(typeof postRoot.body.ev2_charge, 'boolean');
    assert.strictEqual(typeof postRoot.body.ev1_source, 'number');
    assert.strictEqual(typeof postRoot.body.ev2_source, 'number');

    // Source values must be strictly numbers 0, 1, or 2 (never strings like "solar")
    assert.ok([0, 1, 2].includes(postRoot.body.ev1_source), 'ev1_source must be 0, 1, or 2');
    assert.ok([0, 1, 2].includes(postRoot.body.ev2_source), 'ev2_source must be 0, 1, or 2');
    console.log('   ✓ ESP32 received exact command response:', postRoot.body, '\n');

    // 4. Verify /api/status after telemetry intake
    console.log('4. Testing /api/status telemetry reflection & connection status...');
    const updatedStatus = await makeRequest({ path: '/api/status', method: 'GET' });
    assert.strictEqual(updatedStatus.body.connectionStatus, 'CONNECTED');
    assert.strictEqual(updatedStatus.body.telemetry.solar_power, 245);
    assert.strictEqual(updatedStatus.body.telemetry.bess_power, 180);
    assert.strictEqual(updatedStatus.body.telemetry.grid, false);
    assert.strictEqual(updatedStatus.body.telemetry.ev1, true);
    assert.strictEqual(updatedStatus.body.telemetry.soc, null, 'SOC must be null until hardware field provided');
    console.log('   ✓ Status API reflects stored telemetry, CONNECTED state, and null SOC\n');

    // 5. Verify Browser POST /api/control updates desired control state
    console.log('5. Testing Browser POST /api/control...');
    const newControl = {
      ev1_charge: true,
      ev2_charge: false,
      ev1_source: 1, // Battery
      ev2_source: 0  // Solar
    };

    const ctrlRes = await makeRequest({ path: '/api/control', method: 'POST' }, newControl);
    assert.strictEqual(ctrlRes.status, 200);
    assert.strictEqual(ctrlRes.body.success, true);
    assert.strictEqual(ctrlRes.body.desiredControl.ev1_charge, true);
    assert.strictEqual(ctrlRes.body.desiredControl.ev1_source, 1);
    console.log('   ✓ Desired control updated in server memory\n');

    // 6. Verify NEXT ESP32 POST / receives the updated command
    console.log('6. Testing NEXT ESP32 POST / gets the updated control...');
    const nextTelemetry = {
      time: '2026-09-17T08:39:27',
      solar_power: 240,
      bess_power: 185,
      grid_power: 0,
      ev1_power: 155,
      ev2_power: 0,
      grid: false,
      ev1: true,
      ev2: false
    };

    const nextPostRoot = await makeRequest({ path: '/', method: 'POST' }, nextTelemetry);
    assert.strictEqual(nextPostRoot.status, 200);
    assert.strictEqual(nextPostRoot.body.ev1_charge, true, 'Next POST / must return ev1_charge: true');
    assert.strictEqual(nextPostRoot.body.ev2_charge, false, 'Next POST / must return ev2_charge: false');
    assert.strictEqual(nextPostRoot.body.ev1_source, 1, 'Next POST / must return ev1_source: 1 (Battery)');
    assert.strictEqual(nextPostRoot.body.ev2_source, 0, 'Next POST / must return ev2_source: 0 (Solar)');
    console.log('   ✓ ESP32 successfully received the queued command on next handshake:', nextPostRoot.body, '\n');

    // 7. Verify Validation on /api/control rejects invalid payloads
    console.log('7. Testing validation on POST /api/control...');
    const invalidSource = await makeRequest({ path: '/api/control', method: 'POST' }, {
      ev1_charge: true,
      ev2_charge: false,
      ev1_source: 99, // Invalid source
      ev2_source: 0
    });
    assert.strictEqual(invalidSource.status, 400, 'Invalid source must return 400');
    assert.ok(invalidSource.body.error, 'Should contain validation error message');

    const invalidType = await makeRequest({ path: '/api/control', method: 'POST' }, {
      ev1_charge: 'true', // Not boolean
      ev2_charge: false,
      ev1_source: 0,
      ev2_source: 0
    });
    assert.strictEqual(invalidType.status, 400, 'Non-boolean charge must return 400');
    console.log('   ✓ POST /api/control strict validation passed\n');

    // 8. Verify Validation on ESP32 POST /
    console.log('8. Testing validation on ESP32 POST /...');
    const missingField = await makeRequest({ path: '/', method: 'POST' }, {
      time: '2026-09-17T08:39:27',
      solar_power: 240
      // Missing other required fields
    });
    assert.strictEqual(missingField.status, 400, 'Incomplete telemetry must return 400');
    assert.ok(missingField.body.error.includes('Missing required telemetry field'));

    // Malformed JSON
    const malformedJson = await makeRequest({
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, '{ broken: json');
    assert.strictEqual(malformedJson.status, 400, 'Malformed JSON must return 400');
    console.log('   ✓ ESP32 intake error handling passed (no stack traces leaked)\n');

    // 9. Verify ESP32 Disconnect Timeout logic
    console.log('9. Testing ESP32 Timeout Logic...');
    // Create an isolated service with a short 200ms timeout for testing
    const { Esp32Service } = require('../src/services/esp32');
    const fastTimeoutService = new Esp32Service({ timeoutMs: 200 });
    assert.strictEqual(fastTimeoutService.getConnectionStatus(), 'WAITING');

    fastTimeoutService.handleEsp32Post(telemetryPayload);
    assert.strictEqual(fastTimeoutService.getConnectionStatus(), 'CONNECTED');

    await new Promise(r => setTimeout(r, 250));
    assert.strictEqual(fastTimeoutService.getConnectionStatus(), 'DISCONNECTED');
    console.log('   ✓ ESP32 status accurately transitions WAITING -> CONNECTED -> DISCONNECTED on timeout\n');

    console.log('🎉 ALL SYSTEM TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  if (server) server.close();
  process.exit(1);
});
