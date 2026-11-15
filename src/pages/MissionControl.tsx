import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CardHeader, Divider, LinearProgress, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import GroupAddOutlined from '@mui/icons-material/GroupAddOutlined';
import SatelliteAltOutlined from '@mui/icons-material/SatelliteAltOutlined';
import { useApp } from '../state';
import { useLink, useTelemetry } from '../telemetry';
import { CrewAvatar, SeverityChip, ago, fmtTime, useSevColor } from '../components/common';
import { Sparkline } from '../components/charts';
import { VITALS, num, referenceSeverity, type MetricKey } from '../lib/monitoring';
import { CAREER_LIMIT_mSv, cumulativeDose, delayLabel, missionDay, missionProfile } from '../lib/mission';
import { project } from '../lib/inventory';
import { weeklyCompliance } from '../lib/exercise';
import { buildBrief } from '../lib/briefing';
import { fmtCountdown } from '../lib/comms';
import type { LiveKey } from '../lib/telemetry';
import { MONO } from '../theme';

function AddCrew() {
  const { addProfile } = useApp();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  return (
    <Box component="form" onSubmit={async (e: React.FormEvent) => { e.preventDefault(); if (!name.trim()) return; const p = await addProfile(name, role); setName(''); setRole(''); window.location.hash = `/crew/${p.id}`; }} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { sm: '1fr 1fr auto' }, alignItems: 'center' }}>
      <TextField size="small" label="Name" required value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
      <TextField size="small" label="Role" value={role} onChange={(e) => setRole(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
      <Button type="submit" variant="outlined" startIcon={<GroupAddOutlined />}>Add</Button>
    </Box>
  );
}

function LiveValue({ k, v, exertion }: { k: LiveKey; v?: number; exertion?: boolean }) {
  const sev = useSevColor();
  if (v === undefined) return <Typography component="span" color="text.disabled">no signal</Typography>;
  const s = exertion && k !== 'temperature' ? 'nominal' : referenceSeverity(k, v).severity;
  return <Box component="span" sx={{ fontFamily: MONO, color: s === 'nominal' ? 'text.primary' : sev(s), fontWeight: s === 'nominal' ? 400 : 600 }}>{v.toFixed(VITALS[k].decimals)}</Box>;
}

