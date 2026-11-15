import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Divider, InputAdornment, Link, List, ListItem, ListItemIcon, ListItemText, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import science from '../../science.json';
import { useApp } from '../state';
import { useTelemetry } from '../telemetry';
import { LIVE_KEYS } from '../lib/telemetry';
import { EmptyState, PageHeader, Section, SeverityChip, SourceLinks } from '../components/common';
import { VITALS, assess, personalBaseline, referenceSeverity, symptomSeverity, worst, type MetricKey, type Severity } from '../lib/monitoring';
import { validate } from '../domain.mjs';
import type { RecordEntry } from '../storage';
import { MONO } from '../theme';

const GUIDE_FOR: Record<MetricKey, string> = { heartRate: 'heartRate', systolic: 'bloodPressure', diastolic: 'bloodPressure', temperature: 'temperature', sleep: 'sleep', mood: 'mood', glucose: 'glucose' };
const MOODS = ['Very low', 'Low', 'Neutral', 'Good', 'Very good'];
type Measurement = { id: string; title: string; why: string; instructions: string[]; sourceIds: string[]; scope: string };

export default function CheckIn({ profileId }: { profileId?: string }) {
  const { profiles, records, settings, saveReading, notify } = useApp();
  const [profile, setProfile] = useState(profileId && profiles.some((p) => p.id === profileId) ? profileId : profiles[0]?.id ?? '');
  const [form, setForm] = useState<Record<string, string>>({});
  const [guide, setGuide] = useState<MetricKey>('heartRate');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const tel = useTelemetry();
  const prefill = useRef<Record<string, string>>({});
  const mine = useMemo(() => records.filter((r) => r.profile === profile).sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [records, profile]);

  if (!profiles.length) return <EmptyState icon={<FactCheckOutlined />} title="No crew yet" action={<Button href="#/">Go to mission control</Button>}>Add a crew member or load the demo crew first.</EmptyState>;

  const measurement = (science.measurements as Measurement[]).find((m) => m.id === GUIDE_FOR[guide])!;
  const symptomSev = symptomSeverity(form.symptoms);

  function feedback(k: MetricKey): { sev: Severity; text: string } | null {
    const raw = form[k];
    if (!raw?.trim() || !Number.isFinite(Number(raw))) return null;
    const v = Number(raw);
    const def = VITALS[k];
    const ref = referenceSeverity(k, v);
    const base = personalBaseline(mine, k);
    let sev: Severity = ref.severity;
    const parts: string[] = [];
    if (ref.text) parts.push(`Reference: ${ref.text}`);
    if (base) {
      const z = (v - base.median) / base.spread;
      if (Math.abs(z) >= 2.5 && k !== 'mood') sev = worst(sev, Math.abs(z) >= 4 ? 'alert' : 'watch');
      parts.push(Math.abs(z) < 1 ? `close to personal median ${base.median.toFixed(def.decimals)}` : `${Math.abs(z).toFixed(1)} SD ${z > 0 ? 'above' : 'below'} personal median ${base.median.toFixed(def.decimals)}`);
    } else parts.push('personal baseline builds after 5 check-ins');
    return { sev, text: parts.join(' · ') };
  }

  // pre-fill vitals from the wearable (30-min average) and the overnight sleep estimate
  useEffect(() => {
    if (!tel.engine || !profile) return;
    const avg = tel.engine.average(profile, 6);
    const next: Record<string, string> = {};
    for (const k of LIVE_KEYS) if (avg[k] !== undefined) next[k] = k === 'temperature' ? avg[k]!.toFixed(1) : String(Math.round(avg[k]!));
    const sleep = tel.engine.streams.get(profile)?.sleepEstimate;
    if (sleep !== undefined) next.sleep = sleep.toFixed(1);
    prefill.current = next;
    setForm(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, Boolean(tel.engine?.streams.get(profile))]);

  const fromWearable = (k: string) => prefill.current[k] !== undefined && form[k] === prefill.current[k];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r: RecordEntry = { id: crypto.randomUUID(), profile, timestamp: new Date().toISOString(), source: Object.keys(prefill.current).every(fromWearable) ? 'sensor-sim' : 'manual', sync: 'pending', mission: settings.mission, symptoms: form.symptoms?.trim() || '', glucoseContext: form.glucoseContext?.trim() || '' };
    for (const k of Object.keys(VITALS) as MetricKey[]) if (form[k]?.trim()) r[k] = Number(form[k]);
    const errs = validate(r) as string[];
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      await saveReading(r);
      const fresh = assess(profile, [...records, r]).findings.filter((f) => f.at === r.timestamp).length;
      notify(fresh ? `Check-in saved · ${fresh} finding${fresh > 1 ? 's' : ''} to review.` : 'Check-in saved · nothing flagged.');
      window.location.hash = `/crew/${profile}`;
    } catch {
      setErrors(['Could not save on this device. Keep this screen open and retry.']);
    } finally {
      setSaving(false);
    }
  }

  const field = (k: MetricKey) => {
    const def = VITALS[k];
    const fb = feedback(k);
    return (
      <Box key={k}>
        <TextField
          fullWidth
          size="small"
          type="number"
          label={def.label}
          value={form[k] ?? ''}
          placeholder="Not measured"
          onFocus={() => setGuide(k)}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">{fromWearable(k) ? <Box component="span" sx={{ fontSize: 12 }}>{def.unit}, wearable</Box> : def.unit}</InputAdornment>, sx: { fontFamily: MONO } }, htmlInput: { step: 'any', inputMode: 'decimal' } }}
        />
        <Box sx={{ minHeight: 26, mt: 0.75 }} aria-live="polite">
          {fb && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {fb.sev === 'nominal' ? <CheckRounded color="success" sx={{ fontSize: 18 }} /> : <SeverityChip severity={fb.sev} />}
              <Typography variant="caption" color="text.secondary">{fb.text}</Typography>
            </Stack>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <>
      <PageHeader title="Daily check-in" subtitle="Vitals and sleep arrive pre-filled from the wearable; confirm them, add mood and anything you noticed. Every value is checked live against the reference range and this crew member's own baseline." />
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 380px' }, alignItems: 'start' }}>
        <Section>
          <Box component="form" onSubmit={submit}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, mb: 3 }}>
              <TextField select size="small" label="Crew member" value={profile} onChange={(e) => { setProfile(e.target.value); setForm({}); }} sx={{ minWidth: 280 }}>
                {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}, {p.role}</MenuItem>)}
              </TextField>
              <Typography variant="body2" color="text.secondary">{settings.mission} · time stamped on save</Typography>
            </Stack>

            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Cardiovascular and temperature</Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr' } }}>{(['heartRate', 'temperature', 'systolic', 'diastolic'] as MetricKey[]).map(field)}</Box>
            <Divider sx={{ my: 2.5 }} />
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Recovery and wellbeing</Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr' } }}>
              {field('sleep')}
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>Mood (self-report)</Typography>
                <ToggleButtonGroup exclusive fullWidth size="small" value={form.mood ?? ''} onChange={(_, v) => setForm({ ...form, mood: v ?? '' })} onFocus={() => setGuide('mood')} aria-label="Mood">
                  {MOODS.map((label, i) => (
                    <ToggleButton key={label} value={String(i + 1)} sx={{ flexDirection: 'column', py: 0.75, lineHeight: 1.2 }}>
                      <Box component="span" sx={{ fontFamily: MONO, fontSize: 15 }}>{i + 1}</Box>
                      <Box component="span" sx={{ fontSize: 10.5 }}>{label}</Box>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            </Box>
            <Divider sx={{ my: 2.5 }} />
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Metabolic</Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr' } }}>
              {field('glucose')}
              <TextField size="small" label="Glucose context" required={Boolean(form.glucose)} value={form.glucoseContext ?? ''} onFocus={() => setGuide('glucose')} onChange={(e) => setForm({ ...form, glucoseContext: e.target.value })} placeholder="Fasting / after meal, device" slotProps={{ htmlInput: { maxLength: 200 } }} />
            </Box>
            <Divider sx={{ my: 2.5 }} />
            <TextField fullWidth multiline minRows={3} label="Symptoms and measurement context" value={form.symptoms ?? ''} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} placeholder="How do you feel? Recent exercise, device, measurement site…" slotProps={{ htmlInput: { maxLength: 2000 } }} />
            {symptomSev === 'alert' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                This sounds potentially urgent. Follow the mission emergency procedure and contact the crew medical officer now. <Link href={`#/emergency/${profile}`}>Open emergency handover</Link>
              </Alert>
            )}
            {errors.length > 0 && <Alert severity="error" sx={{ mt: 2 }}>{errors.join(' ')}</Alert>}
            <Stack direction="row" spacing={2} sx={{ mt: 3, alignItems: 'center' }}>
              <Button type="submit" variant="contained" size="large" startIcon={<CheckRounded />} disabled={saving}>{saving ? 'Saving…' : 'Save check-in'}</Button>
              <Typography variant="caption" color="text.secondary">Saved on this device first; syncs when the local API is reachable.</Typography>
            </Stack>
          </Box>
        </Section>

        <Section title={measurement.title} subheader="Measurement guide" sx={{ position: { lg: 'sticky' }, top: { lg: 84 } }}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{measurement.why}</Typography>
          <List dense>
            {measurement.instructions.map((s, i) => (
              <ListItem key={s} disableGutters sx={{ alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 30, mt: 0.25 }}><Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'primary.main' }}>{String(i + 1).padStart(2, '0')}</Typography></ListItemIcon>
                <ListItemText primary={s} slotProps={{ primary: { variant: 'body2' } }} />
              </ListItem>
            ))}
          </List>
          <Alert severity="info" icon={false} sx={{ mb: 1.5 }}>{measurement.scope}</Alert>
          <Typography variant="caption" color="text.secondary" component="p">{VITALS[guide].refText}</Typography>
          <SourceLinks ids={[...measurement.sourceIds, ...VITALS[guide].refSourceIds]} sx={{ mt: 1.5 }} />
        </Section>
      </Box>
    </>
  );
}
