import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import MedicalServicesOutlined from '@mui/icons-material/MedicalServicesOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import AddRounded from '@mui/icons-material/AddRounded';
import RemoveCircleOutline from '@mui/icons-material/RemoveCircleOutlineOutlined';
import { useApp } from '../state';
import { EmptyState, PageHeader, Section, SeverityChip, SourceLinks, Stat, useSevColor } from '../components/common';
import { ChartTip, useChartTheme } from '../components/charts';
import { deficit, project, type SupplyCategory, type SupplyItem } from '../lib/inventory';
import { missionDay } from '../lib/mission';
import { MONO } from '../theme';

const CATEGORIES: SupplyCategory[] = ['Medication', 'Diagnostics', 'Wound care', 'Fluids', 'Protective'];

export default function Supplies() {
  const { inventory, dispenses, settings, profiles, dispense, saveInventory, loadDemo, notify } = useApp();
  const sev = useSevColor();
  const c = useChartTheme();
  const start = Date.parse(settings.missionStart);
  const today = missionDay(settings.missionStart);
  const end = settings.missionDays;
  const rows = useMemo(() => inventory.map((i) => ({ ...i, proj: project(i, dispenses, start, end) })), [inventory, dispenses, start, end]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dispenseFor, setDispenseFor] = useState<SupplyItem | null>(null);
  const [amount, setAmount] = useState('1');
  const [who, setWho] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', category: 'Medication' as SupplyCategory, unit: 'units', quantity: '10', plannedPerWeek: '1', expires: '', critical: false, location: '' });

  if (!inventory.length)
    return (
      <>
        <PageHeader title="Medical supplies" subtitle="Track the medical kit and see what will run out before the mission ends." />
        <EmptyState icon={<MedicalServicesOutlined />} title="No inventory yet" action={<Button variant="contained" onClick={() => void loadDemo()}>Load demo crew & kit</Button>}>Load the demo to see a 14-item medical kit with 30 days of usage.</EmptyState>
      </>
    );

  const sel = rows.find((r) => r.id === selected) ?? [...rows].sort((a, b) => ['nominal', 'watch', 'alert'].indexOf(b.proj.status) - ['nominal', 'watch', 'alert'].indexOf(a.proj.status))[0];
  const alerts = rows.filter((r) => r.proj.status === 'alert').length;
  const watches = rows.filter((r) => r.proj.status === 'watch').length;
  const expiring = rows.filter((r) => r.proj.expiresBeforeEnd).length;

  // projected stock curve for the selected item
  const curve: { day: number; qty: number }[] = [];
  for (let d = today; d <= end + 10; d += Math.max(1, Math.round((end - today) / 60))) curve.push({ day: d, qty: Math.max(0, sel.quantity - sel.proj.usePerDay * (d - today)) });

  const columns: GridColDef<(typeof rows)[number]>[] = [
    { field: 'name', headerName: 'Item', flex: 1, minWidth: 220, renderCell: (p) => <Stack direction="row" spacing={1} sx={{ alignItems: 'center', height: '100%' }}><span>{p.row.name}</span>{p.row.critical && <Chip size="small" label="Critical" variant="outlined" color="primary" />}</Stack> },
    { field: 'category', headerName: 'Category', width: 110 },
    { field: 'quantity', headerName: 'On hand', type: 'number', width: 105, valueFormatter: (v: number, r) => `${v} ${r.unit}` },
    { field: 'use', headerName: 'Use / day', type: 'number', width: 115, valueGetter: (_v, r) => r.proj.usePerDay, renderCell: (p) => <span title={p.row.proj.usageBasis === 'observed' ? 'Observed over the last 14 days' : 'Planned rate (too little history)'}><span style={{ fontFamily: MONO }}>{p.row.proj.usePerDay.toFixed(2)}</span>{p.row.proj.usageBasis === 'planned' && <Typography component="span" variant="caption" color="text.secondary"> plan</Typography>}</span> },
    { field: 'runOut', headerName: 'Runs out', description: 'Projected mission day the item runs out', type: 'number', width: 100, valueGetter: (_v, r) => r.proj.runOutDay ?? Infinity, valueFormatter: (v: number) => (Number.isFinite(v) ? String(v) : '-') },
    { field: 'expiry', headerName: 'Expires', description: 'Mission day of expiry', type: 'number', width: 95, valueGetter: (_v, r) => r.proj.expiryDay },
    { field: 'status', headerName: 'Status', width: 110, valueGetter: (_v, r) => r.proj.status, renderCell: (p) => <SeverityChip severity={p.row.proj.status} /> },
    { field: 'actions', headerName: '', width: 110, sortable: false, filterable: false, renderCell: (p) => <Button size="small" startIcon={<RemoveCircleOutline />} onClick={(e) => { e.stopPropagation(); setDispenseFor(p.row); setAmount('1'); }}>Dispense</Button> },
  ];

  async function addItem() {
    const q = Number(draft.quantity);
    if (!draft.name.trim() || !Number.isFinite(q) || q < 0 || !draft.expires) return notify('Name, quantity and expiry date are required.');
    const item: SupplyItem = { id: crypto.randomUUID(), name: draft.name.trim(), category: draft.category, unit: draft.unit.trim() || 'units', quantity: q, initialQuantity: q, plannedPerWeek: Number(draft.plannedPerWeek) || 0, expires: draft.expires, critical: draft.critical, location: draft.location.trim() };
    await saveInventory([...inventory, item]);
    setAdding(false);
    notify(`${item.name} added to the inventory.`);
  }

  return (
    <>
      <PageHeader
       
        title="Medical supplies"
        subtitle="On the way to Mars there is no resupply. AstroCare projects each item's run-out date from actual usage and flags anything that will be exhausted or expire before mission end."
        actions={<Button variant="outlined" startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add item</Button>}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <Stat label="Items tracked" value={inventory.length} icon={<Inventory2Outlined />} caption={`Mission day ${today} of ${end}`} />
        <Stat label="Critical shortfalls" value={alerts} color={alerts ? sev('alert') : undefined} icon={<ErrorOutline />} caption="Critical items running out" />
        <Stat label="Watch" value={watches} color={watches ? sev('watch') : undefined} icon={<WarningAmberOutlined />} caption="Non-critical shortfall or expiry" />
        <Stat label="Expire before end" value={expiring} icon={<EventOutlined />} caption="Need replacement plan" />
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 380px' } }}>
        <Section title="Inventory" subheader="Click a row to see its projection. Usage is 'observed' once there are dispense records in the last 14 days, otherwise the planned rate." contentSx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Box sx={{ height: 560 }}>
            <DataGrid
              rows={rows}
              columns={columns}
              density="compact"
              showToolbar
              onRowClick={(p) => setSelected(String(p.id))}
              initialState={{ sorting: { sortModel: [{ field: 'runOut', sort: 'asc' }] } }}
              getRowClassName={(p) => (p.id === sel.id ? 'Mui-selected' : '')}
              sx={{ border: 0 }}
            />
          </Box>
        </Section>
        <Stack spacing={3}>
          <Section title={sel.name} subheader={`${sel.quantity} ${sel.unit} on hand · ${sel.location}`} action={<SeverityChip severity={sel.proj.status} />}>
            <Box sx={{ height: 220 }} role="img" aria-label={`Projected stock of ${sel.name} until mission end`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="day" type="number" domain={[today, end + 10]} tickFormatter={(d) => `D${d}`} {...c.axis} />
                  <YAxis width={44} {...c.axis} />
                  <ReferenceLine x={end} stroke={sev('alert')} strokeDasharray="4 4" label={{ value: 'Mission end', position: 'insideTopRight', fill: c.muted, fontSize: 11 }} />
                  {sel.proj.expiresBeforeEnd && <ReferenceLine x={sel.proj.expiryDay} stroke={sev('watch')} strokeDasharray="2 4" label={{ value: 'Expiry', position: 'insideTopLeft', fill: c.muted, fontSize: 11 }} />}
                  <Tooltip content={(tp) => <ChartTip {...(tp as object)} render={(d) => <><Typography variant="caption" color="text.secondary">Mission day {d.day as number}</Typography><Typography sx={{ fontFamily: MONO, fontSize: 13 }}>{(d.qty as number).toFixed(0)} {sel.unit}</Typography></>} />} />
                  <Line dataKey="qty" stroke={c.crew(0)} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
            <Alert severity={sel.proj.status === 'alert' ? 'error' : sel.proj.status === 'watch' ? 'warning' : 'success'} sx={{ mt: 2 }}>
              {sel.proj.reason}
              {sel.proj.shortfall && <> Need about <b>{deficit(sel, sel.proj, end, today)} {sel.unit}</b> more to reach mission end, or a lower usage rate.</>}
            </Alert>
          </Section>
          <Section title="How projections work">
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
              Usage rate = units dispensed in the last 14 days ÷ 14 (or the planned weekly rate when there is too little history). Run-out day = today + stock ÷ rate. Usage spikes, like the analgesic use during the fever case, show up here within days, giving the flight surgeon time to adjust plans.
            </Typography>
            <Alert severity="info" sx={{ mt: 2 }}>Inventory management only. AstroCare never recommends a medication or dose.</Alert>
            <SourceLinks ids={['hazards', 'earth']} sx={{ mt: 2 }} />
          </Section>
        </Stack>
      </Box>

      <Dialog open={Boolean(dispenseFor)} onClose={() => setDispenseFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Dispense: {dispenseFor?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={`Amount (${dispenseFor?.unit})`} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} helperText={`${dispenseFor?.quantity} on hand`} />
            <TextField select label="For crew member (optional)" value={who} onChange={(e) => setWho(e.target.value)}>
              <MenuItem value="">None</MenuItem>
              {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDispenseFor(null)}>Cancel</Button>
          <Button variant="contained" onClick={async () => { if (dispenseFor) await dispense(dispenseFor.id, Math.max(0, Math.round(Number(amount))), who || undefined); setDispenseFor(null); }}>Log dispense</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add inventory item</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr' }, mt: 1 }}>
            <TextField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} sx={{ gridColumn: { sm: 'span 2' } }} />
            <TextField select label="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as SupplyCategory })}>{CATEGORIES.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
            <TextField label="Unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
            <TextField label="Quantity" type="number" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
            <TextField label="Planned use / week" type="number" value={draft.plannedPerWeek} onChange={(e) => setDraft({ ...draft, plannedPerWeek: e.target.value })} />
            <TextField label="Expiry date" type="date" value={draft.expires} onChange={(e) => setDraft({ ...draft, expires: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            <FormControlLabel control={<Checkbox checked={draft.critical} onChange={(e) => setDraft({ ...draft, critical: e.target.checked })} />} label="Mission-critical item" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void addItem()}>Add item</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
