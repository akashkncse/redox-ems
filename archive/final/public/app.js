/**
 * REDOX EMS — Dashboard Frontend Logic
 * Polls GET /api/status and dispatches POST /api/control.
 */

// Local state
const state = {
  telemetry: null,
  desiredControl: {
    ev1_charge: false,
    ev2_charge: false,
    ev1_source: 0,
    ev2_source: 0
  },
  connectionStatus: 'WAITING',
  lastReceivedAt: null,
  isSubmittingControl: false
};

const SOURCE_LABELS = {
  0: 'SOLAR',
  1: 'BATTERY',
  2: 'GRID'
};

/* ==========================================================================
   INITIALIZATION & POLLING
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Start clock
  updateClock();
  setInterval(updateClock, 1000);

  // Initial fetch and start polling every 1500ms
  fetchStatus();
  setInterval(fetchStatus, 1500);
});

function updateClock() {
  const clockEl = document.getElementById('live-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString();
  }
}

/* ==========================================================================
   STATUS POLLING (GET /api/status)
   ========================================================================== */

async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    handleStatusUpdate(data);
  } catch (err) {
    handleFetchError(err);
  }
}

function handleFetchError(err) {
  const badge = document.getElementById('esp32-badge');
  const badgeText = document.getElementById('esp32-status-text');
  if (badge && badgeText) {
    badge.className = 'connection-badge status-disconnected';
    badgeText.textContent = 'SERVER UNREACHABLE';
  }
  const apiPill = document.getElementById('api-status-pill');
  if (apiPill) {
    apiPill.className = 'api-pill';
    apiPill.style.color = '#ef4444';
    apiPill.textContent = '● Backend Disconnected';
  }
}

function handleStatusUpdate(data) {
  state.connectionStatus = data.connectionStatus;
  state.lastReceivedAt = data.lastReceivedAt;
  state.telemetry = data.telemetry;

  // Only update desiredControl from server if user is not actively submitting
  if (!state.isSubmittingControl && data.desiredControl) {
    state.desiredControl = {
      ev1_charge: data.desiredControl.ev1_charge,
      ev2_charge: data.desiredControl.ev2_charge,
      ev1_source: data.desiredControl.ev1_source,
      ev2_source: data.desiredControl.ev2_source
    };
  }

  // Render components
  renderConnectionStatus(data);
  renderTopStatusStrip(data);
  renderKpiCards(data.telemetry);
  renderPowerFlow(data.telemetry);
  renderEvControlStations(data);
  renderDiagnostics(data);
}

/* ==========================================================================
   RENDER: CONNECTION STATUS & TIMESTAMP
   ========================================================================== */

function renderConnectionStatus(data) {
  const badge = document.getElementById('esp32-badge');
  const badgeText = document.getElementById('esp32-status-text');
  const timeText = document.getElementById('last-telemetry-time');

  if (!badge || !badgeText || !timeText) return;

  if (data.connectionStatus === 'CONNECTED') {
    badge.className = 'connection-badge status-connected';
    badgeText.textContent = 'ESP32 CONNECTED';
  } else if (data.connectionStatus === 'WAITING') {
    badge.className = 'connection-badge status-waiting';
    badgeText.textContent = 'ESP32 WAITING';
  } else {
    badge.className = 'connection-badge status-disconnected';
    badgeText.textContent = 'ESP32 DISCONNECTED';
  }

  if (data.lastReceivedAt && data.telemetry) {
    const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(data.lastReceivedAt).getTime()) / 1000));
    timeText.textContent = `${data.telemetry.time} (${elapsedSec}s ago)`;
  } else {
    timeText.textContent = 'Awaiting initial packet';
  }
}

/* ==========================================================================
   RENDER: TOP STATUS STRIP
   ========================================================================== */

