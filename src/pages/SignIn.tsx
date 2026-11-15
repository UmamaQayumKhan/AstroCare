import { useState } from 'react';
import { Box, Button, Card, CardContent, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import LoginRounded from '@mui/icons-material/LoginRounded';
import { useApp } from '../state';
import { delayLabel, missionDay, missionProfile } from '../lib/mission';
import { DISPLAY, MONO } from '../theme';

const ROLES = ['Crew medical officer', 'Flight surgeon (ground)', 'Crew member', 'Mission evaluator'];

export default function SignIn({ onEnter }: { onEnter: (who: { name: string; role: string }) => void }) {
  const { settings, profiles } = useApp();
  const [role, setRole] = useState(ROLES[0]);
  const [name, setName] = useState(profiles.find((p) => p.role.toLowerCase().includes('medical'))?.name ?? '');
  const m = missionProfile(settings.mission);
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: { md: '1.1fr 1fr' }, bgcolor: 'background.default' }}>
      <Box sx={{ p: { xs: 4, md: 8 }, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: { md: 1 }, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 30, height: 30, borderRadius: 1, bgcolor: 'text.primary', color: 'background.paper', display: 'grid', placeItems: 'center' }}><MonitorHeartOutlined sx={{ fontSize: 19 }} /></Box>
          <Typography sx={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22 }}>AstroCare</Typography>
        </Stack>
        <Box sx={{ my: 6, maxWidth: 520 }}>
          <Typography sx={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: { xs: 36, md: 48 }, lineHeight: 1.05 }}>Crew health monitoring for deep-space missions.</Typography>
          <Typography color="text.secondary" sx={{ mt: 2, fontSize: 17, lineHeight: 1.55 }}>Personal baselines, live telemetry and automatic alarms, ready for the flight surgeon before the ground link is.</Typography>
        </Box>
        <Stack direction="row" spacing={4} sx={{ fontFamily: MONO }} divider={<Divider orientation="vertical" flexItem />}>
          <Box><Typography variant="caption" color="text.secondary">Mission</Typography><Typography sx={{ fontFamily: MONO }}>{settings.callsign} {m.id}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Day</Typography><Typography sx={{ fontFamily: MONO }}>{missionDay(settings.missionStart)} / {settings.missionDays}</Typography></Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}><Typography variant="caption" color="text.secondary">Light time</Typography><Typography sx={{ fontFamily: MONO }}>{delayLabel(m).replace(' one-way', '')}</Typography></Box>
        </Stack>
      </Box>
      <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 3, md: 8 } }}>
        <Card sx={{ width: '100%', maxWidth: 420 }}>
          <CardContent sx={{ p: '32px !important' }}>
            <Typography variant="h5">Sign in to the mission console</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>Choose your role for this session.</Typography>
            <Stack component="form" spacing={2.25} onSubmit={(e) => { e.preventDefault(); onEnter({ name: name.trim() || 'Evaluator', role }); }}>
              <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" slotProps={{ htmlInput: { maxLength: 60 } }} />
              <Button type="submit" variant="contained" size="large" startIcon={<LoginRounded />}>Enter mission console</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2.5, lineHeight: 1.5 }}>Prototype demo access: no password or authentication. A flight system would add identity, role-based access and audit logging.</Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
