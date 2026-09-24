/**
 * ESP32 Service
 * Handles ESP32 telemetry intake, control response generation,
 * desired state management, and connection status tracking.
 */

// Source mapping definitions (fixed protocol values)
const SOURCE_SOLAR = 0;
const SOURCE_BATTERY = 1;
const SOURCE_GRID = 2;

const VALID_SOURCES = [SOURCE_SOLAR, SOURCE_BATTERY, SOURCE_GRID];
const SOURCE_LABELS = {
  [SOURCE_SOLAR]: 'SOLAR',
  [SOURCE_BATTERY]: 'BATTERY',
  [SOURCE_GRID]: 'GRID'
};

/**
 * Default safe control state on startup.
 * Can easily be adjusted or configured.
 */
const DEFAULT_CONTROL_STATE = {
  ev1_charge: false,
  ev2_charge: false,
  ev1_source: SOURCE_SOLAR, // 0
  ev2_source: SOURCE_SOLAR  // 0
};

class Esp32Service {
  /**
   * @param {Object} options
   * @param {number} [options.timeoutMs=10000] - ESP32 disconnection timeout in ms
   * @param {Object} [options.initialControl] - Optional initial desired control override
   */
  constructor(options = {}) {
    this.timeoutMs = Number(options.timeoutMs) || 10000;

    // Desired control state stored in server memory
    this.desiredControl = {
      ...DEFAULT_CONTROL_STATE,
      ...(options.initialControl || {})
    };

    // Telemetry state stored in server memory
    this.latestTelemetry = null;
    this.lastReceivedAt = null;
    this.lastControlUpdatedAt = null;
    this.lastHandshakeAt = null;
  }

  /**
   * Primary ESP32 handler:
   * 1. Validates incoming JSON
   * 2. Stores latest telemetry in server memory
   * 3. Stores/updates latest telemetry timestamp
   * 4. Determines current desired control state
   * 5. Returns current control payload
   *
   * @param {Object} rawTelemetry - Telemetry payload from ESP32 POST /
   * @returns {Object} Exact control JSON structure for ESP32
   */
  handleEsp32Post(rawTelemetry) {
    const validated = this.validateTelemetry(rawTelemetry);

    const now = Date.now();
    this.latestTelemetry = {
      ...validated,
      _receivedAt: new Date(now).toISOString()
    };
    this.lastReceivedAt = now;
    this.lastHandshakeAt = now;

    return this.getControlResponse();
  }

  /**
   * Returns exact JSON structure required by ESP32 protocol.
   * Source values are strictly numeric: 0 (solar), 1 (battery), 2 (grid).
   * Never returns string names to the ESP32.
   *
   * @returns {{ev1_charge: boolean, ev2_charge: boolean, ev1_source: number, ev2_source: number}}
   */
  getControlResponse() {
    return {
      ev1_charge: Boolean(this.desiredControl.ev1_charge),
      ev2_charge: Boolean(this.desiredControl.ev2_charge),
      ev1_source: Number(this.desiredControl.ev1_source),
      ev2_source: Number(this.desiredControl.ev2_source)
    };
  }

  /**
   * Validates incoming telemetry payload from ESP32.
   * Throws Error if structure or types are invalid.
   *
   * @param {any} data
   * @returns {Object}
   */
  validateTelemetry(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Telemetry payload must be a valid JSON object');
    }