function renderTopStatusStrip(data) {
  const espVal = document.getElementById('strip-esp-val');
  const espSub = document.getElementById('strip-esp-sub');
  const gridVal = document.getElementById('strip-grid-val');
  const gridSub = document.getElementById('strip-grid-sub');
  const ev1Val = document.getElementById('strip-ev1-val');
  const ev1Sub = document.getElementById('strip-ev1-sub');
  const ev2Val = document.getElementById('strip-ev2-val');
  const ev2Sub = document.getElementById('strip-ev2-sub');

  // ESP32 Pill
  if (espVal) {
    if (data.connectionStatus === 'CONNECTED') {
      espVal.className = 'status-pill-val val-connected';
      espVal.textContent = 'CONNECTED';
    } else if (data.connectionStatus === 'WAITING') {
      espVal.className = 'status-pill-val val-waiting';
      espVal.textContent = 'WAITING';
    } else {
      espVal.className = 'status-pill-val val-disconnected';
      espVal.textContent = 'DISCONNECTED';
    }
  }
  if (espSub) {
    espSub.textContent = `Timeout: ${data.timeoutMs / 1000}s`;
  }

  const tel = data.telemetry;
  if (!tel) {
    if (gridVal) { gridVal.className = 'status-pill-val val-off'; gridVal.textContent = 'WAITING'; }
    if (ev1Val) { ev1Val.className = 'status-pill-val val-off'; ev1Val.textContent = 'WAITING'; }
    if (ev2Val) { ev2Val.className = 'status-pill-val val-off'; ev2Val.textContent = 'WAITING'; }
    return;
  }

  // Grid Pill
  if (gridVal) {
    if (tel.grid) {
      gridVal.className = 'status-pill-val val-available';
      gridVal.textContent = 'AVAILABLE';
    } else {
      gridVal.className = 'status-pill-val val-unavailable';
      gridVal.textContent = 'UNAVAILABLE';
    }
  }
  if (gridSub) {
    gridSub.textContent = `Measured: ${tel.grid_power} W`;
  }

  // EV1 Pill
  if (ev1Val) {
    if (tel.ev1) {
      ev1Val.className = 'status-pill-val val-charging';
      ev1Val.textContent = 'CHARGING';
    } else {
      ev1Val.className = 'status-pill-val val-off';
      ev1Val.textContent = 'NOT CHARGING';
    }
  }
  if (ev1Sub) {
    ev1Sub.textContent = `Measured: ${tel.ev1_power} W`;
  }

  // EV2 Pill
  if (ev2Val) {
    if (tel.ev2) {
      ev2Val.className = 'status-pill-val val-charging';
      ev2Val.textContent = 'CHARGING';
    } else {
      ev2Val.className = 'status-pill-val val-off';
      ev2Val.textContent = 'NOT CHARGING';
    }
  }
  if (ev2Sub) {
    ev2Sub.textContent = `Measured: ${tel.ev2_power} W`;
  }
}

/* ==========================================================================
   RENDER: PRIMARY KPI METRIC CARDS
   ========================================================================== */

function renderKpiCards(tel) {
  const solarEl = document.getElementById('metric-solar');
  const bessEl = document.getElementById('metric-bess');
  const gridEl = document.getElementById('metric-grid');
  const socEl = document.getElementById('metric-soc');
  const ev1El = document.getElementById('metric-ev1');
  const ev2El = document.getElementById('metric-ev2');

  const gridBadge = document.getElementById('grid-status-badge');
  const ev1Badge = document.getElementById('ev1-state-badge');
  const ev2Badge = document.getElementById('ev2-state-badge');

  if (!tel) {
    if (solarEl) solarEl.textContent = '--';
    if (bessEl) bessEl.textContent = '--';
    if (gridEl) gridEl.textContent = '--';
    if (socEl) socEl.textContent = '-- %';
    if (ev1El) ev1El.textContent = '--';
    if (ev2El) ev2El.textContent = '--';
    return;
  }

  // 1. Solar
  if (solarEl) solarEl.textContent = tel.solar_power;

  // 2. Battery / BESS
  if (bessEl) bessEl.textContent = tel.bess_power;

  // 3. Grid Power
  if (gridEl) gridEl.textContent = tel.grid_power;
  if (gridBadge) {
    gridBadge.textContent = tel.grid ? 'Grid: Available' : 'Grid: Unavailable';
  }

  // 4. Battery SOC (Strict requirement: display -- % until valid hardware SOC is provided)
  if (socEl) {
    if (tel.soc !== null && tel.soc !== undefined && typeof tel.soc === 'number') {
      socEl.textContent = `${tel.soc} %`;
    } else {
      socEl.textContent = '-- %';
    }
  }

  // 5. EV1 Power
  if (ev1El) ev1El.textContent = tel.ev1_power;
  if (ev1Badge) {
    ev1Badge.textContent = tel.ev1 ? 'Status: Charging' : 'Status: Idle';
  }

  // 6. EV2 Power
  if (ev2El) ev2El.textContent = tel.ev2_power;
  if (ev2Badge) {
    ev2Badge.textContent = tel.ev2 ? 'Status: Charging' : 'Status: Idle';
  }
}

