import { useMemo, useState } from 'react';
import {
  Box, Button, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import FitnessCenterOutlined from '@mui/icons-material/FitnessCenterOutlined';
import AddRounded from '@mui/icons-material/AddRounded';
import { useApp } from '../state';
import { CrewAvatar, EmptyState, PageHeader, Section, SeverityChip, SourceLinks, fmtDay } from '../components/common';
import { ChartTip, useChartTheme } from '../components/charts';
import { TYPE_LABEL, weeklyCompliance, type ExerciseSession, type ExerciseType } from '../lib/exercise';
import { MONO } from '../theme';

export default function Exercise({ profileId }: { profileId?: string }) {
  const { profiles, exercise, settings, addExercise, updateSettings, notify } = useApp();
  const theme = useTheme();
  const c = useChartTheme();
  const [profile, setProfile] = useState(profileId && profiles.some((p) => p.id === profileId) ? profileId : profiles[0]?.id ?? '');
  const [form, setForm] = useState({ type: 'resistance' as ExerciseType, minutes: '60', effort: 3, avgHr: '', notes: '' });
  const [rx, setRx] = useState(settings.prescription);
  const rxDirty = JSON.stringify(rx) !== JSON.stringify(settings.prescription);
  const sessions = useMemo(() => exercise.filter((s) => s.profile === profile), [exercise, profile]);
  if (!profiles.length) return <EmptyState icon={<FitnessCenterOutlined />} title="No crew yet" action={<Button href="#/">Go to mission control</Button>}>Add a crew member or load the demo crew first.</EmptyState>;

  const p = profiles.find((x) => x.id === profile)!;
  const comp = weeklyCompliance(exercise, profile, settings.prescription);
  const dailyTarget = (settings.prescription.resistanceMinPerWeek + settings.prescription.aerobicMinPerWeek) / settings.prescription.activeDaysPerWeek;
  const columns: GridColDef<ExerciseSession>[] = [
    { field: 'timestamp', headerName: 'When', width: 150, valueFormatter: (v: string) => new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    { field: 'type', headerName: 'Type', width: 170, valueFormatter: (v: ExerciseType) => TYPE_LABEL[v] },
    { field: 'minutes', headerName: 'Minutes', type: 'number', width: 90 },
    { field: 'effort', headerName: 'Effort (1-5)', type: 'number', width: 105 },
    { field: 'avgHr', headerName: 'Avg HR', type: 'number', width: 90 },
    { field: 'source', headerName: 'Source', width: 100 },
    { field: 'notes', headerName: 'Notes', flex: 1, minWidth: 140 },
  ];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(form.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 300) return notify('Enter minutes between 1 and 300.');
    await addExercise({
      id: crypto.randomUUID(), profile, timestamp: new Date().toISOString(), type: form.type, minutes: Math.round(minutes),
      effort: form.effort as ExerciseSession['effort'], avgHr: form.avgHr ? Number(form.avgHr) : undefined, notes: form.notes.trim() || undefined, source: 'manual',
    });
    setForm({ ...form, notes: '', avgHr: '' });
    notify(`${TYPE_LABEL[form.type]} session logged for ${p.name}.`);
  }

  const pctColor = (v: number) => (v >= 0.75 ? 'success' : v >= 0.5 ? 'warning' : 'error') as 'success' | 'warning' | 'error';

  return (
    <>
      <PageHeader
       
        title="Exercise countermeasures"
        subtitle="Without gravity loading, bone and muscle are lost and cardiovascular fitness declines. Crews follow a daily exercise prescription; AstroCare tracks compliance so gaps are seen early, not after landing."
      />

      <Section title="Crew compliance, last 7 days" subheader="Against the weekly prescription below" sx={{ mb: 3 }} contentSx={{ px: 0 }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 2.5 }}>Crew member</TableCell>
                <TableCell align="right">Resistive</TableCell>
                <TableCell align="right">Aerobic</TableCell>
                <TableCell align="right">Active days</TableCell>
                <TableCell sx={{ minWidth: 200 }}>Overall</TableCell>
                <TableCell sx={{ pr: 2.5 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((x) => {
                const k = weeklyCompliance(exercise, x.id, settings.prescription);
                return (
                  <TableRow key={x.id} hover selected={x.id === profile} onClick={() => setProfile(x.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell sx={{ pl: 2.5 }}><Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}><CrewAvatar p={x} size={28} /><span>{x.name}</span></Stack></TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{k.resistanceMin} / {settings.prescription.resistanceMinPerWeek}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{k.aerobicMin} / {settings.prescription.aerobicMinPerWeek}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{k.activeDays} / {settings.prescription.activeDaysPerWeek}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <LinearProgress variant="determinate" value={k.overallPct * 100} color={pctColor(k.overallPct)} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
                        <Typography variant="body2" sx={{ fontFamily: MONO, width: 40 }}>{Math.round(k.overallPct * 100)}%</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ pr: 2.5 }}><SeverityChip severity={k.severity} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Section>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1.4fr 1fr' } }}>
        <Section title={`${p.name} : daily minutes`} subheader={`Dashed line: average daily target (${Math.round(dailyTarget)} min on active days)`} action={<SeverityChip severity={comp.severity} label={`${Math.round(comp.overallPct * 100)}% of prescription`} />}>
          <Box sx={{ height: 280 }} role="img" aria-label="Stacked daily exercise minutes for the last seven days">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comp.daily} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="day" tickFormatter={(d) => new Date(d + 'T12:00:00Z').toLocaleDateString([], { weekday: 'short', day: 'numeric' })} {...c.axis} />
                <YAxis width={44} {...c.axis} />
                <ReferenceLine y={dailyTarget} stroke={c.muted} strokeDasharray="4 4" />
                <Tooltip cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }} content={(tp) => <ChartTip {...(tp as object)} render={(d) => <><Typography variant="caption" color="text.secondary">{fmtDay((d.day as string) + 'T12:00:00Z')}</Typography><Typography variant="body2">Resistive <b>{d.resistance as number}</b> min · Aerobic <b>{d.aerobic as number}</b> min</Typography></>} />} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: theme.palette.text.secondary, fontSize: 12 }}>{v}</span>} />
                <Bar dataKey="resistance" name="Resistive" stackId="a" fill={c.crew(0)} stroke={c.surface} strokeWidth={2} maxBarSize={36} isAnimationActive={false} />
                <Bar dataKey="aerobic" name="Aerobic" stackId="a" fill={c.faint} stroke={c.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {comp.resistanceMin} min resistive, {comp.aerobicMin} min aerobic across {comp.activeDays} active days. Low compliance alongside rising blood pressure or falling fitness is worth raising with the crew medical officer.
          </Typography>
        </Section>

        <Stack spacing={3}>
          <Section title="Log a session">
            <Box component="form" onSubmit={save} sx={{ display: 'grid', gap: 2 }}>
              <TextField select size="small" label="Crew member" value={profile} onChange={(e) => setProfile(e.target.value)}>
                {profiles.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ExerciseType, minutes: e.target.value === 'resistance' ? '60' : '35' })}>
                {(Object.keys(TYPE_LABEL) as ExerciseType[]).map((t) => <MenuItem key={t} value={t}>{TYPE_LABEL[t]}</MenuItem>)}
              </TextField>
              <Stack direction="row" spacing={2}>
                <TextField size="small" label="Minutes" type="number" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} sx={{ flex: 1 }} />
                <TextField size="small" label="Avg heart rate" type="number" value={form.avgHr} onChange={(e) => setForm({ ...form, avgHr: e.target.value })} sx={{ flex: 1 }} slotProps={{ input: { endAdornment: <Typography variant="caption" color="text.secondary">bpm</Typography> } }} />
              </Stack>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>Perceived effort</Typography>
                <ToggleButtonGroup size="small" exclusive value={form.effort} onChange={(_, v) => v && setForm({ ...form, effort: v })} fullWidth>
                  {[1, 2, 3, 4, 5].map((n) => <ToggleButton key={n} value={n}>{n}</ToggleButton>)}
                </ToggleButtonGroup>
              </Box>
              <TextField size="small" label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} />
              <Button type="submit" variant="contained" startIcon={<AddRounded />}>Log session</Button>
            </Box>
          </Section>
          <Section title="Weekly prescription" subheader="ISS-style defaults; adjust per mission medical plan">
            <Stack spacing={2}>
              <TextField size="small" type="number" label="Resistive minutes / week" value={rx.resistanceMinPerWeek} onChange={(e) => setRx({ ...rx, resistanceMinPerWeek: Number(e.target.value) })} />
              <TextField size="small" type="number" label="Aerobic minutes / week" value={rx.aerobicMinPerWeek} onChange={(e) => setRx({ ...rx, aerobicMinPerWeek: Number(e.target.value) })} />
              <TextField size="small" type="number" label="Active days / week" value={rx.activeDaysPerWeek} onChange={(e) => setRx({ ...rx, activeDaysPerWeek: Math.max(1, Math.min(7, Number(e.target.value))) })} />
              <Button variant="outlined" disabled={!rxDirty} onClick={async () => { await updateSettings({ prescription: rx }); notify('Prescription updated.'); }}>Save prescription</Button>
            </Stack>
            <SourceLinks ids={['hazards', 'risks']} sx={{ mt: 2 }} />
          </Section>
        </Stack>
      </Box>

      <Section title={`${p.name} : sessions`} sx={{ mt: 3 }} contentSx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ height: 380 }}>
          <DataGrid rows={sessions} columns={columns} density="compact" showToolbar disableRowSelectionOnClick initialState={{ sorting: { sortModel: [{ field: 'timestamp', sort: 'desc' }] }, pagination: { paginationModel: { pageSize: 25 } } }} pageSizeOptions={[25, 50]} sx={{ border: 0 }} />
        </Box>
      </Section>
    </>
  );
}
