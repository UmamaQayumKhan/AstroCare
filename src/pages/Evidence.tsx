import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, Box, Button, Card, CardActions, CardContent, Chip, InputAdornment, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import OpenInNew from '@mui/icons-material/OpenInNew';
import science from '../../science.json';
import { PageHeader, Section, SeverityChip } from '../components/common';
import { ChartTip, useChartTheme } from '../components/charts';
import { loadModels, type ModelBundle } from '../lib/models';
import { MONO } from '../theme';

type Scores = { mae: number; rmse: number; r2: number };
type Model = { id: string; label: string; unit: string; selected_model: string; test: Scores; baseline_test: Scores; counts: Record<string, { groups: number; rows: number }> };
type Report = { models: Model[] };
type Source = { id: string; title: string; agency: string; url: string; summary: string; feature: string };

const USE: Record<string, { sev: 'nominal' | 'watch'; label: string; text: string }> = {
  HR: { sev: 'nominal', label: 'Used live', text: 'Live-monitor expected range' },
  NISysABP: { sev: 'nominal', label: 'Used live', text: 'Live-monitor expected range' },
  NIDiasABP: { sev: 'nominal', label: 'Used live', text: 'Live-monitor expected range' },
  Temp: { sev: 'nominal', label: 'Used live', text: 'Live-monitor expected range' },
  Glucose: { sev: 'watch', label: 'Not used', text: 'R² 0.14, too weak; sparse ICU sampling' },
  sleep: { sev: 'watch', label: 'Not used', text: 'R² ≈ 0, negative result kept' },
};
const CHALLENGE = ['hazards', 'risks', 'research', 'radiation', 'earth'];
const DATASETS = [
  { name: 'NASA OSDR OSD-575', tag: 'Spaceflight data', size: '4 crew × 7 timepoints × 16 analytes', use: 'Spaceflight biomarker explorer; rationale for personal baselines.', limit: 'Tiny sample, three-day mission; observations only.', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575' },
  { name: 'PhysioNet / CinC 2012', tag: 'Model training', size: '8,000 ICU stays', use: 'Next-observation forecasters for heart rate, blood pressure and temperature; conformal calibration.', limit: 'Critically ill Earth patients, not astronauts.', url: 'https://physionet.org/content/challenge-2012/1.0.0/' },
  { name: 'CDC NHANES 2017-2018', tag: 'Sleep experiment', size: '5,464 adults', use: 'Cross-sectional sleep-duration experiment (negative result).', limit: 'Self-report; unweighted; not a forecast.', url: 'https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?BeginYear=2017' },
];

export default function Evidence() {
  const theme = useTheme();
  const c = useChartTheme();
  const [report, setReport] = useState<Report | null>(null);
  const [bundle, setBundle] = useState<ModelBundle | null>(null);
  const [q, setQ] = useState('');
  const base = import.meta.env.BASE_URL;
  useEffect(() => {
    fetch(`${base}validation-report.json`).then((r) => r.json()).then(setReport).catch(() => setReport(null));
    loadModels().then(setBundle);
  }, [base]);

  const improvement = (report?.models ?? []).map((m) => ({
    id: m.id,
    label: m.label.replace(' (non-invasive)', '').replace('Usual weekday sleep', 'Sleep').replace('Serum glucose', 'Glucose'),
    v: (1 - m.test.mae / m.baseline_test.mae) * 100,
    used: USE[m.id]?.label === 'Used live',
  }));
  const sources = (science.sources as Source[]).filter((s) => (s.title + s.summary + s.feature + s.agency).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
       
        title="Models, data and sources"
        subtitle="Real public datasets, a reproducible train / validation / held-out-test pipeline, browser-exported models with calibrated uncertainty, and the negative results we kept."
        actions={[['validation-report.json', 'Results'], ['research-methods.md', 'Methods'], ['research-benchmark.zip', 'Code & models']].map(([f, l]) => <Button key={f} variant="outlined" size="small" startIcon={<DownloadOutlined />} href={`${base}${f}`} download>{l}</Button>)}
      />
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 1.25fr' } }}>
        <Section title="Error reduction vs naive baseline" subheader="How much lower each model's mean absolute error is than repeating the last reading (sleep: predicting the median), on held-out test data.">
          <Box sx={{ height: 260 }} role="img" aria-label="Percentage error reduction per model; values also in the table">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={improvement} layout="vertical" margin={{ top: 0, right: 52, left: 8, bottom: 0 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={c.grid} />
                <XAxis type="number" domain={[0, (max: number) => Math.ceil(max / 5) * 5]} tickFormatter={(v) => `${Math.round(v)}%`} {...c.axis} />
                <YAxis type="category" dataKey="label" width={120} tick={{ fill: theme.palette.text.primary, fontSize: 12.5 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }} content={(tp) => <ChartTip {...(tp as object)} render={(d) => <Typography variant="body2">{d.label as string}: <b>{(d.v as number).toFixed(1)}%</b> lower error</Typography>} />} />
                <Bar dataKey="v" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  {improvement.map((d) => <Cell key={d.id} fill={d.used ? theme.palette.primary.main : alpha(theme.palette.text.secondary, 0.45)} />)}
                  <LabelList dataKey="v" position="right" formatter={(v) => `${Number(v).toFixed(1)}%`} style={{ fill: theme.palette.text.secondary, fontSize: 11.5, fontFamily: MONO }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: 'primary.main' }} /><Typography variant="caption" color="text.secondary">Used in the app</Typography></Stack>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: alpha(theme.palette.text.secondary, 0.45) }} /><Typography variant="caption" color="text.secondary">Not used (too weak)</Typography></Stack>
          </Stack>
        </Section>
        <Section title="Recorded results" subheader="Held-out test sets: PhysioNet set B (4,000 stays) and NHANES test split" contentSx={{ px: 0, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell sx={{ pl: 2.5 }}>Signal</TableCell><TableCell align="right">Model MAE</TableCell><TableCell align="right">Baseline</TableCell><TableCell align="right">R²</TableCell><TableCell align="right">90% band</TableCell><TableCell sx={{ pr: 2.5 }}>In app</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {(report?.models ?? []).map((m) => {
                const b = bundle?.models[m.id];
                const u = USE[m.id];
                return (
                  <TableRow key={m.id}>
                    <TableCell sx={{ pl: 2.5 }}>{m.label.replace(' (non-invasive)', '')}<Typography variant="caption" color="text.secondary" component="div">{m.selected_model.replace('_', ' ')} · {m.counts.test.groups.toLocaleString()} test {m.id === 'sleep' ? 'people' : 'stays'}</Typography></TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{m.test.mae.toFixed(2)} <Typography component="span" variant="caption" color="text.secondary">{m.unit}</Typography></TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{m.baseline_test.mae.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{m.test.r2.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: MONO }}>{b ? <>±{b.conformal.q90.toFixed(m.id === 'Temp' ? 2 : 1)}<Typography variant="caption" color="text.secondary" component="div">{(b.conformal.testCoverage.q90 * 100).toFixed(1)}% cov.</Typography></> : '-'}</TableCell>
                    <TableCell sx={{ pr: 2.5 }}><SeverityChip severity={u.sev} label={u.label} /><Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5, maxWidth: 190 }}>{u.text}</Typography></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 2.5, mt: 1.5 }}>MAE = mean absolute error in the signal's unit. 90% band = split-conformal radius calibrated on PhysioNet validation stays; "cov." = share of held-out test readings inside it. Model selection used validation data only.</Typography>
        </Section>
      </Box>
      <Alert severity="info" sx={{ mt: 3 }}>
        <b>What these numbers mean.</b> The models forecast the next recorded value of a vital sign; they do not diagnose. Gains over "repeat the last reading" are modest because vital signs are strongly autocorrelated, the value in AstroCare is the calibrated expected range, which turns a raw stream into "this change is unexpected". All training data come from Earth ICU patients; crew or analog-mission recalibration is required before operational use.
      </Alert>

      <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>Datasets</Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: 'repeat(3, 1fr)' } }}>
        {DATASETS.map((d) => (
          <Card key={d.name} sx={{ display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1 }}>
              <Chip size="small" label={d.tag} color="primary" variant="outlined" />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1.5 }}>{d.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: MONO }}>{d.size}</Typography>
              <Typography variant="body2" sx={{ mt: 1.5 }}><b>Use:</b> {d.use}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}><b>Limit:</b> {d.limit}</Typography>
            </CardContent>
            <CardActions sx={{ px: 2 }}><Button size="small" href={d.url} target="_blank" rel="noreferrer" endIcon={<OpenInNew sx={{ fontSize: 14 }} />}>Source</Button></CardActions>
          </Card>
        ))}
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ mt: 4, mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}>
        <Typography variant="h6">Evidence library <Typography component="span" color="text.secondary">· {science.sources.length} sources</Typography></Typography>
        <TextField size="small" placeholder="Search sources" value={q} onChange={(e) => setQ(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} sx={{ width: { sm: 300 } }} />
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: '1fr 1fr', xl: 'repeat(3, 1fr)' } }}>
        {sources.map((s) => (
          <Card key={s.id} sx={{ display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary" noWrap>{s.agency}</Typography>
                {CHALLENGE.includes(s.id) && <Chip size="small" color="secondary" label="Challenge resource" />}
              </Stack>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>{s.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{s.summary}</Typography>
              <Typography variant="body2" sx={{ mt: 1.5, p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}><b>Used for:</b> {s.feature}</Typography>
            </CardContent>
            <CardActions sx={{ px: 2 }}><Link href={s.url} target="_blank" rel="noreferrer" variant="body2">Read source</Link></CardActions>
          </Card>
        ))}
      </Box>

      <Section title="Path to flight" subheader="What would make this operational" sx={{ mt: 4 }}>
        <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1, gridTemplateColumns: { md: '1fr 1fr' }, columnGap: 4 }}>
          {[
            'Define intended use and alert thresholds with NASA flight medicine; map every alert to an approved protocol.',
            'Recalibrate personal-baseline parameters and conformal bands on astronaut or analog-mission (HERA, Antarctic) data.',
            'Integrate validated wearable sensors with signal-quality checks and device calibration.',
            'Add identity, role-based access, encryption, audit trails and multi-device conflict handling.',
            'Implement delay-tolerant communication with ground and acknowledgement tracking.',
            'Run human-factors and emergency-simulation studies with representative crews.',
          ].map((s) => <Typography component="li" variant="body2" color="text.secondary" key={s}>{s}</Typography>)}
        </Box>
      </Section>
    </>
  );
}