/* ==========================================================================
   RENDER: POWER FLOW DIAGRAM (SVG Paths & Values)
   ========================================================================== */

function renderPowerFlow(tel) {
  const solarVal = document.getElementById('flow-solar-val');
  const bessVal = document.getElementById('flow-bess-val');
  const socVal = document.getElementById('flow-soc-val');
  const gridVal = document.getElementById('flow-grid-val');
  const gridStatus = document.getElementById('flow-grid-status');
  const ev1Val = document.getElementById('flow-ev1-val');
  const ev2Val = document.getElementById('flow-ev2-val');

  const pathSolar = document.getElementById('path-solar');
  const pathBattery = document.getElementById('path-battery');
  const pathGrid = document.getElementById('path-grid');
  const pathEv1 = document.getElementById('path-ev1');
  const pathEv2 = document.getElementById('path-ev2');

  if (!tel) {
    if (solarVal) solarVal.textContent = '0 W';
    if (bessVal) bessVal.textContent = '0 W';
    if (socVal) socVal.textContent = 'SOC: -- %';
    if (gridVal) gridVal.textContent = '0 W';
    if (gridStatus) gridStatus.textContent = 'DISCONNECTED';
    if (ev1Val) ev1Val.textContent = '0 W';
    if (ev2Val) ev2Val.textContent = '0 W';
    return;
  }

  // Node text updates
  if (solarVal) solarVal.textContent = `${tel.solar_power} W`;
  if (bessVal) bessVal.textContent = `${tel.bess_power} W`;
  if (socVal) socVal.textContent = `SOC: ${tel.soc !== null && tel.soc !== undefined ? tel.soc + ' %' : '-- %'}`;
  if (gridVal) gridVal.textContent = `${tel.grid_power} W`;
  if (gridStatus) gridStatus.textContent = tel.grid ? 'AVAILABLE' : 'UNAVAILABLE';
  if (ev1Val) ev1Val.textContent = `${tel.ev1_power} W`;
  if (ev2Val) ev2Val.textContent = `${tel.ev2_power} W`;

  // Flow path active animation toggles based strictly on telemetry values
  if (pathSolar) {
    pathSolar.className.baseVal = tel.solar_power > 0 ? 'flow-path path-active-solar' : 'flow-path path-inactive';
  }
  if (pathBattery) {
    pathBattery.className.baseVal = tel.bess_power > 0 ? 'flow-path path-active-battery' : 'flow-path path-inactive';
  }
  if (pathGrid) {
    pathGrid.className.baseVal = tel.grid_power > 0 ? 'flow-path path-active-grid' : 'flow-path path-inactive';
  }
  if (pathEv1) {
    pathEv1.className.baseVal = (tel.ev1 || tel.ev1_power > 0) ? 'flow-path path-active-ev1' : 'flow-path path-inactive';
  }
  if (pathEv2) {
    pathEv2.className.baseVal = (tel.ev2 || tel.ev2_power > 0) ? 'flow-path path-active-ev2' : 'flow-path path-inactive';
  }
}

