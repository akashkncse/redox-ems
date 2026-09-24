import { useCallback, useEffect, useState } from 'react'
import './App.css'

type Telemetry = {
  timestamp: string
  solar_power: number
  ev1_soc: number
  ev2_soc: number
  bess_soc: number
  grid_availability: boolean
  ev1: boolean
  ev1_source: number
  ev2: boolean
  ev2_source: number
}

type ControlState = Pick<Telemetry, 'ev1' | 'ev1_source' | 'ev2' | 'ev2_source'>

const API_BASE = 'http://localhost:8080'
const sourceNames: Record<number, string> = { 1: 'Battery', 2: 'Solar', 3: 'Grid' }

const fallbackTelemetry: Telemetry = {
  timestamp: new Date().toISOString(),
  solar_power: 0,
  ev1_soc: 0,
  ev2_soc: 0,
  bess_soc: 0,
  grid_availability: false,
  ev1: false,
  ev1_source: 1,
  ev2: false,
  ev2_source: 1,
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(timestamp: string) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function App() {
  const [telemetry, setTelemetry] = useState<Telemetry>(fallbackTelemetry)
  const [history, setHistory] = useState<Telemetry[]>([])
  const [controls, setControls] = useState<ControlState>(fallbackTelemetry)
  const [isConnected, setIsConnected] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [latestResponse, recentResponse, controlResponse] = await Promise.all([
        fetch(`${API_BASE}/latest`),
        fetch(`${API_BASE}/recent`),
        fetch(`${API_BASE}/control`),
      ])
      if (!latestResponse.ok || !recentResponse.ok || !controlResponse.ok) throw new Error('API unavailable')
      const [latest, recent, control] = await Promise.all([
        latestResponse.json() as Promise<Telemetry>,
        recentResponse.json() as Promise<Telemetry[]>,
        controlResponse.json() as Promise<ControlState>,
      ])
      setTelemetry(latest)
      setHistory(recent)
      setControls(control)
      setIsConnected(true)
    } catch {
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
    const interval = window.setInterval(() => void loadData(), 2500)
    return () => window.clearInterval(interval)
  }, [loadData])

  async function saveControls() {
    setIsSaving(true)
    setSaveMessage('')
    try {
      const response = await fetch(`${API_BASE}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(controls),
      })
      if (!response.ok) throw new Error('Could not save controls')
      setSaveMessage('Controls applied')
    } catch {
      setSaveMessage('Unable to reach controller')
    } finally {
      setIsSaving(false)
      window.setTimeout(() => setSaveMessage(''), 3000)
    }
  }

  function updateControl(field: keyof ControlState, value: boolean | number) {
    setControls((current) => ({ ...current, [field]: value }))
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup"><img src="/Redox.svg" alt="Redox" /><div><strong>Redox EMS</strong><span>Energy management system</span></div></div>
        <div className="connection-status"><span className={`status-dot ${isConnected ? 'online' : ''}`} />{isConnected ? 'Live connection' : 'Waiting for backend'}<span className="divider" />Updated {formatTime(telemetry.timestamp)}</div>
      </header>

      <section className="page-intro"><div><p className="eyebrow">Redox EMS</p><h1></h1><p className="intro-copy">Monitor site generation, storage and EV charging in real time.</p></div><div className="refresh-note"><span className="pulse-line" />Auto-refreshing <strong>2.5s</strong></div></section>

      <section className="telemetry-grid" aria-label="Live telemetry">
        <article className="metric-card solar-card"><div className="metric-heading"><span className="metric-icon sun">☼</span><span>Solar power</span><span className="live-label">LIVE</span></div><strong className="metric-value">{Number(telemetry.solar_power).toLocaleString()}<small> W</small></strong><div className="metric-foot"><span>Current output</span><span className="trend">● tracking</span></div></article>
        <article className="metric-card"><div className="metric-heading"><span className="metric-icon battery">▰</span><span>BESS state of charge</span></div><strong className="metric-value">{telemetry.bess_soc}<small>%</small></strong><div className="meter"><span style={{ width: `${Math.min(100, Math.max(0, telemetry.bess_soc))}%` }} /></div><div className="metric-foot"><span></span><span>{telemetry.bess_soc > 20 ? '' : ''}</span></div></article>
        <article className="metric-card"><div className="metric-heading"><span className="metric-icon ev">⚡</span><span>EV fleet average</span></div><strong className="metric-value">{Math.round((telemetry.ev1_soc + telemetry.ev2_soc) / 2)}<small>%</small></strong><div className="metric-foot"><span>EV1 {telemetry.ev1_soc}% · EV2 {telemetry.ev2_soc}%</span><span>2 vehicles</span></div></article>
        <article className="metric-card grid-card"><div className="metric-heading"><span className="metric-icon grid">⌁</span><span>Grid availability</span></div><strong className={`availability ${telemetry.grid_availability ? 'available' : ''}`}>{telemetry.grid_availability ? 'Available' : 'Offline'}</strong><div className="metric-foot"><span>Utility connection</span><span>{telemetry.grid_availability ? 'Stable' : 'Check supply'}</span></div></article>
      </section>

      <section className="workspace-grid">
        <article className="panel control-panel"><div className="panel-heading"><div><p className="eyebrow">Vehicle settings</p><h2>Charging controls</h2></div><span className="panel-state">{isConnected ? 'Remote' : 'Local preview'}</span></div><p className="panel-description">Set the charging state and preferred source for each vehicle.</p>
          <div className="control-row"><div className="control-name"><span className="vehicle-icon">EV1</span><div><strong>Vehicle 01</strong><span>State of charge {telemetry.ev1_soc}%</span></div></div><label className="switch"><input type="checkbox" checked={controls.ev1} onChange={(event) => updateControl('ev1', event.target.checked)} /><span /></label><label className="select-wrap"><span>Source</span><select value={controls.ev1_source} onChange={(event) => updateControl('ev1_source', Number(event.target.value))}>{Object.entries(sourceNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <div className="control-row"><div className="control-name"><span className="vehicle-icon">EV2</span><div><strong>Vehicle 02</strong><span>State of charge {telemetry.ev2_soc}%</span></div></div><label className="switch"><input type="checkbox" checked={controls.ev2} onChange={(event) => updateControl('ev2', event.target.checked)} /><span /></label><label className="select-wrap"><span>Source</span><select value={controls.ev2_source} onChange={(event) => updateControl('ev2_source', Number(event.target.value))}>{Object.entries(sourceNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <div className="control-actions"><span className="save-message">{saveMessage}</span><button className="apply-button" type="button" onClick={() => void saveControls()} disabled={isSaving}>{isSaving ? 'Applying...' : 'Apply controls'} <span>→</span></button></div>
        </article>
        <article className="panel snapshot-panel"><div className="panel-heading"><div><p className="eyebrow">At a glance</p><h2>Power flow</h2></div><span className="timestamp">{formatDate(telemetry.timestamp)}</span></div><div className="flow-visual"><div className="flow-node"><span className="flow-symbol solar-symbol">☼</span><strong>{Number(telemetry.solar_power).toLocaleString()} W</strong><span>Solar array</span></div><div className="flow-path"><span /><span /><span /></div><div className="flow-node"><span className="flow-symbol battery-symbol">▰</span><strong>{telemetry.bess_soc}%</strong><span>BESS storage</span></div></div><div className="snapshot-footer"><span><i className="legend-dot solar-dot" />Generation</span><span><i className="legend-dot battery-dot" />Storage</span><span><i className="legend-dot ev-dot" />EV load</span></div></article>
      </section>

      <section className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow">Telemetry log</p><h2>Recent readings</h2></div><span className="record-count">{history.length || 0} records</span></div><div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Solar power</th><th>BESS SOC</th><th>EV1 SOC</th><th>EV2 SOC</th><th>Grid</th><th>EV charging</th></tr></thead><tbody>{history.length ? history.slice().reverse().map((record, index) => <tr key={`${record.timestamp}-${index}`}><td>{formatDate(record.timestamp)}</td><td className="strong-cell">{Number(record.solar_power).toLocaleString()} W</td><td>{record.bess_soc}%</td><td>{record.ev1_soc}%</td><td>{record.ev2_soc}%</td><td><span className={`table-status ${record.grid_availability ? 'ok' : ''}`}>{record.grid_availability ? 'Available' : 'Offline'}</span></td><td><span className={`charge-status ${record.ev1 || record.ev2 ? 'charging' : ''}`}>{record.ev1 || record.ev2 ? 'Active' : 'Idle'}</span></td></tr>) : <tr><td colSpan={7} className="empty-state">Connect the Spring Boot API to see telemetry history.</td></tr>}</tbody></table></div></section>
      <footer><span>REDOX EMS</span><span>API endpoint <strong>{API_BASE}</strong></span></footer>
    </main>
  )
}

export default App
