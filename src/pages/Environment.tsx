import { useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, LinearProgress, Link, MenuItem, Slider, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import WbSunnyOutlined from '@mui/icons-material/WbSunnyOutlined';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import AirlineSeatFlatOutlined from '@mui/icons-material/AirlineSeatFlatOutlined';
import DeviceThermostatOutlined from '@mui/icons-material/DeviceThermostatOutlined';
import science from '../../science.json';
import { useApp } from '../state';
import { PageHeader, Section, SourceLinks } from '../components/common';
import { CAREER_LIMIT_mSv, CAREER_LIMIT_REF, MISSIONS, cumulativeDose, delayLabel, missionProfile, type MissionId } from '../lib/mission';
import { MONO } from '../theme';

type Hazard = { id: string; title: string; summary: string; monitoring: string; sourceIds: string[] };
const ICONS: Record<string, React.ReactNode> = { radiation: <WbSunnyOutlined />, isolation: <PsychologyOutlined />, distance: <PublicOutlined />, gravity: <AirlineSeatFlatOutlined />, environment: <DeviceThermostatOutlined /> };
const IN_APP: Record<string, { text: string; links: [string, string][] }> = {
  radiation: { text: 'Mission dose planner below. Vital signs cannot measure radiation, so exposure is kept as a separate, instrument-based channel.', links: [] },
  isolation: { text: 'Sleep and mood trends plus reaction-time testing catch gradual erosion before single values look abnormal.', links: [['Cognitive test', 'cognition'], ['Check-in', 'check-in']] },
  distance: { text: 'Offline-first records, supply run-out projection, delay-aware SBAR handover and a printable flight-surgeon report.', links: [['Supplies', 'supplies'], ['Emergency', 'emergency']] },
  gravity: { text: 'Exercise-countermeasure compliance, blood-pressure baselines, orthostatic scenario, and post-landing biomarkers.', links: [['Exercise', 'exercise'], ['Biomarkers', 'biomarkers']] },
  environment: { text: 'Temperature and symptom tracking with fever detection; context fields record cabin and device conditions.', links: [['Live monitor', 'live']] },
};
const SOURCE_FOR: Record<MissionId, string> = { 'Space station': 'radiation', 'Lunar base': 'radMoon', 'Mars transit': 'radCruise', 'Mars surface': 'radMars' };

export default function Environment() {
  const { settings, updateSettings } = useApp();
  const [mission, setMission] = useState<MissionId>(settings.mission);
  const [days, setDays] = useState(missionProfile(settings.mission).plannedDays);
  const m = missionProfile(mission);
  const dose = cumulativeDose(m, days);
  const pct = (dose / CAREER_LIMIT_mSv) * 100;
  const hazards = science.hazards as Hazard[];

  return (
    <>
      <PageHeader title="Space environment" subtitle="NASA groups the risks of human spaceflight into five interacting hazards. Each one shapes what AstroCare monitors, and what it deliberately does not claim to measure." />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr', xl: 'repeat(5, 1fr)' } }}>
        {hazards.map((h, i) => (
          <Card key={h.id} sx={{ display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', color: 'primary.main' }}>
                {ICONS[h.id]}
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: MONO }}>{String(i + 1).padStart(2, '0')}</Typography>
              </Stack>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1.5 }}>{h.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{h.summary}</Typography>
              <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover', flex: 1 }}>
                <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>In AstroCare</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{IN_APP[h.id]?.text ?? h.monitoring}</Typography>
                <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>{IN_APP[h.id]?.links.map(([l, to]) => <Link key={to} href={`#/${to}`} variant="body2">{l}</Link>)}</Stack>
              </Box>
              <SourceLinks ids={h.sourceIds} sx={{ mt: 2 }} />
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1.3fr 1fr' }, mt: 3 }}>
        <Section title="Radiation mission planner" subheader="Mission-average dose-equivalent rates measured by real instruments, compared with NASA's 600 mSv career limit. Planning context, not personal dosimetry.">
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { sm: '220px 1fr' }, alignItems: 'center' }}>
            <TextField select size="small" label="Environment" value={mission} onChange={(e) => { const v = e.target.value as MissionId; setMission(v); setDays(missionProfile(v).plannedDays); }}>
              {MISSIONS.map((x) => <MenuItem key={x.id} value={x.id}>{x.id}</MenuItem>)}
            </TextField>
            <Box>
              <Typography variant="body2" color="text.secondary">Duration: <b>{days} days</b></Typography>
              <Slider value={days} min={7} max={1000} onChange={(_, v) => setDays(v as number)} aria-label="Mission duration in days" />
            </Box>
          </Box>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-end', mt: 2 }}>
            <Box>
              <Typography sx={{ fontFamily: MONO, fontSize: 40, lineHeight: 1 }}>{dose.toFixed(0)}<Typography component="span" color="text.secondary" sx={{ fontSize: 15, ml: 0.75 }}>mSv</Typography></Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{m.doseRate_mSvPerDay} mSv/day × {days} days{m.approximate ? ' (approximate rate)' : ''}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontFamily: MONO, fontSize: 24, color: pct >= 100 ? 'error.main' : pct >= 50 ? 'warning.main' : 'text.primary' }}>{pct.toFixed(0)}%</Typography>
              <Typography variant="caption" color="text.secondary">of career limit</Typography>
            </Box>
          </Stack>
          <LinearProgress variant="determinate" value={Math.min(100, pct)} color={pct >= 100 ? 'error' : pct >= 50 ? 'warning' : 'primary'} sx={{ mt: 2, height: 10, borderRadius: 5 }} aria-label="Cumulative dose versus career limit" />
          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}><Typography variant="caption" color="text.secondary">0</Typography><Typography variant="caption" color="text.secondary">{CAREER_LIMIT_mSv} mSv</Typography></Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{m.doseNote}</Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
            <SourceLinks ids={[SOURCE_FOR[mission]]} />
            <Chip size="small" variant="outlined" component="a" href={CAREER_LIMIT_REF.url} target="_blank" rel="noreferrer" clickable label={CAREER_LIMIT_REF.label} sx={{ color: 'text.secondary' }} />
          </Stack>
          <Alert severity="info" sx={{ mt: 2 }}>Solar particle events can add large doses within hours, and shielding and the solar cycle shift these averages. Heart rate, blood pressure and temperature do not measure radiation, exposure needs calibrated instruments such as the CSA's Canadian Active Neutron Spectrometer.</Alert>
        </Section>
        <Stack spacing={3}>
          <Section title="Compare environments" contentSx={{ px: 0 }}>
            <Table size="small">
              <TableHead><TableRow><TableCell sx={{ pl: 2.5 }}>Environment</TableCell><TableCell align="right">mSv / day</TableCell><TableCell align="right" sx={{ pr: 2.5 }}>Days to limit</TableCell></TableRow></TableHead>
              <TableBody>
                {MISSIONS.map((x) => (
                  <TableRow key={x.id} hover selected={x.id === mission} onClick={() => { setMission(x.id); setDays(x.plannedDays); }} sx={{ cursor: 'pointer' }}>
                    <TableCell sx={{ pl: 2.5 }}>{x.id}<Typography variant="caption" color="text.secondary" component="div">{delayLabel(x)}</Typography></TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{x.doseRate_mSvPerDay}{x.approximate ? '~' : ''}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO, pr: 2.5 }}>{Math.round(CAREER_LIMIT_mSv / x.doseRate_mSvPerDay)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          <Section title="Current mission" subheader="Sets the top bar, communication delay, mission length and new records">
            <ToggleButtonGroup size="small" exclusive value={settings.mission} onChange={(_, v) => v && void updateSettings({ mission: v })} sx={{ flexWrap: 'wrap' }}>
              {MISSIONS.map((x) => <ToggleButton key={x.id} value={x.id}>{x.id}</ToggleButton>)}
            </ToggleButtonGroup>
            <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center' }}>
              <TextField size="small" type="number" label="Mission length (days)" value={settings.missionDays} onChange={(e) => void updateSettings({ missionDays: Math.max(1, Number(e.target.value) || 1) })} sx={{ width: 190 }} />
              <TextField size="small" label="Callsign" value={settings.callsign} onChange={(e) => void updateSettings({ callsign: e.target.value.slice(0, 16) })} sx={{ width: 150 }} />
            </Stack>
          </Section>
          <Section title="Space to Earth">
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>Offline-first monitoring with personal baselines, supply planning and clear handovers maps directly to remote communities, research stations and expeditions far from a doctor.</Typography>
            <SourceLinks ids={['earth', 'radiation']} sx={{ mt: 1.5 }} />
          </Section>
        </Stack>
      </Box>
    </>
  );
}
