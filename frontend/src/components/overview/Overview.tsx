import Card from "./components/Card";
import bessimg from './assets/bess.jpg';
import ev1img from './assets/ev1.jpg';
import ev2img from './assets/ev2.png';
import solarimg from './assets/solar.png';
import "./overview.css";
import { useState, useEffect } from "react";
import {
  fetchLatestRecord,
  fetchRecentRecords,
  fetchServerStatus,
  postControl,
  SOURCE_OPTIONS,
  type SourceType,
  type ControlPayload,
} from '../../lib/api';
import { type Record as ApiRecord } from '../../lib/Record';

export default function Overview() {
  const defaultRecord: ApiRecord = {
    id: 0,
    timestamp: 'Never',
    solar_power: 0,
    ev1_soc: 0,
    ev2_soc: 0,
    bess_soc: 0,
    grid_availability: false,
    ev1: false,
    ev1_source: 0,
    ev2: false,
    ev2_source: 0,
  };

  const [record, setRecord] = useState<ApiRecord>(defaultRecord);
  const [recentRecords, setRecentRecords] = useState<ApiRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serverActive, setServerActive] = useState(true);

  // Control state
  const [control, setControl] = useState<ControlPayload>({
    ev1: false,
    ev1_source: 0,
    ev2: false,
    ev2_source: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [controlStatus, setControlStatus] = useState<string | null>(null);

  // Poll backend every 2 seconds
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      const active = await fetchServerStatus();
      
      if (!cancelled) setServerActive(active);
      if (!active) {
        setError('Server inactive');
        return;
      }

      const [latestRes, recentRes] = await Promise.allSettled([
        fetchLatestRecord(),
        fetchRecentRecords(),
      ]);

      if (!cancelled) {
        let hasError = false;
        let errMsg = '';

        if (latestRes.status === 'fulfilled') {
          setRecord(latestRes.value);
        } else {
          hasError = true;
          errMsg = (latestRes.reason as Error)?.message || 'Failed to fetch latest record';
        }

        if (recentRes.status === 'fulfilled') {
          setRecentRecords(recentRes.value);
        } else {
          hasError = true;
          errMsg = (recentRes.reason as Error)?.message || 'Failed to fetch recent records';
        }

        if (hasError && latestRes.status === 'rejected' && recentRes.status === 'rejected') {
          setError(errMsg);
        } else {
          setError(null);
        }
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const handleEvToggle = (key: 'ev1' | 'ev2') => {
    setControl((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSourceChange = (key: 'ev1_source' | 'ev2_source', val: number) => {
    setControl((prev) => ({ ...prev, [key]: val as SourceType }));
  };

  const handleSubmitControl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setControlStatus(null);
    try {
      await postControl(control);
      setControlStatus('Control settings updated successfully.');
    } catch (err) {
      setControlStatus((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatSource = (source: number) => {
    switch (source) {
      case 0:
        return 'Solar';
      case 1:
        return 'Battery';
      case 2:
        return 'Grid';
      default:
        return `Source ${source}`;
    }
  };

  const { timestamp, solar_power, ev1_soc, ev2_soc, bess_soc } = record;
  const lastThreeRecords = recentRecords.slice(0, 3);

  return (
    <div className="ov">
      <div className="topbar">
        <div className="h1">Overview</div>
        <div className="time">Last Updated: {timestamp}</div>
        {!serverActive && <div className="status">Server status: inactive</div>}
        {error && <div className="status" style={{ color: '#ef4444' }}>{error}</div>}
      </div>

      <div className="overview">
        <Card
          imgSrc={solarimg}
          imgAlt="solar"
          title={`${solar_power} kW`}
          description="Solar production"
        />
        <Card
          imgSrc={bessimg}
          imgAlt="bess"
          title={`${bess_soc.toFixed(0)}%`}
          description="Battery SOC"
        />
        <Card
          imgSrc={ev1img}
          imgAlt="ev1"
          title={`${ev1_soc.toFixed(0)}%`}
          description="EV1 SOC"
        />
        <Card
          imgSrc={ev2img}
          imgAlt="ev2"
          title={`${ev2_soc.toFixed(0)}%`}
          description="EV2 SOC"
        />
      </div>

      <div className="control-card">
        <div className="control-header">EV Control Panel</div>
        <form onSubmit={handleSubmitControl} className="control-form">
          <div className="control-grid">
            <div className="control-item">
              <div className="control-item-title">EV 1</div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={control.ev1}
                  onChange={() => handleEvToggle('ev1')}
                />
                Enable Charging
              </label>
              <div className="select-group">
                <label htmlFor="ev1-source">Power Source:</label>
                <select
                  id="ev1-source"
                  value={control.ev1_source}
                  onChange={(e) => handleSourceChange('ev1_source', Number(e.target.value))}
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="control-item">
              <div className="control-item-title">EV 2</div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={control.ev2}
                  onChange={() => handleEvToggle('ev2')}
                />
                Enable Charging
              </label>
              <div className="select-group">
                <label htmlFor="ev2-source">Power Source:</label>
                <select
                  id="ev2-source"
                  value={control.ev2_source}
                  onChange={(e) => handleSourceChange('ev2_source', Number(e.target.value))}
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="control-actions">
            <button type="submit" disabled={submitting} className="control-btn">
              {submitting ? 'Updating...' : 'Apply Controls'}
            </button>
            {controlStatus && <span className="control-status">{controlStatus}</span>}
          </div>
        </form>
      </div>

      <div className="records-card">
        <div className="records-header">
          <div className="records-title">Last 3 Records</div>
        </div>

        <div className="table-responsive">
          <table className="bw-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Timestamp</th>
                <th>Solar Power</th>
                <th>BESS SOC</th>
                <th>EV1 SOC</th>
                <th>EV1 State</th>
                <th>EV1 Source</th>
                <th>EV2 SOC</th>
                <th>EV2 State</th>
                <th>EV2 Source</th>
                <th>Grid</th>
              </tr>
            </thead>
            <tbody>
              {lastThreeRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="empty-cell">
                    No recent records available
                  </td>
                </tr>
              ) : (
                lastThreeRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="id-cell">#{r.id}</td>
                    <td className="timestamp-cell">{r.timestamp}</td>
                    <td>{r.solar_power} kW</td>
                    <td>{r.bess_soc.toFixed(0)}%</td>
                    <td>{r.ev1_soc.toFixed(0)}%</td>
                    <td>
                      <span className={`status-indicator ${r.ev1 ? 'is-active' : 'is-inactive'}`}>
                        <span className="status-dot"></span>
                        {r.ev1 ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td>{formatSource(r.ev1_source)}</td>
                    <td>{r.ev2_soc.toFixed(0)}%</td>
                    <td>
                      <span className={`status-indicator ${r.ev2 ? 'is-active' : 'is-inactive'}`}>
                        <span className="status-dot"></span>
                        {r.ev2 ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td>{formatSource(r.ev2_source)}</td>
                    <td>
                      <span className={`status-indicator ${r.grid_availability ? 'is-active' : 'is-inactive'}`}>
                        <span className="status-dot"></span>
                        {r.grid_availability ? 'Available' : 'Unavailable'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}