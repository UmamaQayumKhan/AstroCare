import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, Box, Button, Card, CardContent, Chip, List, ListItemButton, ListItemText, Stack, Table, TableBody, TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import { PageHeader, Section, SourceLinks } from '../components/common';
import { ChartTip, useChartTheme } from '../components/charts';
import { changeMatrix, outOfRangeCount, parseI4, preflightMean, type I4Data } from '../lib/i4';
import { MONO } from '../theme';

const CREW_LABEL: Record<string, string> = { C001: 'Crew 1', C002: 'Crew 2', C003: 'Crew 3', C004: 'Crew 4' };

export default function Biomarkers() {
  const theme = useTheme();
  const c = useChartTheme();
  const [data, setData] = useState<I4Data | null>(null);
  const [error, setError] = useState('');
  const [ai, setAi] = useState(0);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const base = import.meta.env.BASE_URL;

  useEffect(() => {
    fetch(`${base}nasa-osd-575-cmp.csv`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => { const d = parseI4(t); setData(d); setAi(Math.max(0, d.analytes.findIndex((a) => a.id === 'glucose'))); })
      .catch(() => setError('Could not load the NASA OSD-575 file. Reconnect and reload.'));
  }, [base]);

  const matrix = useMemo(() => (data ? changeMatrix(data) : []), [data]);
  const insights = useMemo(() => {
    if (!data) return [];
    const r1 = data.timepoints.indexOf('R+1');
    return matrix.map((m) => ({ m, v: m.changes[r1] })).filter((x): x is { m: (typeof matrix)[number]; v: number } => x.v !== null).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
  }, [data, matrix]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Typography color="text.secondary" sx={{ py: 10, textAlign: 'center' }}>Loading NASA OSD-575…</Typography>;

  const a = data.analytes[ai];
  const rows = data.timepoints.map((tp) => {
    const row: Record<string, number | string | null> = { tp, day: data.samples.find((s) => s.timepoint === tp)!.day };
    data.crews.forEach((cr) => (row[cr] = data.samples.find((s) => s.crew === cr && s.timepoint === tp)?.values[ai] ?? null));
    return row;
  });
  const vals = rows.flatMap((r) => data.crews.map((cr) => r[cr] as number | null)).filter((v): v is number => v !== null);
  const lo = Math.min(...vals, a.refMin ?? Infinity);
  const hi = Math.max(...vals, a.refMax ?? -Infinity);
  const pad = (hi - lo) * 0.12 || 1;
  const cellColor = (pct: number | null) => {
    if (pct === null) return 'transparent';
    return alpha(theme.palette.text.primary, Math.min(Math.abs(pct) / 20, 1) * 0.32);
  };

  return (
    <>
      <PageHeader
        title="Spaceflight biomarkers: Inspiration4"
        subtitle="Blood chemistry from the four civilian Inspiration4 crew members (September 2021, three days in orbit) at three pre-flight and four post-flight timepoints. Each person starts somewhere different and responds differently, the reason AstroCare compares every astronaut with their own baseline."
        actions={<Button variant="outlined" startIcon={<DownloadOutlined />} href={`${base}nasa-osd-575-cmp.csv`} download>NASA data (CSV)</Button>}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: 'repeat(3, 1fr)' }, mb: 3 }}>
        {insights.map(({ m, v }) => (
          <Card key={m.analyte.id}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Largest shift one day after landing</Typography>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mt: 0.5 }}>
                <Typography variant="h6">{m.analyte.label}</Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: 22, color: 'text.primary' }}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">Crew average vs each person's own pre-flight mean. {m.analyte.note ?? ''}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '260px 1fr' } }}>
        <Card>
          <List dense sx={{ maxHeight: { lg: 520 }, overflowY: 'auto', py: 1 }}>
            {data.analytes.map((x, i) => {
              const out = outOfRangeCount(data, i);
              return (
                <ListItemButton key={x.id} selected={ai === i} onClick={() => setAi(i)}>
                  <ListItemText primary={x.label} slotProps={{ primary: { variant: 'body2' } }} />
                  {out > 0 && <Chip size="small" color="warning" variant="outlined" label={`${out} out`} />}
                </ListItemButton>
              );
            })}
          </List>
        </Card>
        <Section
          title={a.label}
          subheader={`${a.unit || 'ratio'} · laboratory reference ${a.refMin ?? '-'}-${a.refMax ?? '-'}${a.note ? ' · ' + a.note : ''}`}
          action={<ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}><ToggleButton value="chart">Chart</ToggleButton><ToggleButton value="table">Table</ToggleButton></ToggleButtonGroup>}
        >
          {view === 'chart' ? (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '1fr 1fr' } }} role="img" aria-label={`${a.label} for each Inspiration4 crew member across seven timepoints; switch to table for values`}>
              {data.crews.map((cr) => {
                const isOut = (v: number | null) => v != null && ((a.refMin !== undefined && v < a.refMin) || (a.refMax !== undefined && v > a.refMax));
                return (
                  <Box key={cr}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{CREW_LABEL[cr]}</Typography>
                    <Box sx={{ height: 170 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={c.grid} />
                          <XAxis dataKey="day" type="number" domain={[-100, 200]} ticks={rows.filter((r) => r.tp !== 'L-3').map((r) => r.day as number)} tickFormatter={(d) => (rows.find((r) => r.day === d)?.tp as string) ?? ''} interval={0} {...c.axis} tick={{ ...c.axis.tick, fontSize: 9.5 }} />
                          <YAxis domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} width={42} {...c.axis} />
                          {a.refMin !== undefined && a.refMax !== undefined && <ReferenceArea y1={a.refMin} y2={a.refMax} fill={c.refBand} strokeOpacity={0} />}
                          <ReferenceArea x1={-1} x2={4} fill={c.modelBand} strokeOpacity={0} />
                          <Tooltip content={(tp) => <ChartTip {...(tp as object)} render={(d) => <><Typography variant="caption" color="text.secondary">{CREW_LABEL[cr]}, {d.tp as string}</Typography><Typography sx={{ fontFamily: MONO, fontSize: 13 }}>{(d[cr] as number) ?? '-'} {a.unit}{isOut(d[cr] as number) ? ' (outside reference)' : ''}</Typography></>} />} />
                          <Line dataKey={cr} stroke={c.crew(0)} strokeWidth={2} connectNulls isAnimationActive={false}
                            dot={(dp: { cx?: number; cy?: number; payload?: Record<string, number | null>; index?: number }) => dp.cx == null || dp.cy == null ? <g key={dp.index} /> : <circle key={dp.index} cx={dp.cx} cy={dp.cy} r={isOut(dp.payload?.[cr] ?? null) ? 5 : 3.5} fill={isOut(dp.payload?.[cr] ?? null) ? c.warning : c.crew(0)} stroke={c.surface} strokeWidth={2} />} />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>Crew</TableCell>{data.timepoints.map((t) => <TableCell key={t} align="right">{t}</TableCell>)}<TableCell align="right">Pre-flight mean</TableCell></TableRow></TableHead>
                <TableBody>
                  {data.crews.map((cr) => (
                    <TableRow key={cr}>
                      <TableCell>{CREW_LABEL[cr]}</TableCell>
                      {data.timepoints.map((t) => {
                        const v = data.samples.find((s) => s.crew === cr && s.timepoint === t)?.values[ai];
                        const out = v != null && ((a.refMin !== undefined && v < a.refMin) || (a.refMax !== undefined && v > a.refMax));
                        return <TableCell key={t} align="right" sx={{ fontFamily: MONO, color: out ? 'warning.main' : undefined, fontWeight: out ? 600 : 400 }}>{v ?? '-'}{out ? '*' : ''}</TableCell>;
                      })}
                      <TableCell align="right" sx={{ fontFamily: MONO }}>{preflightMean(data, cr, ai)?.toFixed(2) ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Typography variant="caption" color="text.secondary">* outside the laboratory reference range reported in the dataset.</Typography>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>Light band: laboratory reference range. Darker band: the three-day flight. Highlighted points fall outside the reference range. L- = days before launch; R+ = days after return.</Typography>
        </Section>
      </Box>

      <Section title="Change from each astronaut's own pre-flight baseline" subheader="Crew-average % change for every analyte. Shading shows the size of the change (darker = larger, saturating at ±20%); the sign shows its direction. The three pre-flight columns average to zero by construction, their spread is normal pre-flight variation." sx={{ mt: 3 }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" sx={{ width: '100%', minWidth: 640, borderCollapse: 'separate', borderSpacing: '2px', fontSize: 13 }}>
            <thead>
              <tr>
                <Box component="th" sx={{ textAlign: 'left', fontWeight: 500, color: 'text.secondary', px: 1, py: 0.75 }}>Analyte</Box>
                {data.timepoints.map((t) => <Box component="th" key={t} sx={{ fontFamily: MONO, fontWeight: 500, color: t.startsWith('R') ? 'text.primary' : 'text.secondary', px: 1 }}>{t}</Box>)}
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ analyte, changes }, i) => (
                <tr key={analyte.id}>
                  <Box component="th" scope="row" sx={{ textAlign: 'left', fontWeight: 400, px: 1, whiteSpace: 'nowrap' }}>
                    <Box component="button" onClick={() => setAi(i)} sx={{ all: 'unset', cursor: 'pointer', color: ai === i ? 'primary.main' : 'text.primary', fontWeight: ai === i ? 600 : 400, '&:hover': { color: 'primary.main' } }}>{analyte.label}</Box>
                  </Box>
                  {changes.map((v, j) => (
                    <Box component="td" key={j} title={v === null ? 'No data' : `${v.toFixed(1)}%`} sx={{ fontFamily: MONO, textAlign: 'center', borderRadius: 1, py: 0.75, bgcolor: cellColor(v) }}>
                      {v === null ? '-' : Math.round(v) === 0 ? '0' : `${v > 0 ? '+' : ''}${Math.round(v)}`}
                    </Box>
                  ))}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      </Section>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { md: '1fr 1fr' }, mt: 3 }}>
        <Section title="What this means for AstroCare">
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary"><b>Baselines differ between people.</b> A single population threshold would miss changes that are significant for one crew member.</Typography>
            <Typography variant="body2" color="text.secondary"><b>Changes are mostly transient.</b> Of the 10 analytes that moved by 3% or more one day after landing, 9 were closer to pre-flight levels by R+45 or R+82, though pre-flight values themselves vary by up to ±16%.</Typography>
            <Typography variant="body2" color="text.secondary"><b>Monitoring continues after landing.</b> Readaptation to gravity is part of the mission.</Typography>
          </Stack>
        </Section>
        <Section title="Limits of this data">
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Four people and a three-day mission: these are observations, not population effects or clinical limits. Post-flight values also reflect landing stress, diet, hydration and sample handling, for example, all four crew show unusually low glucose at R+45, a pattern that may come from delayed sample processing rather than physiology. The race-based eGFR column is excluded. No model is trained on these samples.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}><Chip size="small" label="4 crew" /><Chip size="small" label="28 samples" /><Chip size="small" label={`${data.analytes.length} analytes`} /></Stack>
          <SourceLinks ids={['osd575', 'research']} sx={{ mt: 2 }} />
        </Section>
      </Box>
    </>
  );
}