    const requiredFields = [
      'time',
      'solar_power',
      'bess_power',
      'grid_power',
      'ev1_power',
      'ev2_power',
      'grid',
      'ev1',
      'ev2'
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Missing required telemetry field: '${field}'`);
      }
    }

    if (typeof data.time !== 'string' || data.time.trim() === '') {
      throw new Error("Telemetry 'time' must be a non-empty string");
    }

    const numericFields = ['solar_power', 'bess_power', 'grid_power', 'ev1_power', 'ev2_power'];
    for (const field of numericFields) {
      if (typeof data[field] !== 'number' || !Number.isFinite(data[field])) {
        throw new Error(`Telemetry field '${field}' must be a finite number`);
      }
    }

    const booleanFields = ['grid', 'ev1', 'ev2'];
    for (const field of booleanFields) {
      if (typeof data[field] !== 'boolean') {
        throw new Error(`Telemetry field '${field}' must be a boolean`);
      }
    }

    // Battery SOC: Hardware team will provide SOC separately in the future.
    // Cleanly accept soc if provided (finite number), otherwise null.
    let soc = null;
    if (data.soc !== undefined && data.soc !== null) {
      if (typeof data.soc === 'number' && Number.isFinite(data.soc)) {
        soc = data.soc;
      }
    } else if (data.battery_soc !== undefined && data.battery_soc !== null) {
      if (typeof data.battery_soc === 'number' && Number.isFinite(data.battery_soc)) {
        soc = data.battery_soc;
      }
    }

    return {
      time: data.time,
      solar_power: data.solar_power,
      bess_power: data.bess_power,
      grid_power: data.grid_power,
      ev1_power: data.ev1_power,
      ev2_power: data.ev2_power,
      grid: data.grid,
      ev1: data.ev1,
      ev2: data.ev2,
      soc // null unless provided
    };
  }

  /**
   * Updates desired control state requested by browser dashboard.
   * Validates strictly according to protocol rules.
   *
   * @param {Object} controlPayload
   * @returns {Object} updated control state
   */
  setDesiredControl(controlPayload) {
    if (!controlPayload || typeof controlPayload !== 'object' || Array.isArray(controlPayload)) {
      throw new Error('Control payload must be a JSON object');
    }

    const { ev1_charge, ev2_charge, ev1_source, ev2_source } = controlPayload;

    if (typeof ev1_charge !== 'boolean') {
      throw new Error("'ev1_charge' must be a boolean (true or false)");
    }
    if (typeof ev2_charge !== 'boolean') {
      throw new Error("'ev2_charge' must be a boolean (true or false)");
    }

    if (!VALID_SOURCES.includes(ev1_source)) {
      throw new Error(`'ev1_source' must be 0 (solar), 1 (battery), or 2 (grid). Received: ${ev1_source}`);
    }
    if (!VALID_SOURCES.includes(ev2_source)) {
      throw new Error(`'ev2_source' must be 0 (solar), 1 (battery), or 2 (grid). Received: ${ev2_source}`);
    }

    this.desiredControl = {
      ev1_charge,
      ev2_charge,
      ev1_source,
      ev2_source
    };

    this.lastControlUpdatedAt = Date.now();
    return this.getControlResponse();
  }

  /**
   * Calculates connection status based on last POST / timestamp and timeout.
   * @returns {'CONNECTED' | 'DISCONNECTED' | 'WAITING'}
   */
  getConnectionStatus() {
    if (!this.lastReceivedAt) {
      return 'WAITING';
    }
    const elapsed = Date.now() - this.lastReceivedAt;
    return elapsed <= this.timeoutMs ? 'CONNECTED' : 'DISCONNECTED';
  }

  /**
   * Determines whether requested commands are pending ESP32 acknowledgment.
   * A command is considered pending if:
   * - Desired charging state does not match actual telemetry charging state, OR
   * - Control was updated after the last telemetry received from ESP32
   */
  getSyncStatus() {
    const isConnected = this.getConnectionStatus() === 'CONNECTED';
    const hasTelemetry = Boolean(this.latestTelemetry);

    if (!hasTelemetry) {
      return {
        ev1_pending: false,
        ev2_pending: false,
        all_synced: false,
        reason: 'WAITING_FIRST_TELEMETRY'
      };
    }

    const lastTelemetryTime = this.lastReceivedAt || 0;
    const lastUpdateTime = this.lastControlUpdatedAt || 0;
    const pendingHandshake = lastUpdateTime > lastTelemetryTime;

    const ev1_charge_mismatch = this.desiredControl.ev1_charge !== this.latestTelemetry.ev1;
    const ev2_charge_mismatch = this.desiredControl.ev2_charge !== this.latestTelemetry.ev2;

    const ev1_pending = pendingHandshake || ev1_charge_mismatch;
    const ev2_pending = pendingHandshake || ev2_charge_mismatch;

    return {
      ev1_pending,
      ev2_pending,
      all_synced: !ev1_pending && !ev2_pending
    };
  }

  /**
   * Full status payload returned to browser via GET /api/status.
   * This is for the dashboard UI only.
   */
  getStatus() {
    const connectionStatus = this.getConnectionStatus();
    const syncStatus = this.getSyncStatus();

    return {
      connected: connectionStatus === 'CONNECTED',
      connectionStatus,
      timeoutMs: this.timeoutMs,
      lastReceivedAt: this.lastReceivedAt ? new Date(this.lastReceivedAt).toISOString() : null,
      lastControlUpdatedAt: this.lastControlUpdatedAt ? new Date(this.lastControlUpdatedAt).toISOString() : null,
      telemetry: this.latestTelemetry,
      desiredControl: {
        ...this.getControlResponse(),
        ev1_source_label: SOURCE_LABELS[this.desiredControl.ev1_source],
        ev2_source_label: SOURCE_LABELS[this.desiredControl.ev2_source]
      },
      syncStatus,
      sourceMapping: {
        0: 'SOLAR',
        1: 'BATTERY',
        2: 'GRID'
      }
    };
  }
}

module.exports = {
  Esp32Service,
  SOURCE_SOLAR,
  SOURCE_BATTERY,
  SOURCE_GRID,
  SOURCE_LABELS,
  DEFAULT_CONTROL_STATE
};
