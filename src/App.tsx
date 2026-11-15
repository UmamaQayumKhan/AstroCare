import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AppBar, Badge, Box, Button, CircularProgress, CssBaseline, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  ListSubheader, Snackbar, Stack, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import Alert from '@mui/material/Alert';
import MenuIcon from '@mui/icons-material/Menu';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import FitnessCenterOutlined from '@mui/icons-material/FitnessCenterOutlined';
import MedicalServicesOutlined from '@mui/icons-material/MedicalServicesOutlined';
import LocalHospitalOutlined from '@mui/icons-material/LocalHospitalOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import SatelliteAltOutlined from '@mui/icons-material/SatelliteAltOutlined';
import { useApp } from './state';
import { useLink, useTelemetry } from './telemetry';
import { makeTheme, DISPLAY, MONO } from './theme';
import { delayLabel, missionDay, missionProfile } from './lib/mission';
import { fmtCountdown } from './lib/comms';
import Nova from './components/Nova';
import SignIn from './pages/SignIn';

const MissionControl = lazy(() => import('./pages/MissionControl'));
const Alarms = lazy(() => import('./pages/Alarms'));
const Astronaut = lazy(() => import('./pages/Astronaut'));
const CheckIn = lazy(() => import('./pages/CheckIn'));
const LiveMonitor = lazy(() => import('./pages/LiveMonitor'));
const Cognition = lazy(() => import('./pages/Cognition'));
const Exercise = lazy(() => import('./pages/Exercise'));
const Supplies = lazy(() => import('./pages/Supplies'));
const Emergency = lazy(() => import('./pages/Emergency'));
const Report = lazy(() => import('./pages/Report'));
const Biomarkers = lazy(() => import('./pages/Biomarkers'));
const Environment = lazy(() => import('./pages/Environment'));
const Evidence = lazy(() => import('./pages/Evidence'));

const DRAWER = 248;

function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

type NavItem = { path: string; label: string; icon: ReactNode };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Operations', items: [
    { path: '', label: 'Mission control', icon: <GridViewOutlined /> },
    { path: 'alarms', label: 'Alarms', icon: <NotificationsNoneOutlined /> },
    { path: 'live', label: 'Telemetry', icon: <MonitorHeartOutlined /> },
    { path: 'emergency', label: 'Emergency', icon: <LocalHospitalOutlined /> },
  ] },
  { group: 'Crew health', items: [
    { path: 'check-in', label: 'Daily check-in', icon: <FactCheckOutlined /> },
    { path: 'cognition', label: 'Reaction test', icon: <PsychologyOutlined /> },
    { path: 'exercise', label: 'Exercise', icon: <FitnessCenterOutlined /> },
    { path: 'report', label: 'Medical report', icon: <DescriptionOutlined /> },
  ] },
  { group: 'Logistics', items: [{ path: 'supplies', label: 'Medical supplies', icon: <MedicalServicesOutlined /> }] },
  { group: 'Science', items: [
    { path: 'biomarkers', label: 'Inspiration4 data', icon: <ScienceOutlined /> },
    { path: 'environment', label: 'Space environment', icon: <PublicOutlined /> },
    { path: 'evidence', label: 'Models and sources', icon: <InsightsOutlined /> },
  ] },
];

function Brand() {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', px: 2.5, height: 60 }} component="a" href="#/" style={{ textDecoration: 'none', color: 'inherit' }}>
      <Box sx={{ width: 26, height: 26, borderRadius: 1, bgcolor: 'text.primary', color: 'background.paper', display: 'grid', placeItems: 'center' }}>
        <MonitorHeartOutlined sx={{ fontSize: 17 }} />
      </Box>
      <Typography sx={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20, letterSpacing: '0.02em' }}>AstroCare</Typography>
    </Stack>
  );
}

function NavList({ current, onNavigate }: { current: string; onNavigate: () => void }) {
  const { assessments } = useApp();
  const { unacked } = useTelemetry();
  const alertCrew = Object.values(assessments).filter((a) => a.status === 'alert').length;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Brand />
      <Divider />
      <Box component="nav" aria-label="Main" sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {NAV.map((g) => (
          <List key={g.group} dense subheader={<ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '30px', fontSize: 12, fontWeight: 500, color: 'text.disabled' }}>{g.group}</ListSubheader>}>
            {g.items.map((it) => {
              const selected = current === it.path || (it.path === '' && current === 'crew');
              const badge = it.path === 'alarms' ? unacked : it.path === '' ? alertCrew : 0;
              return (
                <ListItemButton key={it.path} selected={selected} component="a" href={`#/${it.path}`} onClick={onNavigate} aria-current={selected ? 'page' : undefined}>
                  <ListItemIcon sx={{ color: selected ? 'text.primary' : undefined, '& svg': { fontSize: 20 } }}>{it.icon}</ListItemIcon>
                  <ListItemText primary={it.label} slotProps={{ primary: { sx: { fontSize: 14, fontWeight: selected ? 600 : 400 } } }} />
                  {badge > 0 && <Badge color={it.path === 'alarms' ? 'warning' : 'error'} badgeContent={badge} max={99} sx={{ mr: 1.5 }} />}
                </ListItemButton>
              );
            })}
          </List>
        ))}
      </Box>
      <Divider />
      <Typography variant="caption" color="text.disabled" component="p" sx={{ p: 2, lineHeight: 1.5 }}>
        Research prototype. Not a medical device and not endorsed by NASA. Supports the crew medical officer and flight surgeon; never replaces them.
      </Typography>
    </Box>
  );
}

