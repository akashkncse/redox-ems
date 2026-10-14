import Card from "./components/Card";
import bessimg from './assets/bess.jpg';
import ev1img from './assets/ev1.jpg';
import ev2img from './assets/ev2.png';
import solarimg from './assets/solar.png';
import "./overview.css";
import { useState, useEffect } from "react";
import { fetchLatestRecord, fetchServerStatus, type Record } from '../../lib/api';

export default function Overview() {
  // State for the latest record and error handling
  const defaultRecord: Record = {
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
  const [record, setRecord] = useState<Record>(defaultRecord);
  const [error, setError] = useState<string | null>(null);
  const [serverActive, setServerActive] = useState(true);

  // Poll the backend every 2 seconds
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
        // Check server health via root endpoint
        const active = await fetchServerStatus();
        if (!cancelled) setServerActive(active);
        if (!active) {
          setError('Server inactive');
          return;
        }
        // Server is up – fetch latest data
        try {
          const data = await fetchLatestRecord();
          if (!cancelled) {
            setRecord(data);
            setError(null);
          }
        } catch (err) {
          if (!cancelled) {
            setError((err as Error).message);
          }
        }
    };
    // Initial fetch
    fetchData();
    const intervalId = setInterval(fetchData, 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // No loading placeholder; use default values until data arrives
  const { timestamp, solar_power, ev1_soc, ev2_soc, bess_soc } = record;

  return (
    <div className="ov">
      {/* Optional error banner */}
      {/* {error && <div className="error">Error: {error}</div>} */}
      <div className="topbar">
        <div className="h1">Overview</div>
        <div className="time">Last Updated: {timestamp}</div>
        {!serverActive && <div className="status">Server status: inactive</div>}
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
          title={`${(bess_soc ).toFixed(0)}%`}
          description="Battery SOC"
        />
        <Card
          imgSrc={ev1img}
          imgAlt="ev1"
          title={`${(ev1_soc ).toFixed(0)}%`}
          description="EV1 SOC"
        />
        <Card
          imgSrc={ev2img}
          imgAlt="ev2"
          title={`${(ev2_soc ).toFixed(0)}%`}
          description="EV2 SOC"
        />
      </div>
    </div>
  );
}