export default function MissionControl() {
  const app = useApp();
  const { profiles, assessments, settings, inventory, dispenses, exercise, pvt, records, removeDemo, loadDemo } = app;
  const tel = useTelemetry();
  const link = useLink();
  const [showAll, setShowAll] = useState(false);
  const sev = useSevColor();
  const m = missionProfile(settings.mission);
  const day = missionDay(settings.missionStart);
  const supplies = useMemo(() => inventory.map((item) => ({ item, proj: project(item, dispenses, Date.parse(settings.missionStart), settings.missionDays) })), [inventory, dispenses, settings.missionStart, settings.missionDays]);
  const compliance = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, exercise.some((x) => x.profile === p.id) ? weeklyCompliance(exercise, p.id, settings.prescription) : undefined])), [profiles, exercise, settings.prescription]);
  const brief = useMemo(() => buildBrief({ profiles, assessments, pvt, compliance, supplies, unackedAlarms: tel.unacked, missionDay: day, missionDays: settings.missionDays }), [profiles, assessments, pvt, compliance, supplies, tel.unacked, day, settings.missionDays]);
  const queued = tel.outbox.filter((p) => p.status === 'queued');
  const sent = tel.outbox.filter((p) => p.status === 'sent').slice(-3).reverse();
  const openAlarms = [...tel.alarms].reverse().filter((a) => !a.ackAt).slice(0, 6);
  const dose = cumulativeDose(m, day);
  const isDemo = profiles.some((p) => p.demo);

  if (!profiles.length)
    return (
      <Box sx={{ maxWidth: 720 }}>
        <Typography variant="h4" component="h1">Start a mission</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Add the crew roster to begin monitoring, or load the simulated 30-day demo mission.</Typography>
        <Card><CardContent sx={{ p: '20px !important' }}><AddCrew /></CardContent></Card>
        <Button sx={{ mt: 2 }} onClick={() => void loadDemo()}>Load demo mission</Button>
      </Box>
    );

  return (
    <>
      {isDemo && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button color="inherit" size="small" onClick={() => void removeDemo()}>Start empty mission</Button>}>
          Demo mission: four fictional crew members, 30 days of simulated history and simulated live wearables.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 360px' }, mb: 3 }}>
        <Card>
          <CardContent sx={{ p: '22px 24px !important' }}>
            <Typography variant="body2" color="text.secondary">Daily medical brief, generated {fmtTime(new Date().toISOString())}</Typography>
            <Typography variant="h4" component="h1" sx={{ mt: 0.75, mb: 1.5 }}>{brief.headline}</Typography>
            <Stack spacing={0.5}>
              {brief.lines.map((l) => <Typography key={l} color="text.secondary" sx={{ lineHeight: 1.55 }}>{l}</Typography>)}
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Ground link" subheader={`${delayLabel(m)} light time`} action={<SatelliteAltOutlined sx={{ color: link.open ? 'text.primary' : 'text.disabled' }} />} />
          <CardContent>
            <Typography sx={{ fontFamily: MONO, fontSize: 26, lineHeight: 1.2 }}>{link.open ? 'IN CONTACT' : fmtCountdown(link.nextStart - Date.now())}</Typography>
            <Typography variant="body2" color="text.secondary">{link.open ? `Window closes in ${fmtCountdown((link.closesAt ?? 0) - Date.now())}` : 'until the next contact window'}</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>{queued.length} packet{queued.length === 1 ? '' : 's'} queued for downlink</Typography>
            <Stack spacing={0.5}>
              {queued.slice(0, 3).map((p) => <Typography key={p.id} variant="body2" color="text.secondary" noWrap>{p.title}{p.auto ? ' (auto)' : ''}</Typography>)}
              {sent.map((p) => <Typography key={p.id} variant="body2" color="text.disabled" noWrap>Sent: {p.title}, arrives {new Date(p.deliveredAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>)}
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 360px' } }}>
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <Card>
            <CardHeader title="Crew telemetry" subheader="Live from simulated wearables; values outside reference limits are highlighted" />
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ '& td, & th': { py: 1.25 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 2.5 }}>Crew member</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">HR</TableCell>
                    <TableCell sx={{ width: 110 }} />
                    <TableCell align="right">BP</TableCell>
                    <TableCell align="right">Temp</TableCell>
                    <TableCell align="right">Sleep</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[...profiles].sort((a, b) => ['nominal', 'info', 'watch', 'alert'].indexOf(assessments[b.id]?.status) - ['nominal', 'info', 'watch', 'alert'].indexOf(assessments[a.id]?.status)).map((p) => {
                    const a = assessments[p.id];
                    const stream = tel.engine?.streams.get(p.id);
                    const last = tel.engine?.latest(p.id);
                    const lost = stream?.history.at(-1)?.signal === 'lost';
                    const ex = stream?.sim.scenario === 'exercise' || Boolean(stream?.exercise);
                    const hrs = (stream?.history ?? []).map((h) => h.values.heartRate).filter((v): v is number => v !== undefined).slice(-36);
                    const sleep = [...records].reverse().find((r) => r.profile === p.id && num(r, 'sleep' as MetricKey) !== undefined);
                    const top = a?.findings.find((f) => f.severity !== 'info');
                    return (
                      <TableRow key={p.id} hover sx={{ cursor: 'pointer', '& td': { borderLeft: 0 } }} onClick={() => (window.location.hash = `/crew/${p.id}`)}>
                        <TableCell sx={{ pl: 2.5, borderLeft: `3px solid ${a?.status === 'alert' || a?.status === 'watch' ? sev(a.status) : 'transparent'} !important` }}>
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                            <CrewAvatar p={p} size={32} />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{p.name}</Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>{p.role}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 230 }}><SeverityChip severity={a?.status ?? 'nominal'} /><Typography variant="caption" component="div" noWrap color={top ? sev(top.severity) : 'text.secondary'} title={top?.detail} sx={{ mt: 0.5 }}>{top ? top.title : 'Within personal and reference ranges'}</Typography></TableCell>
                        <TableCell align="right">{lost ? <Typography component="span" variant="body2" color="warning.main">signal lost</Typography> : <><LiveValue k="heartRate" v={last?.values.heartRate} exertion={ex} />{ex && <Typography variant="caption" component="div" color="text.secondary">exercising</Typography>}</>}</TableCell>
                        <TableCell><Sparkline values={hrs} height={26} /></TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}><LiveValue k="systolic" v={last?.values.systolic} exertion={ex} /><Box component="span" sx={{ color: 'text.disabled' }}>/</Box><LiveValue k="diastolic" v={last?.values.diastolic} exertion={ex} /></TableCell>
                        <TableCell align="right"><LiveValue k="temperature" v={last?.values.temperature} /></TableCell>
                        <TableCell align="right" sx={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>{sleep ? `${num(sleep, 'sleep')} h` : '-'}</TableCell>
                        <TableCell sx={{ pr: 1.5 }}><ChevronRightRounded sx={{ color: 'text.disabled' }} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
            <Typography variant="caption" color="text.disabled" component="p" sx={{ px: 2.5, py: 1.25 }}>HR bpm, BP mmHg, temperature °C. Sleep from the last check-in. Telemetry is simulated and accelerated.</Typography>
          </Card>

          <Card>
            <CardHeader title="Action queue" subheader="Generated automatically from monitoring, schedules, exercise and supplies" />
            <Box>
              {brief.actions.length ? brief.actions.slice(0, showAll ? 50 : 8).map((x, i) => (
                <Box key={x.id}>
                  {i > 0 && <Divider />}
                  <Stack component="a" href={`#/${x.href}`} direction="row" spacing={2} sx={{ alignItems: 'center', px: 2.5, py: 1.4, color: 'inherit', textDecoration: 'none', '&:hover': { bgcolor: 'action.hover' } }}>
                    <Box sx={{ width: 4, alignSelf: 'stretch', borderRadius: 1, bgcolor: x.severity === 'info' ? 'divider' : sev(x.severity), flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{x.title}</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>{x.detail}</Typography>
                    </Box>
                    <ChevronRightRounded sx={{ color: 'text.disabled' }} />
                  </Stack>
                </Box>
              )) : <Typography color="text.secondary" sx={{ px: 2.5, pb: 2 }}>Nothing pending.</Typography>}
              {brief.actions.length > 8 && <><Divider /><Button fullWidth onClick={() => setShowAll(!showAll)} sx={{ borderRadius: 0, py: 1.25 }}>{showAll ? 'Show fewer' : `Show all ${brief.actions.length} actions`}</Button></>}
            </Box>
          </Card>
        </Stack>

        <Stack spacing={3}>
          <Card>
            <CardHeader title="Open alarms" subheader={tel.unacked ? `${tel.unacked} unacknowledged` : 'None open'} action={<Button size="small" href="#/alarms">View all</Button>} />
            <CardContent sx={{ pt: 0 }}>
              {openAlarms.length ? (
                <Stack spacing={1.5}>
                  {openAlarms.map((a) => (
                    <Box key={a.id}>
                      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: a.severity === 'info' ? 'text.primary' : sev(a.severity) }}>{a.title}</Typography>
                        <Button size="small" onClick={() => tel.ack(a.id)} sx={{ minWidth: 0, px: 1 }}>Ack</Button>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{profiles.find((p) => p.id === a.profile)?.name}, {ago(a.at)}</Typography>
                    </Box>
                  ))}
                </Stack>
              ) : <Typography variant="body2" color="text.secondary">Telemetry within expected ranges.</Typography>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Mission status" />
            <CardContent sx={{ pt: 0 }}>
              <Stack spacing={2}>
                <Box>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Progress</Typography><Typography variant="body2" sx={{ fontFamily: MONO }}>day {day} / {settings.missionDays}</Typography></Stack>
                  <LinearProgress variant="determinate" color="inherit" value={Math.min(100, (day / settings.missionDays) * 100)} sx={{ mt: 0.75, height: 4, borderRadius: 2, color: 'text.primary' }} />
                </Box>
                <Box>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Radiation dose to date (est.)</Typography><Typography variant="body2" sx={{ fontFamily: MONO }}>{dose.toFixed(0)} mSv</Typography></Stack>
                  <LinearProgress variant="determinate" color="inherit" value={Math.min(100, (dose / CAREER_LIMIT_mSv) * 100)} sx={{ mt: 0.75, height: 4, borderRadius: 2, color: 'text.primary' }} />
                  <Typography variant="caption" color="text.secondary">of the {CAREER_LIMIT_mSv} mSv career limit</Typography>
                </Box>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Medical kit</Typography>
                  <Link href="#/supplies" variant="body2" color={supplies.some((s) => s.proj.status === 'alert') ? 'error.main' : 'text.primary'}>{supplies.filter((s) => s.proj.status !== 'nominal').length} of {supplies.length} items at risk</Link>
                </Stack>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Exercise logged automatically</Typography>
                  <Typography variant="body2" sx={{ fontFamily: MONO }}>{exercise.filter((x) => x.source === 'wearable').length}</Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Crew roster" />
            <CardContent sx={{ pt: 0 }}><AddCrew /></CardContent>
          </Card>
        </Stack>
      </Box>
    </>
  );
}
