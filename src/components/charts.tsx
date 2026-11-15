import type { ReactNode } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Box, Paper, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { Baseline, MetricKey, Reading } from '../lib/monitoring';
import { VITALS, num } from '../lib/monitoring';
import { crewColor, MONO } from '../theme';
import { fmtDay } from './common';

export function useChartTheme() {
  const t = useTheme();
  return {
    grid: t.palette.divider,
    axis: { tick: { fill: t.palette.text.secondary, fontSize: 11, fontFamily: MONO }, axisLine: false, tickLine: false } as const,
    surface: t.palette.background.paper,
    band: alpha(t.palette.text.primary, t.palette.mode === 'light' ? 0.06 : 0.08),
    modelBand: alpha(t.palette.text.primary, t.palette.mode === 'light' ? 0.09 : 0.12),
    refBand: alpha(t.palette.text.primary, 0.05),
    warning: t.palette.warning.main,
    alert: t.palette.error.main,
    muted: t.palette.text.secondary,
    faint: t.palette.text.disabled,
    crew: (i: number) => crewColor(i, t.palette.mode),
  };
}

export function ChartTip({ active, payload, render }: { active?: boolean; payload?: { payload: Record<string, unknown> }[]; render: (p: Record<string, unknown>) => ReactNode }) {
  if (!active || !payload?.length) return null;
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 1, boxShadow: 3, fontSize: 12 }}>
      {render(payload[0].payload)}
    </Paper>
  );
}

function Dot(props: { cx?: number; cy?: number; payload?: { flag?: boolean }; color: string; ring: string; warn: string; onlyFlag?: boolean }) {
  const { cx, cy, payload, color, ring, warn, onlyFlag } = props;
  if (cx == null || cy == null || (onlyFlag && !payload?.flag)) return null;
  return payload?.flag ? (
    <g>
      <circle cx={cx} cy={cy} r={7.5} fill="none" stroke={warn} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke={ring} strokeWidth={2} />
    </g>
  ) : (
    <circle cx={cx} cy={cy} r={3.5} fill={color} stroke={ring} strokeWidth={2} />
  );
}

export function VitalChart({ rows, metric, baseline, height = 260, color = 0 }: { rows: Reading[]; metric: MetricKey; baseline?: Baseline; height?: number; color?: number }) {
  const c = useChartTheme();
  const def = VITALS[metric];
  const stroke = c.crew(color);
  const data = rows
    .map((r) => ({ t: Date.parse(r.timestamp), v: num(r, metric) }))
    .filter((d): d is { t: number; v: number } => d.v !== undefined)
    .map((d) => ({ ...d, flag: baseline ? d.v < baseline.low || d.v > baseline.high : false }));
  if (!data.length) return <Box sx={{ height, display: 'grid', placeItems: 'center', color: 'text.secondary', fontSize: 14 }}>No {def.label.toLowerCase()} readings yet.</Box>;
  const values = data.map((d) => d.v);
  const lo = Math.min(...values, baseline?.low ?? Infinity);
  const hi = Math.max(...values, baseline?.high ?? -Infinity);
  const pad = Math.max((hi - lo) * 0.15, def.floorSpread);
  return (
    <Box role="img" aria-label={`${def.label} history chart. Exact values are in the readings table.`} sx={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtDay(t)} minTickGap={40} {...c.axis} />
          <YAxis domain={[Math.floor((lo - pad) * 10) / 10, Math.ceil((hi + pad) * 10) / 10]} width={46} tickFormatter={(v) => Number(v).toFixed(def.decimals)} {...c.axis} />
          {baseline && <ReferenceArea y1={baseline.low} y2={baseline.high} fill={c.band} strokeOpacity={0} ifOverflow="extendDomain" />}
          {baseline && <ReferenceLine y={baseline.median} stroke={c.muted} strokeDasharray="4 4" strokeWidth={1} />}
          <Tooltip
            content={(p) => (
              <ChartTip
                {...(p as object)}
                render={(d) => (
                  <>
                    <Typography variant="caption" color="text.secondary">{new Date(d.t as number).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Typography>
                    <Typography sx={{ fontFamily: MONO, fontWeight: 600, fontSize: 14 }}>{(d.v as number).toFixed(def.decimals)} {def.unit}</Typography>
                    {baseline && <Typography variant="caption" color="text.secondary" component="div">Personal range {baseline.low.toFixed(def.decimals)}-{baseline.high.toFixed(def.decimals)}</Typography>}
                    {Boolean(d.flag) && <Typography variant="caption" color="warning.main" component="div">Outside personal range</Typography>}
                  </>
                )}
              />
            )}
          />
          <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} dot={<Dot color={stroke} ring={c.surface} warn={c.warning} />} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2, fill: stroke }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
}

export function Sparkline({ values, color = 0, height = 30 }: { values: number[]; color?: number; height?: number }) {
  const c = useChartTheme();
  if (values.length < 2) return <Box sx={{ height }} />;
  return (
    <Box sx={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={values.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line type="monotone" dataKey="v" stroke={c.crew(color)} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export type LivePoint = { t: number; v?: number; lo?: number; hi?: number; pred?: number; flag?: boolean };

export function LiveChart({ data, metric, color = 0, height = 170 }: { data: LivePoint[]; metric: MetricKey; color?: number; height?: number }) {
  const c = useChartTheme();
  const def = VITALS[metric];
  const stroke = c.crew(color);
  const vals = data.flatMap((d) => [d.v, d.lo, d.hi]).filter((x): x is number => x !== undefined);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const pad = Math.max((hi - lo) * 0.12, def.floorSpread * 2);
  const rows = data.map((d) => ({ ...d, band: d.lo !== undefined && d.hi !== undefined ? [d.lo, d.hi] : undefined }));
  const lastT = data.at(-1)?.t ?? 0;
  return (
    <Box role="img" aria-label={`Live ${def.label} with model expected range`} sx={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => { const h = (t - lastT) / 3_600_000; return Math.abs(h) < 0.05 ? 'now' : `${h.toFixed(0)} h`; }} minTickGap={50} {...c.axis} />
          <YAxis domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} width={42} tickFormatter={(v) => Number(v).toFixed(def.decimals)} {...c.axis} />
          <Area dataKey="band" stroke="none" fill={c.modelBand} fillOpacity={1} isAnimationActive={false} />
          <Tooltip
            content={(p) => (
              <ChartTip
                {...(p as object)}
                render={(d) => (
                  <>
                    <Typography variant="caption" color="text.secondary">{Math.round(((d.t as number) - lastT) / 60000)} min (simulated)</Typography>
                    <Typography sx={{ fontFamily: MONO, fontWeight: 600, fontSize: 14 }}>{d.v === undefined ? 'Signal lost' : `${(d.v as number).toFixed(def.decimals)} ${def.unit}`}</Typography>
                    {d.lo !== undefined && <Typography variant="caption" color="text.secondary" component="div">Model expected {(d.lo as number).toFixed(def.decimals)}-{(d.hi as number).toFixed(def.decimals)}</Typography>}
                    {Boolean(d.flag) && <Typography variant="caption" color="warning.main" component="div">Outside expected range</Typography>}
                  </>
                )}
              />
            )}
          />
          <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} dot={<Dot color={stroke} ring={c.surface} warn={c.warning} onlyFlag />} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
}
