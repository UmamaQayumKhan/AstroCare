import { useMemo, useState } from 'react';
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import { useApp } from '../state';
import { useTelemetry, type Alarm } from '../telemetry';
import { PageHeader, Section, SeverityChip, Stat, fmtTime } from '../components/common';
import { VITALS } from '../lib/monitoring';

const KIND: Record<Alarm['kind'], string> = { model: 'Model band', reference: 'Reference range', signal: 'Sensor', exercise: 'Activity' };

export default function Alarms() {
  const { profiles } = useApp();
  const { alarms, ack, ackAll, unacked } = useTelemetry();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const name = (id: string) => profiles.find((p) => p.id === id)?.name ?? 'Unknown';
  const rows = useMemo(() => [...alarms].reverse().filter((a) => (filter === 'open' ? !a.ackAt : true)), [alarms, filter]);
  const last24 = alarms.filter((a) => Date.now() - Date.parse(a.at) < 86_400_000);

  const columns: GridColDef<Alarm>[] = [
    { field: 'at', headerName: 'Raised', width: 150, valueFormatter: (v: string) => fmtTime(v) },
    { field: 'severity', headerName: 'Level', width: 105, renderCell: (p) => <SeverityChip severity={p.row.severity} /> },
    { field: 'profile', headerName: 'Crew member', width: 150, valueGetter: (_v, r) => name(r.profile) },
    { field: 'title', headerName: 'Alarm', flex: 1, minWidth: 220 },
    { field: 'kind', headerName: 'Source', width: 130, valueFormatter: (v: Alarm['kind']) => KIND[v] },
    { field: 'metric', headerName: 'Signal', width: 120, valueFormatter: (v?: keyof typeof VITALS) => (v ? VITALS[v].label : '') },
    { field: 'detail', headerName: 'Detail', flex: 1.2, minWidth: 260 },
    {
      field: 'ackAt', headerName: 'Status', width: 150, sortable: false,
      renderCell: (p) => (p.row.ackAt ? <Typography variant="body2" color="text.secondary" sx={{ lineHeight: '36px' }}>Acknowledged</Typography> : <Button size="small" variant="outlined" onClick={() => ack(p.row.id)}>Acknowledge</Button>),
    },
  ];

  return (
    <>
      <PageHeader
        title="Alarms"
        subtitle="Raised automatically by the telemetry engine when a wearable reading leaves the model's expected range, crosses a reference limit, or the sensor drops out. Each condition alarms once until it is acknowledged."
        actions={<Button variant="contained" startIcon={<DoneAllRounded />} disabled={!unacked} onClick={ackAll}>Acknowledge all</Button>}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <Stat label="Unacknowledged" value={unacked} color={unacked ? 'warning.main' : undefined} />
        <Stat label="Alerts, last 24 h" value={last24.filter((a) => a.severity === 'alert').length} color={last24.some((a) => a.severity === 'alert') ? 'error.main' : undefined} />
        <Stat label="Watch, last 24 h" value={last24.filter((a) => a.severity === 'watch').length} />
        <Stat label="Sessions auto-logged" value={alarms.filter((a) => a.kind === 'exercise').length} caption="Exercise detected from heart rate" />
      </Box>
      <Section
        title="Alarm log"
        action={<ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, v) => v && setFilter(v)}><ToggleButton value="open">Open</ToggleButton><ToggleButton value="all">All</ToggleButton></ToggleButtonGroup>}
        contentSx={{ p: 0, '&:last-child': { pb: 0 } }}
      >
        <Box sx={{ height: 560 }}>
          <DataGrid rows={rows} columns={columns} density="compact" showToolbar disableRowSelectionOnClick sx={{ border: 0 }} localeText={{ noRowsLabel: filter === 'open' ? 'No open alarms.' : 'No alarms yet.' }} />
        </Box>
      </Section>
      <Stack sx={{ mt: 2 }}><Typography variant="caption" color="text.secondary">Telemetry is simulated for this prototype and runs accelerated (one sample per 5 simulated minutes, every 2 seconds).</Typography></Stack>
    </>
  );
}
