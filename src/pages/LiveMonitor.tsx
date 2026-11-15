import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import { useApp } from '../state';
import { useTelemetry } from '../telemetry';
import { EmptyState, PageHeader, Section, SeverityChip, SourceLinks, ago } from '../components/common';
import { LiveChart, type LivePoint } from '../components/charts';
import { VITALS, referenceSeverity, type Severity } from '../lib/monitoring';
import { SCENARIOS, type Scenario } from '../lib/simulator';
import { LIVE_KEYS } from '../lib/telemetry';
import { MODEL_FOR } from '../lib/models';
import type { RecordEntry } from '../storage';
import { MONO } from '../theme';

export default function LiveMonitor({ profileId }: { profileId?: string }) {
  const { profiles, settings, saveReading, notify } = useApp();
  const tel = useTelemetry();
  const [profile, setProfile] = useState(profileId && profiles.some((p) => p.id === profileId) ? profileId : profiles[0]?.id ?? '');
  if (!profiles.length) return <EmptyState icon={<MonitorHeartOutlined />} title="No crew to monitor" action={<Button href="#/">Go to mission control</Button>}>Add a crew member first.</EmptyState>;

  const p = profiles.find((x) => x.id === profile)!;
  const stream = tel.engine?.streams.get(profile);
  const history = stream?.history ?? [];
  const lost = history.at(-1)?.signal === 'lost';
  const scenario = tel.engine?.scenario(profile) ?? 'rest';
  const events = [...tel.alarms].reverse().filter((a) => a.profile === profile).slice(0, 14);
  const series = (k: (typeof LIVE_KEYS)[number]): LivePoint[] => history.map((h) => ({ t: h.t, v: h.values[k], lo: h.band[k]?.[0], hi: h.band[k]?.[1], flag: h.flags.includes(k) }));

  async function snapshot() {
    const avg = tel.engine?.average(profile, 6) ?? {};
    const r: RecordEntry = { id: crypto.randomUUID(), profile, timestamp: new Date().toISOString(), source: 'sensor-sim', sync: 'pending', mission: settings.mission, symptoms: 'Snapshot from wearable telemetry (30-min average)', glucoseContext: '' };
    for (const k of LIVE_KEYS) if (avg[k] !== undefined) r[k] = k === 'temperature' ? Number(avg[k]!.toFixed(1)) : Math.round(avg[k]!);
    await saveReading(r);
    notify(`Telemetry snapshot saved to ${p.name}'s record.`);
  }

  return (
    <>
      <PageHeader
        title="Telemetry"
        subtitle="Simulated wearables stream every crew member continuously, in the background on every page. Models trained on 8,000 real ICU stays predict each next reading; the shaded band is the 90% expected range. Readings outside it, reference-limit crossings and sensor dropouts raise alarms automatically."
      />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <TextField select size="small" label="Crew member" value={profile} onChange={(e) => setProfile(e.target.value)} sx={{ minWidth: 220 }}>
              {profiles.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
            </TextField>
            <Button variant="outlined" onClick={() => tel.setRunning(!tel.running)} startIcon={tel.running ? <PauseRounded /> : <PlayArrowRounded />}>{tel.running ? 'Pause all telemetry' : 'Resume telemetry'}</Button>
            <Button variant="outlined" startIcon={<SaveOutlined />} onClick={() => void snapshot()}>Save snapshot to record</Button>
            <Box sx={{ flex: 1 }} />
            <Typography variant="body2" color={lost ? 'warning.main' : 'text.secondary'}>{lost ? 'Signal lost' : tel.running ? 'Streaming' : 'Paused'}</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2.5, alignItems: { sm: 'center' } }}>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Inject scenario</Typography>
            <ToggleButtonGroup size="small" exclusive value={scenario} onChange={(_, v: Scenario | null) => v && tel.setScenario(profile, v)} sx={{ flexWrap: 'wrap' }}>
              {SCENARIOS.map((s) => <ToggleButton key={s.id} value={s.id} title={s.detail}>{s.label}</ToggleButton>)}
            </ToggleButtonGroup>
          </Stack>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>Scheduled workouts start on their own and are detected from heart rate and logged to the exercise record. The selected scenario applies to {p.name}.</Typography>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 340px' } }}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: '1fr 1fr' }, alignContent: 'start' }}>
          {LIVE_KEYS.map((k) => {
            const def = VITALS[k];
            const pts = series(k);
            const lastOk = [...pts].reverse().find((d) => d.v !== undefined);
            const lastPt = pts.at(-1);
            const ref = lastOk?.v !== undefined ? referenceSeverity(k, lastOk.v) : { severity: 'nominal' as Severity };
            const sev: Severity = ref.severity !== 'nominal' ? ref.severity : lastPt?.flag ? 'watch' : 'nominal';
            return (
              <Card key={k}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">{def.label}</Typography>
                      <Typography sx={{ fontFamily: MONO, fontSize: 32, fontWeight: 500, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
                        {lastOk?.v !== undefined ? lastOk.v.toFixed(def.decimals) : '-'}
                        <Typography component="span" color="text.secondary" sx={{ fontSize: 13, ml: 0.5 }}>{def.unit}</Typography>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {lastPt?.lo !== undefined ? <>Expected <Box component="span" sx={{ fontFamily: MONO }}>{lastPt.lo.toFixed(def.decimals)} to {lastPt.hi!.toFixed(def.decimals)}</Box></> : 'Model warming up'}
                      </Typography>
                    </Box>
                    <SeverityChip severity={sev} label={sev === 'nominal' ? 'In range' : lastPt?.flag && ref.severity === 'nominal' ? 'Unexpected' : undefined} />
                  </Stack>
                  <Box sx={{ mt: 1.5 }}><LiveChart data={pts} metric={k} height={160} /></Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
        <Stack spacing={3}>
          <Section title="Alarms for this crew member" subheader={`${events.length} recent`}>
            {events.length ? (
              <Stack spacing={1.25} sx={{ maxHeight: 380, overflowY: 'auto' }}>
                {events.map((e) => (
                  <Box key={e.id}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><SeverityChip severity={e.severity} /><Typography variant="caption" color="text.secondary">{ago(e.at)}</Typography></Stack>
                    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>{e.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{e.detail}</Typography>
                  </Box>
                ))}
              </Stack>
            ) : <Typography variant="body2" color="text.secondary">No alarms yet. Try the orthostatic stress or sensor dropout scenario.</Typography>}
          </Section>
          <Section title="Forecast model" subheader="Gradient-boosted trees, evaluated in this browser">
            {!tel.engine?.bundle ? <Alert severity="warning">Model file unavailable. Reference-limit detection only.</Alert> : (
              <>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Signal</TableCell><TableCell align="right">90% band</TableCell><TableCell align="right">Test coverage</TableCell></TableRow></TableHead>
                  <TableBody>
                    {LIVE_KEYS.map((k) => {
                      const m = tel.engine!.bundle!.models[MODEL_FOR[k]!];
                      return m ? <TableRow key={k}><TableCell>{VITALS[k].label}</TableCell><TableCell align="right" sx={{ fontFamily: MONO }}>±{m.conformal.q90.toFixed(k === 'temperature' ? 2 : 1)}</TableCell><TableCell align="right" sx={{ fontFamily: MONO }}>{(m.conformal.testCoverage.q90 * 100).toFixed(1)}%</TableCell></TableRow> : null;
                    })}
                  </TableBody>
                </Table>
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>Split-conformal intervals calibrated on PhysioNet validation stays and checked on 4,000 held-out stays. Trained on an Earth ICU population: crew or analog recalibration is required before real use.</Typography>
                <SourceLinks ids={['physionet']} sx={{ mt: 1 }} />
              </>
            )}
          </Section>
        </Stack>
      </Box>
    </>
  );
}