/* ==========================================================================
   RENDER: EV CONTROL STATIONS (EV1 & EV2)
   ========================================================================== */

function renderEvControlStations(data) {
  const tel = data.telemetry;
  const desired = data.desiredControl || state.desiredControl;
  const sync = data.syncStatus || {};

  renderSingleStation(1, tel ? tel.ev1 : null, tel ? tel.ev1_power : 0, desired.ev1_charge, desired.ev1_source, sync.ev1_pending);
  renderSingleStation(2, tel ? tel.ev2 : null, tel ? tel.ev2_power : 0, desired.ev2_charge, desired.ev2_source, sync.ev2_pending);
}

function renderSingleStation(port, actualCharging, actualPower, reqCharge, reqSource, isPending) {
  const prefix = `ev${port}`;

  // Actual Status Badge
  const actualBadge = document.getElementById(`${prefix}-actual-badge`);
  if (actualBadge) {
    if (actualCharging === true) {
      actualBadge.className = 'actual-status-pill status-charging';
      actualBadge.textContent = 'CHARGING';
    } else if (actualCharging === false) {
      actualBadge.className = 'actual-status-pill status-off';
      actualBadge.textContent = 'NOT CHARGING';
    } else {
      actualBadge.className = 'actual-status-pill status-off';
      actualBadge.textContent = 'WAITING';
    }
  }

  // Current Power Reading
  const powerEl = document.getElementById(`${prefix}-ctrl-power`);
  if (powerEl) {
    powerEl.textContent = actualPower !== null && actualPower !== undefined ? actualPower : 0;
  }

  // Actual State Description
  const actualDot = document.getElementById(`${prefix}-actual-dot`);
  const actualText = document.getElementById(`${prefix}-actual-state-text`);
  if (actualText && actualDot) {
    if (actualCharging === true) {
      actualDot.className = 'comp-indicator-dot dot-charging';
      actualText.textContent = `CHARGING (${actualPower} W)`;
    } else if (actualCharging === false) {
      actualDot.className = 'comp-indicator-dot dot-off';
      actualText.textContent = `NOT CHARGING (${actualPower} W)`;
    } else {
      actualDot.className = 'comp-indicator-dot dot-off';
      actualText.textContent = 'NO TELEMETRY';
    }
  }

  // Requested State Description
  const reqText = document.getElementById(`${prefix}-req-state-text`);
  if (reqText) {
    const chargeStr = reqCharge ? 'CHARGING' : 'OFF';
    const sourceStr = SOURCE_LABELS[reqSource] || 'SOLAR';
    reqText.textContent = `${chargeStr} — ${sourceStr}`;
  }

  // Pending vs Synced indicators
  const pendingPill = document.getElementById(`${prefix}-pending-pill`);
  const syncedPill = document.getElementById(`${prefix}-synced-pill`);

  // Pending condition:
  // 1. Explicit sync flag from server
  // 2. OR actual charging state does not match requested charging state (if telemetry exists)
  const chargeMismatch = actualCharging !== null && actualCharging !== reqCharge;
  const showPending = Boolean(isPending || chargeMismatch);

  if (pendingPill && syncedPill) {
    if (showPending) {
      pendingPill.classList.remove('hidden');
      syncedPill.classList.add('hidden');
    } else {
      pendingPill.classList.add('hidden');
      syncedPill.classList.remove('hidden');
    }
  }

  // Update button active classes
  const btnOn = document.getElementById(`btn-${prefix}-on`);
  const btnOff = document.getElementById(`btn-${prefix}-off`);
  if (btnOn && btnOff) {
    if (reqCharge) {
      btnOn.classList.add('active');
      btnOff.classList.remove('active');
    } else {
      btnOff.classList.add('active');
      btnOn.classList.remove('active');
    }
  }

  // Update source selector button active classes
  [0, 1, 2].forEach(src => {
    const btnSrc = document.getElementById(`btn-${prefix}-src-${src}`);
    if (btnSrc) {
      if (reqSource === src) {
        btnSrc.classList.add('active');
      } else {
        btnSrc.classList.remove('active');
      }
    }
  });
}

