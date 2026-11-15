import { useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Divider, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import { useApp } from '../state';
import { CrewAvatar, EmptyState, SeverityChip, fmtTime } from '../components/common';
import { VitalChart } from '../components/charts';
import { CORE_KEYS, METRIC_KEYS, VITALS, num } from '../lib/monitoring';
import { weeklyCompliance } from '../lib/exercise';
import { assessPvt } from '../lib/pvt';
import { delayLabel, missionDay, missionProfile } from '../lib/mission';
import { MONO } from '../theme';

const stats = (v: number[]) => (v.length ? { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v) } : null);

export default function Report({ profileId }: { profileId?: string }) {
  const { profiles, records, assessments, pvt, exercise, dispenses, inventory, settings } = useApp();
  const [profile, setProfile] = useState(profileId && profiles.some((p) => p.id === profileId) ? profileId : profiles[0]?.id ?? '');
  const [days, setDays] = useState(7);
  const [notes, setNotes] = useState('');
  const since = Date.now() - days * 86_400_000;
  const p = profiles.find((x) => x.id === profile);
  const period = useMemo(() => records.filter((r) => r.profile === profile && Date.parse(r.timestamp) >= since), [records, profile, since]);
  if (!p) return <EmptyState icon={<DescriptionOutlined />} title="No crew yet" action={<Button href="#/">Go to mission control</Button>}>Add a crew member or load the demo crew first.</EmptyState>;

  const a = assessments[p.id];
  const m = missionProfile(settings.mission);
  const all = records.filter((r) => r.profile === p.id);
  const tests = pvt.filter((x) => x.profile === p.id && Date.parse(x.timestamp) >= since).sort((x, y) => x.timestamp.localeCompare(y.timestamp));
  const comp = weeklyCompliance(exercise, p.id, settings.prescription);
  const symptoms = period.filter((r) => r.symptoms?.trim());
  const meds = dispenses.filter((d) => d.profile === p.id && Date.parse(d.timestamp) >= since);

  return (
    <>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { md: 'center' } }} className="no-print">
        <Box>
          <Typography variant="overline" color="primary">Operations · reporting</Typography>
          <Typography variant="h4" component="h1">Flight surgeon report</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>A concise, printable summary for the private medical conference. Choose a crew member and period, add notes, then print or save as PDF.</Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <TextField select size="small" label="Crew member" value={profile} onChange={(e) => setProfile(e.target.value)} sx={{ minWidth: 200 }}>
            {profiles.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
          </TextField>
          <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
            {[7, 14, 30].map((d) => <ToggleButton key={d} value={d}>{d} days</ToggleButton>)}
          </ToggleButtonGroup>
          <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => window.print()}>Print / PDF</Button>
        </Stack>
      </Stack>

      <Card sx={{ maxWidth: 1000, mx: 'auto', '@media print': { border: 0 } }}>
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <CrewAvatar p={p} size={52} />
              <Box>
                <Typography variant="h5">{p.name}</Typography>
                <Typography color="text.secondary">{p.role}{p.demo ? ' · demo profile (simulated data)' : ''}</Typography>
              </Box>
            </Stack>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Crew medical report</Typography>
              <Typography variant="body2" color="text.secondary">{settings.callsign} · {m.id} · day {missionDay(settings.missionStart)}</Typography>
              <Typography variant="body2" color="text.secondary">Period: last {days} days · generated {fmtTime(new Date().toISOString())}</Typography>
            </Box>
          </Stack>
          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" gutterBottom>1. Status and findings</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
            <SeverityChip severity={a.status} variant="filled" />
            <Typography variant="body2" color="text.secondary">{a.findings.length} active finding{a.findings.length === 1 ? '' : 's'} · Earth link {delayLabel(m)}</Typography>
          </Stack>
          {a.findings.length ? (
            <Table size="small" sx={{ mb: 3 }}>
              <TableHead><TableRow><TableCell>Level</TableCell><TableCell>Finding</TableCell><TableCell>Detail</TableCell></TableRow></TableHead>
              <TableBody>
                {a.findings.map((f) => (
                  <TableRow key={f.id}><TableCell><SeverityChip severity={f.severity} /></TableCell><TableCell sx={{ fontWeight: 500 }}>{f.title}</TableCell><TableCell sx={{ color: 'text.secondary' }}>{f.detail}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>No active findings.</Typography>}

          <Typography variant="h6" gutterBottom>2. Vital signs</Typography>
          <Table size="small" sx={{ mb: 2 }}>
            <TableHead><TableRow><TableCell>Measure</TableCell><TableCell align="right">n</TableCell><TableCell align="right">Mean</TableCell><TableCell align="right">Min - max</TableCell><TableCell align="right">Personal range</TableCell><TableCell align="right">Latest</TableCell></TableRow></TableHead>
            <TableBody>
              {METRIC_KEYS.map((k) => {
                const s = stats(period.map((r) => num(r, k)).filter((v): v is number => v !== undefined));
                const d = VITALS[k];
                const ms = a.metrics[k];
                const f = (v: number) => v.toFixed(d.decimals);
                return (
                  <TableRow key={k}>
                    <TableCell>{d.label} <Typography component="span" variant="caption" color="text.secondary">({d.unit})</Typography></TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{s?.n ?? 0}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{s ? f(s.mean) : '-'}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{s ? `${f(s.min)} - ${f(s.max)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{ms.baseline ? `${f(ms.baseline.low)} - ${f(ms.baseline.high)}` : '-'}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO, color: ms.severity === 'nominal' ? 'text.primary' : ms.severity === 'alert' ? 'error.main' : 'warning.main', fontWeight: ms.severity === 'nominal' ? 400 : 600 }}>{ms.latest ? f(ms.latest.value) : '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr' }, mb: 3, breakInside: 'avoid' }}>
            {CORE_KEYS.map((k) => (
              <Box key={k}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{VITALS[k].label}</Typography>
                <VitalChart rows={all.filter((r) => Date.parse(r.timestamp) >= since - 7 * 86_400_000)} metric={k} baseline={a.metrics[k].baseline} height={150} color={p.color} />
              </Box>
            ))}
          </Box>

          <Typography variant="h6" gutterBottom>3. Performance</Typography>
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { sm: '1fr 1fr' }, mb: 3 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Reaction-time tests ({tests.length})</Typography>
              {tests.length ? (
                <Table size="small">
                  <TableHead><TableRow><TableCell>Date</TableCell><TableCell align="right">Median RT</TableCell><TableCell align="right">Lapses</TableCell><TableCell>Level</TableCell></TableRow></TableHead>
                  <TableBody>
                    {tests.slice(-5).map((t) => (
                      <TableRow key={t.id}><TableCell>{new Date(t.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</TableCell><TableCell align="right" sx={{ fontFamily: MONO }}>{t.medianRT} ms</TableCell><TableCell align="right" sx={{ fontFamily: MONO }}>{t.lapses}</TableCell><TableCell><SeverityChip severity={assessPvt(t, pvt).severity} /></TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <Typography variant="body2" color="text.secondary">No tests in this period.</Typography>}
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Exercise, last 7 days</Typography>
              <Typography variant="body2" color="text.secondary">Resistive {comp.resistanceMin} / {settings.prescription.resistanceMinPerWeek} min · Aerobic {comp.aerobicMin} / {settings.prescription.aerobicMinPerWeek} min · {comp.activeDays} / {settings.prescription.activeDaysPerWeek} active days</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}><SeverityChip severity={comp.severity} label={`${Math.round(comp.overallPct * 100)}% of prescription`} /></Stack>
            </Box>
          </Box>

          <Typography variant="h6" gutterBottom>4. Symptoms and medication</Typography>
          {symptoms.length ? (
            <Box component="ul" sx={{ mt: 0, pl: 2.5 }}>
              {symptoms.map((r) => <li key={r.id}><Typography variant="body2"><Box component="span" sx={{ color: 'text.secondary', fontFamily: MONO, fontSize: 12 }}>{fmtTime(r.timestamp)}</Box>: {r.symptoms}</Typography></li>)}
            </Box>
          ) : <Typography variant="body2" color="text.secondary">No symptoms reported in this period.</Typography>}
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            Medication dispensed to this crew member: {meds.length ? meds.map((d) => `${inventory.find((i) => i.id === d.itemId)?.name ?? d.itemId} × ${d.amount}`).join('; ') : 'none recorded'}.
          </Typography>

          <Typography variant="h6" sx={{ mt: 3 }} gutterBottom>5. Notes for the flight surgeon</Typography>
          <TextField multiline minRows={3} fullWidth value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Crew medical officer's observations, questions for the private medical conference…" />

          <Divider sx={{ my: 3 }} />
          <Typography variant="caption" color="text.secondary">
            AstroCare research prototype. Automated findings are prompts for clinical review, not diagnoses. Reference ranges: AHA, MedlinePlus, CDC; personal ranges from this crew member's first check-ins; reaction testing per PVT-B (Basner & Dinges 2011).
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}
