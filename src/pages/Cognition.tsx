import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, LinearProgress, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import { useApp } from '../state';
import { EmptyState, PageHeader, Section, SeverityChip, SourceLinks, fmtDay } from '../components/common';
import { ChartTip, useChartTheme } from '../components/charts';
import { assessPvt, FALSE_START_MS, LAPSE_MS, randomIsi, scorePvt, type PvtResult } from '../lib/pvt';
import { MONO } from '../theme';

type Phase = 'idle' | 'waiting' | 'stimulus' | 'done';
const TIMEOUT_MS = 10_000;

export default function Cognition({ profileId }: { profileId?: string }) {
  const { profiles, pvt, addPvt, notify } = useApp();
  const theme = useTheme();
  const c = useChartTheme();
  const [profile, setProfile] = useState(profileId && profiles.some((p) => p.id === profileId) ? profileId : profiles[0]?.id ?? '');
  const [duration, setDuration] = useState<60 | 180>(60);
  const [phase, setPhase] = useState<Phase>('idle');
  const [counter, setCounter] = useState(0);
  const [feedback, setFeedback] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<PvtResult | null>(null);
  const rts = useRef<number[]>([]);
  const falseStarts = useRef(0);
  const onset = useRef(0);
  const endAt = useRef(0);
  const startAt = useRef(0);
  const timer = useRef<number>(undefined);
  const timeout = useRef<number>(undefined);
  const raf = useRef<number>(undefined);
  const phaseRef = useRef<Phase>('idle');
  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const clearAll = () => { window.clearTimeout(timer.current); window.clearTimeout(timeout.current); if (raf.current) cancelAnimationFrame(raf.current); };
  useEffect(() => clearAll, []);

  const finish = useCallback(() => {
    clearAll();
    const r = scorePvt(rts.current, falseStarts.current, duration, { id: crypto.randomUUID(), profile, timestamp: new Date().toISOString(), source: 'test' });
    setResult(r);
    setP('done');
  }, [duration, profile]);

  const next = useCallback(() => {
    const now = performance.now();
    setElapsed(Math.min(1, (now - startAt.current) / (endAt.current - startAt.current)));
    if (now >= endAt.current) return finish();
    setP('waiting');
    timer.current = window.setTimeout(() => {
      onset.current = performance.now();
      setP('stimulus');
      const tick = () => { setCounter(Math.round(performance.now() - onset.current)); raf.current = requestAnimationFrame(tick); };
      raf.current = requestAnimationFrame(tick);
      timeout.current = window.setTimeout(() => { if (raf.current) cancelAnimationFrame(raf.current); rts.current.push(TIMEOUT_MS); setFeedback('No response, counted as a lapse'); next(); }, TIMEOUT_MS);
    }, randomIsi());
  }, [finish]);

  const respond = useCallback(() => {
    const ph = phaseRef.current;
    if (ph === 'waiting') {
      falseStarts.current += 1;
      setFeedback('Too early. Wait for the counter');
      window.clearTimeout(timer.current);
      next();
    } else if (ph === 'stimulus') {
      const rt = performance.now() - onset.current;
      window.clearTimeout(timeout.current);
      if (raf.current) cancelAnimationFrame(raf.current);
      setCounter(Math.round(rt));
      if (rt < FALSE_START_MS) { falseStarts.current += 1; setFeedback('Anticipation (< 100 ms), counted as a false start'); }
      else { rts.current.push(rt); setFeedback(rt >= LAPSE_MS ? `${Math.round(rt)} ms, lapse` : `${Math.round(rt)} ms`); }
      next();
    }
  }, [next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (phaseRef.current !== 'waiting' && phaseRef.current !== 'stimulus')) return;
      e.preventDefault();
      respond();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [respond]);

  function start() {
    rts.current = [];
    falseStarts.current = 0;
    setResult(null);
    setFeedback('');
    setCounter(0);
    startAt.current = performance.now();
    endAt.current = startAt.current + duration * 1000;
    next();
  }

  const history = useMemo(() => pvt.filter((x) => x.profile === profile).sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [pvt, profile]);
  const p = profiles.find((x) => x.id === profile);
  if (!profiles.length) return <EmptyState icon={<PsychologyOutlined />} title="No crew yet" action={<Button href="#/">Go to mission control</Button>}>Add a crew member or load the demo crew first.</EmptyState>;

  const assessment = result ? assessPvt(result, pvt) : null;
  const running = phase === 'waiting' || phase === 'stimulus';
  const chartRows = history.map((h) => ({ t: Date.parse(h.timestamp), median: h.medianRT, lapses: h.lapses, falseStarts: h.falseStarts }));
  const columns: GridColDef<PvtResult>[] = [
    { field: 'timestamp', headerName: 'Taken', width: 150, valueFormatter: (v: string) => new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    { field: 'durationSec', headerName: 'Length', width: 80, valueFormatter: (v: number) => `${v / 60} min` },
    { field: 'medianRT', headerName: 'Median RT (ms)', type: 'number', width: 130 },
    { field: 'meanRT', headerName: 'Mean RT (ms)', type: 'number', width: 120 },
    { field: 'lapses', headerName: 'Lapses', type: 'number', width: 90 },
    { field: 'falseStarts', headerName: 'False starts', type: 'number', width: 110 },
    { field: 'performance', headerName: 'Performance', type: 'number', width: 115, valueFormatter: (v: number) => `${Math.round(v * 100)}%` },
    { field: 'source', headerName: 'Source', width: 100 },
  ];

  return (
    <>
      <PageHeader
       
        title="Psychomotor vigilance test"
        subtitle="A few minutes of reaction-time testing detects fatigue and sleep loss that crew members often underestimate. Each result is compared with that person's own earlier tests."
      />
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1.15fr 1fr' } }}>
        <Section title="Take the test" subheader="Press SPACE (or tap the panel) as soon as the counter appears. Don't press early.">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField select size="small" label="Crew member" value={profile} onChange={(e) => setProfile(e.target.value)} disabled={running} sx={{ minWidth: 220 }}>
              {profiles.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
            </TextField>
            <ToggleButtonGroup size="small" exclusive value={duration} onChange={(_, v) => v && setDuration(v)} disabled={running}>
              <ToggleButton value={60}>Quick · 1 min</ToggleButton>
              <ToggleButton value={180}>Standard PVT-B · 3 min</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Paper
            variant="outlined"
            onPointerDown={(e) => { if (running) { e.preventDefault(); respond(); } }}
            role="button"
            tabIndex={0}
            aria-label="Reaction test area"
            sx={{
              height: 280, display: 'grid', placeItems: 'center', userSelect: 'none', cursor: running ? 'pointer' : 'default', borderRadius: 3,
              bgcolor: phase === 'stimulus' ? alpha(theme.palette.warning.main, 0.1) : theme.palette.mode === 'light' ? '#0f1824' : '#080d14',
              borderColor: phase === 'stimulus' ? 'warning.main' : 'divider', transition: 'background-color .08s',
            }}
          >
            {phase === 'idle' && (
              <Stack spacing={2} sx={{ alignItems: 'center', color: '#e5ebf2', textAlign: 'center', px: 3 }}>
                <Typography sx={{ color: '#9aa9bb' }}>{p?.name} · {duration === 60 ? '1-minute practice-length test' : '3-minute PVT-B'}</Typography>
                <Button variant="contained" size="large" startIcon={<PlayArrowRounded />} onClick={start}>Start test</Button>
              </Stack>
            )}
            {running && (
              <Stack spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontFamily: MONO, fontSize: 72, fontWeight: 500, color: phase === 'stimulus' ? theme.palette.warning.main : '#3a4a5e', lineHeight: 1 }}>
                  {phase === 'stimulus' ? counter : '·'}
                </Typography>
                <Typography sx={{ color: '#9aa9bb', minHeight: 24 }}>{feedback || 'Wait for the counter…'}</Typography>
              </Stack>
            )}
            {phase === 'done' && result && (
              <Stack spacing={1.5} sx={{ alignItems: 'center', color: '#e5ebf2' }}>
                <Typography sx={{ fontFamily: MONO, fontSize: 44 }}>{result.medianRT} ms</Typography>
                <Typography sx={{ color: '#9aa9bb' }}>median reaction time · {result.lapses} lapses · {result.falseStarts} false starts</Typography>
              </Stack>
            )}
          </Paper>
          {running && <LinearProgress variant="determinate" value={elapsed * 100} sx={{ mt: 1.5, height: 5, borderRadius: 3 }} />}
          {phase === 'done' && result && assessment && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={assessment.severity === 'nominal' ? 'success' : assessment.severity === 'watch' ? 'warning' : 'error'}>
                {assessment.text}. Performance score {Math.round(result.performance * 100)}% (1 − (lapses + false starts) / stimuli).
              </Alert>
              <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
                <Button variant="contained" startIcon={<SaveOutlined />} onClick={async () => { await addPvt(result); notify('Test result saved.'); setP('idle'); }}>Save result</Button>
                <Button startIcon={<ReplayRounded />} onClick={() => setP('idle')}>Discard</Button>
              </Stack>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
            Protocol: random 2-5 s interval; lapse ≥ {LAPSE_MS} ms; false start &lt; {FALSE_START_MS} ms or before the counter; 10 s without response counts as a lapse. A self-monitoring aid, not a fitness-for-duty decision.
          </Typography>
          <SourceLinks ids={['pvtBasner', 'cognitionBattery', 'research']} sx={{ mt: 1 }} />
        </Section>

        <Stack spacing={3}>
          <Section title={`${p?.name ?? ''} : history`} subheader={history.length ? `${history.length} tests` : 'No tests yet'} action={history.length ? <SeverityChip severity={assessPvt(history.at(-1)!, pvt).severity} label={`Latest: ${assessPvt(history.at(-1)!, pvt).severity}`} /> : undefined}>
            {history.length ? (
              <>
                <Typography variant="body2" color="text.secondary">Median reaction time (ms)</Typography>
                <Box sx={{ height: 170 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtDay(t)} minTickGap={36} {...c.axis} />
                      <YAxis width={44} domain={['auto', 'auto']} {...c.axis} />
                      <Tooltip content={(tp) => <ChartTip {...(tp as object)} render={(d) => <><Typography variant="caption" color="text.secondary">{fmtDay(d.t as number)}</Typography><Typography sx={{ fontFamily: MONO, fontSize: 13 }}>{d.median as number} ms median</Typography></>} />} />
                      <Line dataKey="median" stroke={c.crew(p?.color ?? 0)} strokeWidth={2} dot={{ r: 3.5, stroke: c.surface, strokeWidth: 2, fill: c.crew(p?.color ?? 0) }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Lapses per test</Typography>
                <Box sx={{ height: 130 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={c.grid} />
                      <XAxis dataKey="t" tickFormatter={(t) => fmtDay(t)} minTickGap={36} {...c.axis} />
                      <YAxis width={44} allowDecimals={false} {...c.axis} />
                      <Tooltip cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }} content={(tp) => <ChartTip {...(tp as object)} render={(d) => <><Typography variant="caption" color="text.secondary">{fmtDay(d.t as number)}</Typography><Typography sx={{ fontFamily: MONO, fontSize: 13 }}>{d.lapses as number} lapses</Typography></>} />} />
                      <Bar dataKey="lapses" fill={c.crew(0)} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">Take a test to start a personal baseline. Two tests are needed before changes are compared.</Typography>
            )}
          </Section>
          <Section title="Why this matters in space">
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
              Isolation, shifted schedules and noisy habitats erode sleep. Sleep loss slows reactions and causes attention lapses well before people feel impaired, risky during docking, EVA or robotic operations. A brief PVT is one of the most sensitive objective measures of this, which is why a cognitive test battery including a PVT was developed for spaceflight.
            </Typography>
          </Section>
        </Stack>
      </Box>
      <Section title="All results" sx={{ mt: 3 }} contentSx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ height: 360 }}>
          <DataGrid rows={history} columns={columns} density="compact" showToolbar disableRowSelectionOnClick initialState={{ sorting: { sortModel: [{ field: 'timestamp', sort: 'desc' }] } }} sx={{ border: 0 }} />
        </Box>
      </Section>
    </>
  );
}
