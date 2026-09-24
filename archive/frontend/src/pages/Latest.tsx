import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import { useLatest } from '../hooks/useLatest';
import LiveCard from '../components/LiveCard';
import Typography from '@mui/material/Typography';

export default function Latest() {
    const { data, error, loading } = useLatest();

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
    if (!data) return null;

    const { telemetry, commands } = data;
    const solarKw = (telemetry.solar.voltage * telemetry.solar.current / 1000).toFixed(2);
    const bessKw = (telemetry.bess.voltage * telemetry.bess.current / 1000).toFixed(2);
    const gridKw = (telemetry.grid.voltage * telemetry.grid.current / 1000).toFixed(2);

    return (
        <>
            <Box sx={{ p: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                    {new Date(data.telemetry.time).toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    Last updated: {new Date().toLocaleTimeString()}
                </Typography>
            </Box>
            <Grid container spacing={3} sx={{ p: 3 }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <LiveCard label="Solar" value={`${solarKw} kW`} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <LiveCard label="BESS" value={`${telemetry.bess.soc}%`} sub={`${bessKw} kW`} progress={telemetry.bess.soc} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <LiveCard label="Grid" value={`${gridKw} kW`} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <LiveCard
                        label="EV1 / EV2"
                        value={`${telemetry.ev1_power.soc}% / ${telemetry.ev2_power.soc}%`}
                        sub={`EV1: ${commands.ev1 ? 'ON' : 'OFF'} | EV2: ${commands.ev2 ? 'ON' : 'OFF'}`}
                        progress={(telemetry.ev1_power.soc + telemetry.ev2_power.soc) / 2}
                    />
                </Grid>
            </Grid>
        </>
    );
}