/* ==========================================================================
   RENDER: DIAGNOSTICS & SYSTEM FOOTER
   ========================================================================== */

function renderDiagnostics(data) {
  const diagText = document.getElementById('diag-summary-text');
  if (!diagText) return;

  if (data.connectionStatus === 'CONNECTED' && data.telemetry) {
    diagText.textContent = `Active ESP32 Stream | Last packet: ${data.telemetry.time} | All systems operational.`;
  } else if (data.connectionStatus === 'WAITING') {
    diagText.textContent = 'Server listening on POST / ... waiting for initial ESP32 telemetry packet.';
  } else {
    diagText.textContent = `ESP32 connection timed out (no POST in past ${data.timeoutMs / 1000}s). Retaining last known state.`;
  }
}

/* ==========================================================================
   INTERACTIVE USER CONTROLS: POST /api/control
   ========================================================================== */

/**
 * Handle user clicking ON or OFF for an EV port.
 * @param {1 | 2} port
 * @param {boolean} chargeState
 */
async function setEvCharge(port, chargeState) {
  if (port === 1) {
    state.desiredControl.ev1_charge = chargeState;
  } else {
    state.desiredControl.ev2_charge = chargeState;
  }
  await submitControlUpdate();
}

/**
 * Handle user clicking an Energy Source button for an EV port.
 * @param {1 | 2} port
 * @param {0 | 1 | 2} sourceValue
 */
async function setEvSource(port, sourceValue) {
  if (port === 1) {
    state.desiredControl.ev1_source = sourceValue;
  } else {
    state.desiredControl.ev2_source = sourceValue;
  }
  await submitControlUpdate();
}

/**
 * Dispatches POST /api/control to Express server with the current desired control state.
 * Validates payload strictly before sending.
 */
async function submitControlUpdate() {
  const apiPill = document.getElementById('api-status-pill');
  state.isSubmittingControl = true;

  if (apiPill) {
    apiPill.className = 'api-pill api-sending';
    apiPill.innerHTML = '<span>⏳</span> Sending to Server...';
  }

  // Immediate optimistic local render
  renderSingleStation(
    1,
    state.telemetry ? state.telemetry.ev1 : null,
    state.telemetry ? state.telemetry.ev1_power : 0,
    state.desiredControl.ev1_charge,
    state.desiredControl.ev1_source,
    true // Mark pending immediately
  );
  renderSingleStation(
    2,
    state.telemetry ? state.telemetry.ev2 : null,
    state.telemetry ? state.telemetry.ev2_power : 0,
    state.desiredControl.ev2_charge,
    state.desiredControl.ev2_source,
    true // Mark pending immediately
  );

  const payload = {
    ev1_charge: Boolean(state.desiredControl.ev1_charge),
    ev2_charge: Boolean(state.desiredControl.ev2_charge),
    ev1_source: Number(state.desiredControl.ev1_source),
    ev2_source: Number(state.desiredControl.ev2_source)
  };

  try {
    const response = await fetch('/api/control', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.desiredControl) {
      state.desiredControl = data.desiredControl;
    }

    if (apiPill) {
      apiPill.className = 'api-pill api-success';
      apiPill.innerHTML = '<span>✓</span> Command Stored for Next ESP32 Handshake';
      setTimeout(() => {
        if (apiPill) {
          apiPill.className = 'api-pill api-idle';
          apiPill.innerHTML = '<span>●</span> Server State Ready';
        }
      }, 3000);
    }
  } catch (err) {
    console.error('Failed to submit control:', err);
    if (apiPill) {
      apiPill.className = 'api-pill';
      apiPill.style.color = '#ef4444';
      apiPill.innerHTML = `<span>⚠️</span> ${err.message}`;
    }
  } finally {
    state.isSubmittingControl = false;
  }
}
