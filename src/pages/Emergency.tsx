import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import SatelliteAltOutlined from '@mui/icons-material/SatelliteAltOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import LocalHospitalOutlined from '@mui/icons-material/LocalHospitalOutlined';
import { useApp } from '../state';
import { getSetting, setSetting } from '../storage';
import { EmptyState, PageHeader, Section, SeverityChip, SourceLinks, Stat, download, fmtTime } from '../components/common';
import { METRIC_KEYS, VITALS, num } from '../lib/monitoring';
import { delayLabel, missionProfile, worstRoundTripMs } from '../lib/mission';
import { MONO } from '../theme';

type Log = { at: string; text: string };
type EmergencyState = { scenario: string; startedAt?: string; events: Log[]; request: string };
const EMPTY: EmergencyState = { scenario: 'Other reported concern', events: [], request: 'Flight surgeon review of observations and guidance per mission protocol.' };
const CONCERNS = ['Reported chest pain', 'Reported collapse / fainting', 'Breathing difficulty', 'Fever / suspected infection', 'Injury', 'Psychological distress', 'Other reported concern'];
const QUICK = ['Crew member conscious and responsive', 'Breathing observed', 'Vitals measured (see attached)', 'Medical kit opened', 'Crew medical officer at side', 'Ground medical support contacted', 'Symptoms improving', 'Symptoms worsening'];

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function Emergency({ profileId }: { profileId?: string }) {
  const { profiles, records, assessments, settings, notify } = useApp();
  const [profile, setProfile] = useState(profileId && profiles.some((p) => p.id === profileId) ? profileId : profiles[0]?.id ?? '');
  const [st, setSt] = useState<EmergencyState>(EMPTY);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const p = profiles.find((x) => x.id === profile);
  const m = missionProfile(settings.mission);

  useEffect(() => {
    let live = true;
    setSt(EMPTY);
    if (profile) getSetting('emergency-' + profile).then((e) => { if (live && e) setSt({ ...EMPTY, ...e }); });
    return () => { live = false; };
  }, [profile]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (!p) return <EmptyState icon={<LocalHospitalOutlined />} title="No crew member" action={<Button href="#/">Go to mission control</Button>}>Add a crew member or load the demo crew first.</EmptyState>;

  const save = async (next: EmergencyState) => { setSt(next); await setSetting('emergency-' + profile, next); };
  const add = async (text: string) => {
    if (!text.trim()) return;
    const at = new Date().toISOString();
    await save({ ...st, startedAt: st.startedAt ?? at, events: [...st.events, { at, text: text.trim() }] });
    setNote('');
  };
  const a = assessments[p.id];
  const mine = records.filter((r) => r.profile === p.id);
  const latest = METRIC_KEYS.map((k) => ({ k, s: a.metrics[k] })).filter((x) => x.s.latest);
  const rtt = worstRoundTripMs(m);

  const handover = () => [
    'ASTROCARE CREW MEDICAL HANDOVER (SBAR)',
    `Generated: ${new Date().toISOString()}   Mission: ${settings.callsign} / ${m.id}   Link delay: ${delayLabel(m)}`,
    'Prototype output, observations only, not a diagnosis or treatment protocol. Not transmitted automatically.',
    '',
    'S: SITUATION',
    `Crew member: ${p.name} (${p.role})`,
    `Concern: ${st.scenario}`,
    st.startedAt ? `Event started: ${st.startedAt} (elapsed ${clock(Date.now() - Date.parse(st.startedAt))})` : 'Event clock not started',
    '',
    'B: BACKGROUND',
    `Check-ins on record: ${a.checkIns}. Last check-in: ${a.lastCheckIn ?? 'none'}.`,
    ...latest.map(({ k, s }) => `  ${VITALS[k].label}: ${s.latest!.value.toFixed(VITALS[k].decimals)} ${VITALS[k].unit} at ${s.latest!.timestamp}` + (s.baseline ? ` (personal typical ${s.baseline.low.toFixed(VITALS[k].decimals)}-${s.baseline.high.toFixed(VITALS[k].decimals)})` : '')),
    '',
    'A: ASSESSMENT (automated monitoring findings + observations; no diagnosis)',
    ...(a.findings.length ? a.findings.map((f) => `  [${f.severity.toUpperCase()}] ${f.title}, ${f.detail}`) : ['  No automated findings.']),
    ...(st.events.length ? ['  Observation log:', ...st.events.map((e) => `   ${e.at}  ${e.text}`)] : ['  No observations logged.']),
    '',
    'R: REQUEST',
    `  ${st.request}`,
    '',
    'Recent records:',
    ...mine.slice(-5).map((r) => `  ${r.timestamp} [${r.source}] ` + METRIC_KEYS.filter((k) => num(r, k) !== undefined).map((k) => `${VITALS[k].short} ${num(r, k)}`).join(', ') + (r.symptoms ? ` | "${r.symptoms}"` : '')),
  ].join('\n');

  return (
    <>
      <PageHeader title="Emergency handover" subtitle="Record what you observe with timestamps. AstroCare attaches the latest vitals and monitoring findings and formats an SBAR handover for the flight surgeon, ready before the link is." />
      <Alert severity="error" variant="outlined" sx={{ mb: 3 }}>
        <AlertTitle>Follow the mission-approved emergency procedure first</AlertTitle>
        This workspace records observations and prepares communication. It does not assess an emergency, provide treatment steps, or transmit anything.
      </Alert>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: 'repeat(3, 1fr)' }, mb: 3 }}>
        <Stat label="Event clock" value={st.startedAt ? clock(now - Date.parse(st.startedAt)) : '--:--:--'} icon={<TimerOutlined />} caption={st.startedAt ? `Started ${fmtTime(st.startedAt)}` : 'Starts with the first logged observation'} />
        <Stat label="Earth link (one-way)" value={delayLabel(m).replace(' one-way', '')} icon={<SatelliteAltOutlined />} caption={m.id} />
        <Stat label="Earliest ground reply" value={rtt < 5000 ? 'Now' : new Date(now + rtt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} icon={<ScheduleOutlined />} caption={rtt < 5000 ? 'Near real-time link' : `If sent now · worst-case round trip ${Math.round(rtt / 60000)} min`} />
      </Box>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 1fr' } }}>
        <Section title="1 · Observation log">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr' } }}>
            <TextField select size="small" label="Crew member" value={profile} onChange={(e) => setProfile(e.target.value)}>
              {profiles.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Concern" value={st.scenario} onChange={(e) => void save({ ...st, scenario: e.target.value })}>
              {CONCERNS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
          </Box>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mt: 2 }}>
            {QUICK.map((q) => <Chip key={q} icon={<AddRounded />} label={q} variant="outlined" onClick={() => void add(q)} />)}
          </Stack>
          <Stack direction="row" spacing={1} component="form" onSubmit={(e) => { e.preventDefault(); void add(note); }} sx={{ mt: 2 }}>
            <TextField size="small" fullWidth value={note} onChange={(e) => setNote(e.target.value)} placeholder="What do you observe? Describe, don't diagnose." slotProps={{ htmlInput: { maxLength: 500 } }} />
            <Button type="submit" variant="contained" disabled={!note.trim()}>Log</Button>
          </Stack>
          <Stack spacing={1} sx={{ mt: 2 }}>
            {st.events.map((e, i) => (
              <Paper key={i} variant="outlined" sx={{ px: 1.5, py: 1, display: 'flex', gap: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: MONO, mt: 0.25 }}>{st.startedAt ? `T+${clock(Date.parse(e.at) - Date.parse(st.startedAt))}` : ''}</Typography>
                <Typography variant="body2">{e.text}</Typography>
              </Paper>
            ))}
            {!st.events.length && <Typography variant="body2" color="text.secondary">No observations yet.</Typography>}
          </Stack>
          {st.events.length > 0 && <Button size="small" color="inherit" sx={{ mt: 1.5, color: 'text.secondary' }} onClick={() => void save({ ...EMPTY, scenario: st.scenario })}>Close event and clear log</Button>}
        </Section>
        <Stack spacing={3}>
          <Section title="2 · Attached automatically" action={<SeverityChip severity={a.status} />}>
            <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {latest.map(({ k, s }) => (
                <Paper key={k} variant="outlined" sx={{ px: 1.25, py: 0.75 }}>
                  <Typography variant="caption" color="text.secondary">{VITALS[k].label.replace('Body ', '').replace(' pressure', '')}</Typography>
                  <Typography sx={{ fontFamily: MONO, fontWeight: 500 }}>{s.latest!.value.toFixed(VITALS[k].decimals)}</Typography>
                </Paper>
              ))}
            </Box>
            <Stack spacing={0.75} sx={{ mt: 2 }}>
              {a.findings.slice(0, 5).map((f) => <Stack key={f.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}><SeverityChip severity={f.severity} /><Typography variant="body2" color="text.secondary">{f.title}</Typography></Stack>)}
            </Stack>
          </Section>
          <Section
            title="3 · SBAR handover"
            action={
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" startIcon={<DownloadOutlined />} onClick={() => { download(`AstroCare-handover-${p.name.replace(/\W+/g, '-')}.txt`, handover()); notify('Handover exported. Nothing was transmitted.'); }}>Export</Button>
                <Button size="small" variant="outlined" startIcon={<PrintOutlined />} onClick={() => window.print()}>Print</Button>
              </Stack>
            }
          >
            <TextField fullWidth size="small" label="Request to ground" value={st.request} onChange={(e) => setSt({ ...st, request: e.target.value })} onBlur={() => void save(st)} slotProps={{ htmlInput: { maxLength: 300 } }} />
            <Paper variant="outlined" sx={{ mt: 2, p: 1.5, maxHeight: 320, overflow: 'auto', bgcolor: 'action.hover' }}>
              <Box component="pre" sx={{ m: 0, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{handover()}</Box>
            </Paper>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}><Chip size="small" label="Not transmitted" /><SourceLinks ids={['risks', 'earth']} /></Stack>
          </Section>
        </Stack>
      </Box>
    </>
  );
}
