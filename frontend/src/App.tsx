import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Progress, Switch } from './components/ui'
import './App.css'

type Telemetry = { timestamp: string; solar_power: number; ev1_soc: number; ev2_soc: number; bess_soc: number; grid_availability: boolean; ev1: boolean; ev1_source: number; ev2: boolean; ev2_source: number }
type ControlState = Pick<Telemetry, 'ev1' | 'ev1_source' | 'ev2' | 'ev2_source'>
const API_BASE = 'http://localhost:8080'
const sourceNames: Record<number, string> = { 1: 'Battery', 2: 'Solar', 3: 'Grid' }
const fallbackTelemetry: Telemetry = { timestamp: new Date().toISOString(), solar_power: 0, ev1_soc: 0, ev2_soc: 0, bess_soc: 0, grid_availability: false, ev1: false, ev1_source: 1, ev2: false, ev2_source: 1 }

function formatTime(timestamp: string) { const date = new Date(timestamp); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
function formatDate(timestamp: string) { const date = new Date(timestamp); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

function MetricCard({ label, value, unit, icon, detail, accent, progress }: { label: string; value: string | number; unit?: string; icon: string; detail: string; accent?: string; progress?: number }) {
  return <Card className={`metric-card ${accent ?? ''}`}><CardContent><div className="metric-label"><span className="metric-icon">{icon}</span>{label}</div><div className="metric-value">{value}{unit && <small>{unit}</small>}</div>{progress !== undefined && <Progress value={progress} />}<div className="metric-detail">{detail}</div></CardContent></Card>
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
      const responses = await Promise.all([fetch(`${API_BASE}/latest`), fetch(`${API_BASE}/recent`), fetch(`${API_BASE}/control`)])
      if (responses.some((response) => !response.ok)) throw new Error('API unavailable')
      const [latest, recent, control] = await Promise.all([responses[0].json() as Promise<Telemetry>, responses[1].json() as Promise<Telemetry[]>, responses[2].json() as Promise<ControlState>])
      setTelemetry(latest); setHistory(recent); setControls(control); setIsConnected(true)
    } catch { setIsConnected(false) }
  }, [])
  useEffect(() => { void loadData(); const interval = window.setInterval(() => void loadData(), 2500); return () => window.clearInterval(interval) }, [loadData])
  async function saveControls() {
    setIsSaving(true); setSaveMessage('')
    try {
      const response = await fetch(`${API_BASE}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(controls) })
      if (!response.ok) throw new Error('Could not save controls')
      setSaveMessage('Controls applied')
    } catch { setSaveMessage('Unable to reach controller') } finally { setIsSaving(false); window.setTimeout(() => setSaveMessage(''), 3000) }
  }
  function updateControl(field: keyof ControlState, value: boolean | number) { setControls((current) => ({ ...current, [field]: value })) }
  const averageSoc = Math.round((telemetry.ev1_soc + telemetry.ev2_soc) / 2)
  const vehicleRows = [{ id: 'EV1', name: 'Vehicle 01', enabled: controls.ev1, source: controls.ev1_source, soc: telemetry.ev1_soc }, { id: 'EV2', name: 'Vehicle 02', enabled: controls.ev2, source: controls.ev2_source, soc: telemetry.ev2_soc }]

  return <main className="dashboard-shell">
    <header className="topbar"><div className="brand-lockup"><img src="/Redox.svg" alt="Redox" /><div><strong>Redox EMS</strong><span>Energy management system</span></div></div><div className="connection-status"><span className={`status-dot ${isConnected ? 'online' : ''}`} />{isConnected ? 'Live connection' : 'Waiting for backend'}<span className="divider" />Updated {formatTime(telemetry.timestamp)}</div></header>
    <section className="page-intro"><div><div className="eyebrow">Overview / Live telemetry</div><h1>Energy at a glance.</h1><p className="intro-copy">Monitor site generation, storage and EV charging in real time.</p></div><div className="refresh-note"><span className="pulse-line" />Auto-refreshing <strong>2.5s</strong></div></section>
    <section className="telemetry-grid" aria-label="Live telemetry">
      <MetricCard label="Solar power" value={Number(telemetry.solar_power).toLocaleString()} unit="W" icon="☼" detail="Current output · tracking" accent="solar-card" />
      <MetricCard label="BESS state of charge" value={telemetry.bess_soc} unit="%" icon="▰" detail="Battery storage level" progress={telemetry.bess_soc} />
      <MetricCard label="EV fleet average" value={averageSoc} unit="%" icon="⚡" detail={`EV1 ${telemetry.ev1_soc}% · EV2 ${telemetry.ev2_soc}%`} />
      <MetricCard label="Grid availability" value={telemetry.grid_availability ? 'Available' : 'Offline'} icon="⌁" detail={telemetry.grid_availability ? 'Utility connection stable' : 'Check utility supply'} accent={telemetry.grid_availability ? 'grid-online' : 'grid-offline'} />
    </section>
    <section className="workspace-grid">
      <Card className="control-panel"><CardHeader><div><div className="eyebrow">Vehicle settings</div><CardTitle>Charging controls</CardTitle><CardDescription>Set the charging state and preferred source for each vehicle.</CardDescription></div><Badge>{isConnected ? 'Remote' : 'Local preview'}</Badge></CardHeader><CardContent className="controls">
        {vehicleRows.map((vehicle) => <div className="control-row" key={vehicle.id}><div className="control-name"><span className="vehicle-icon">{vehicle.id}</span><div><strong>{vehicle.name}</strong><span>State of charge {vehicle.soc}%</span></div></div><Switch checked={vehicle.enabled} label={`Enable charging for ${vehicle.name}`} onChange={(checked) => updateControl(vehicle.id === 'EV1' ? 'ev1' : 'ev2', checked)} /><label className="select-wrap"><span>Energy source</span><select value={vehicle.source} onChange={(event) => updateControl(vehicle.id === 'EV1' ? 'ev1_source' : 'ev2_source', Number(event.target.value))}>{Object.entries(sourceNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>)}
      </CardContent><CardFooter><span className="save-message">{saveMessage}</span><Button type="button" onClick={() => void saveControls()} disabled={isSaving}>{isSaving ? 'Applying...' : 'Apply controls'} <span>→</span></Button></CardFooter></Card>
      <Card className="snapshot-panel"><CardHeader><div><div className="eyebrow">At a glance</div><CardTitle>Power flow</CardTitle></div><span className="timestamp">{formatDate(telemetry.timestamp)}</span></CardHeader><CardContent className="flow-visual"><div className="flow-node"><span className="flow-symbol solar-symbol">☼</span><strong>{Number(telemetry.solar_power).toLocaleString()} W</strong><span>Solar array</span></div><div className="flow-path"><span /><span /><span /></div><div className="flow-node"><span className="flow-symbol battery-symbol">▰</span><strong>{telemetry.bess_soc}%</strong><span>BESS storage</span></div></CardContent><CardFooter className="snapshot-footer"><span><i className="legend-dot solar-dot" />Generation</span><span><i className="legend-dot battery-dot" />Storage</span><span><i className="legend-dot ev-dot" />EV load</span></CardFooter></Card>
    </section>
    <Card className="history-panel"><CardHeader><div><div className="eyebrow">Telemetry log</div><CardTitle>Recent readings</CardTitle></div><Badge>{history.length || 0} records</Badge></CardHeader><CardContent className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Solar power</th><th>BESS SOC</th><th>EV1 SOC</th><th>EV2 SOC</th><th>Grid</th><th>EV charging</th></tr></thead><tbody>{history.length ? history.slice().reverse().map((record, index) => <tr key={`${record.timestamp}-${index}`}><td>{formatDate(record.timestamp)}</td><td className="strong-cell">{Number(record.solar_power).toLocaleString()} W</td><td>{record.bess_soc}%</td><td>{record.ev1_soc}%</td><td>{record.ev2_soc}%</td><td><span className={`table-status ${record.grid_availability ? 'ok' : ''}`}>{record.grid_availability ? 'Available' : 'Offline'}</span></td><td><span className={`charge-status ${record.ev1 || record.ev2 ? 'charging' : ''}`}>{record.ev1 || record.ev2 ? 'Active' : 'Idle'}</span></td></tr>) : <tr><td colSpan={7} className="empty-state">Connect the Spring Boot API to see telemetry history.</td></tr>}</tbody></table></CardContent></Card>
    <footer><span>REDOX EMS</span><span>API endpoint <strong>{API_BASE}</strong></span></footer>
  </main>
}

export default App