function MissionClock({ start }: { start: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, now - Date.parse(start));
  const d = Math.floor(ms / 86_400_000);
  return <Box component="span" sx={{ fontFamily: MONO }}>MET {String(d).padStart(3, '0')}:{fmtCountdown(ms % 86_400_000)}</Box>;
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { settings, mode, toggleMode } = useApp();
  const { unacked } = useTelemetry();
  const link = useLink();
  const m = missionProfile(settings.mission);
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }} className="no-print">
      <Toolbar sx={{ gap: 2, minHeight: { xs: 56, sm: 60 } }}>
        <IconButton edge="start" onClick={onMenu} sx={{ display: { lg: 'none' } }} aria-label="Open navigation"><MenuIcon /></IconButton>
        <Stack direction="row" spacing={2.5} sx={{ alignItems: 'center', minWidth: 0, fontSize: 13.5 }} divider={<Divider orientation="vertical" flexItem />}>
          <Typography sx={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap' }}>{settings.callsign} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>{m.id}</Box></Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>Day {missionDay(settings.missionStart)} of {settings.missionDays}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', display: { xs: 'none', md: 'block' } }}><MissionClock start={settings.missionStart} /></Typography>
          <Tooltip title={`One-way light time ${delayLabel(m)}. Packets queue while the link is down and transmit automatically.`}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', display: { xs: 'none', md: 'flex' }, color: link.open ? 'text.primary' : 'text.secondary' }}>
              <SatelliteAltOutlined sx={{ fontSize: 17 }} />
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{link.open ? 'Ground link up' : <>Next contact <Box component="span" sx={{ fontFamily: MONO }}>{fmtCountdown(link.nextStart - Date.now())}</Box></>}</Typography>
            </Stack>
          </Tooltip>
        </Stack>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Alarms">
          <IconButton href="#/alarms" aria-label={`${unacked} unacknowledged alarms`}>
            <Badge color="warning" badgeContent={unacked} max={99} sx={unacked ? { '& .MuiBadge-badge': { animation: 'blink 1.2s steps(2) infinite' } } : undefined}><NotificationsNoneOutlined /></Badge>
          </IconButton>
        </Tooltip>
        <Tooltip title={mode === 'light' ? 'Dark mode' : 'Light mode'}>
          <IconButton onClick={toggleMode} aria-label="Toggle colour mode">{mode === 'light' ? <DarkModeOutlined /> : <LightModeOutlined />}</IconButton>
        </Tooltip>
        <Button variant="contained" color="error" href="#/emergency" startIcon={<LocalHospitalOutlined />} sx={{ whiteSpace: 'nowrap' }}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Emergency</Box>
        </Button>
      </Toolbar>
    </AppBar>
  );
}

function Page({ parts }: { parts: string[] }) {
  const [head, arg] = parts;
  switch (head) {
    case 'alarms': return <Alarms />;
    case 'crew': return <Astronaut id={arg} />;
    case 'check-in': return <CheckIn profileId={arg} />;
    case 'live': return <LiveMonitor profileId={arg} />;
    case 'cognition': return <Cognition profileId={arg} />;
    case 'exercise': return <Exercise profileId={arg} />;
    case 'supplies': return <Supplies />;
    case 'emergency': return <Emergency profileId={arg} />;
    case 'report': return <Report profileId={arg} />;
    case 'biomarkers': return <Biomarkers />;
    case 'environment': return <Environment />;
    case 'evidence': return <Evidence />;
    default: return <MissionControl />;
  }
}

export default function App() {
  const { ready, error, notice, mode } = useApp();
  const theme = useMemo(() => makeTheme(mode), [mode]);
  const parts = useRoute();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<string | null>(() => { try { return sessionStorage.getItem('astrocare-session'); } catch { return null; } });
  const desktop = useMediaQuery(theme.breakpoints.up('lg'));
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!session && ready ? (
        <SignIn onEnter={(who) => { const v = JSON.stringify(who); try { sessionStorage.setItem('astrocare-session', v); } catch { /* blocked */ } setSession(v); }} />
      ) : (
      <>
      <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
        <Box component="aside" sx={{ width: { lg: DRAWER }, flexShrink: 0 }} className="no-print">
          <Drawer
            variant={desktop ? 'permanent' : 'temporary'}
            open={desktop || open}
            onClose={() => setOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider' } }}
          >
            <NavList current={parts[0] ?? ''} onNavigate={() => setOpen(false)} />
          </Drawer>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TopBar onMenu={() => setOpen(true)} />
          <Box component="main" id="main" sx={{ px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 3, sm: 3.5 }, maxWidth: 1440, mx: 'auto' }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {!ready ? (
              <Box sx={{ py: 12, textAlign: 'center' }}><CircularProgress color="inherit" /></Box>
            ) : (
              <Suspense fallback={<Box sx={{ py: 12, textAlign: 'center' }}><CircularProgress color="inherit" /></Box>}>
                <Page key={parts.join('/')} parts={parts} />
              </Suspense>
            )}
          </Box>
        </Box>
      </Box>
      <Nova />
      </>
      )}
      <Snackbar open={Boolean(notice)} message={notice} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </ThemeProvider>
  );
}
