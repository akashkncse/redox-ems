import { useState } from 'react';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LineChart } from '@mui/x-charts/LineChart';
import dayjs from 'dayjs';
import { useHistory } from '../hooks/useHistory';

export default function History() {
  const [start, setStart] = useState(dayjs('2026-08-12T06:00:00'));
  const [end, setEnd] = useState(dayjs('2026-08-12T16:00:00'));

  const { data, loading, error } = useHistory(start.toDate(), end.toDate());

  const timestamps = data.map((d) => new Date(d.time));
  const solarKw = data.map((d) => (d.solar.voltage * d.solar.current) / 1000);
  const bessSoc = data.map((d) => d.bess.soc);
  const gridKw = data.map((d) => (d.grid.voltage * d.grid.current) / 1000);
  const ev1Soc = data.map((d) => d.ev1_power.soc);
  const ev2Soc = data.map((d) => d.ev2_power.soc);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>Charging History</Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DateTimePicker label="Start" value={start} onChange={(v) => v && setStart(v)} sx={{width: 300}}/>
          <DateTimePicker label="End" value={end} onChange={(v) => v && setEnd(v)} sx={{width: 300}}/>
        </LocalizationProvider>
      </Box>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && data.length > 0 && (
        <LineChart
          xAxis={[{ data: timestamps, scaleType: 'time' }]}
          series={[
            { data: solarKw, label: 'Solar (kW)', color: '#ffb300' },
            { data: bessSoc, label: 'BESS SOC (%)', color: '#00e676' },
            { data: gridKw, label: 'Grid (kW)', color: '#29b6f6' },
            { data: ev1Soc, label: 'EV1 SOC (%)', color: '#ab47bc' },
            { data: ev2Soc, label: 'EV2 SOC (%)', color: '#ef5350' },
          ]}
          height={400}
          sx={{ backgroundColor: 'background.paper', borderRadius: 2, p: 2 }}
        />
      )}

      {!loading && !error && data.length === 0 && (
        <Alert severity="info">No data in selected range</Alert>
      )}
    </Box>
  );
}