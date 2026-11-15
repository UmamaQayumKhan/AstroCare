import { useMemo, useState } from 'react';
import { Alert, Box, Button, Card, Chip, LinearProgress, Link, Stack, Tab, Tabs, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRounded from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRounded from '@mui/icons-material/TrendingFlatRounded';
import { useApp } from '../state';
import { CrewAvatar, EmptyState, PageHeader, Section, SeverityChip, SourceLinks, ago, useSevColor } from '../components/common';
import { VitalChart } from '../components/charts';
import { METRIC_KEYS, VITALS, num, type Finding, type MetricKey } from '../lib/monitoring';
import { weeklyCompliance } from '../lib/exercise';
import { assessPvt } from '../lib/pvt';
import { MONO } from '../theme';

const TAB_LABEL: Record<MetricKey, string> = { heartRate: 'Heart rate', systolic: 'Systolic', diastolic: 'Diastolic', temperature: 'Temperature', sleep: 'Sleep', mood: 'Mood', glucose: 'Glucose' };
const COL_LABEL: Record<MetricKey, string> = { heartRate: 'HR', systolic: 'Sys', diastolic: 'Dia', temperature: 'Temp', sleep: 'Sleep', mood: 'Mood', glucose: 'Glucose' };
const KIND_LABEL: Record<Finding['kind'], string> = { reference: 'Reference range', personal: 'Personal baseline', trend: 'Trend', symptom: 'Symptom', stale: 'Schedule', model: 'Model', cognitive: 'Cognitive test', exercise: 'Exercise' };

export default function Astronaut({ id }: { id?: string }) {
  const { profiles, assessments, records, pvt, exercise, settings } = useApp();
  const sev = useSevColor();
  const p = profiles.find((x) => x.id === id) ?? profiles[0];
  const [metric, setMetric] = useState<MetricKey>('heartRate');
  const mine = useMemo(() => records.filter((r) => r.profile === p?.id), [records, p?.id]);
  if (!p) return <EmptyState title="No crew member selected" action={<Button href="#/">Back to mission control</Button>}>Add a crew member first.</EmptyState>;
  const a = assessments[p.id];
  const ms = a.metrics[metric];
  const def = VITALS[metric];
  const myPvt = pvt.filter((x) => x.profile === p.id).sort((x, y) => x.timestamp.localeCompare(y.timestamp));
  const lastPvt = myPvt.at(-1);
  const pvtA = lastPvt ? assessPvt(lastPvt, pvt) : null;
  const comp = exercise.some((x) => x.profile === p.id) ? weeklyCompliance(exercise, p.id, settings.prescription) : null;
  const TrendIcon = !ms.trend ? TrendingFlatRounded : ms.trend.change > 0 ? TrendingUpRounded : ms.trend.change < 0 ? TrendingDownRounded : TrendingFlatRounded;

  const columns: GridColDef[] = [
    { field: 'timestamp', headerName: 'Recorded', width: 150, valueFormatter: (v: string) => new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    ...METRIC_KEYS.map((k): GridColDef => ({ field: k, headerName: COL_LABEL[k], description: `${VITALS[k].label} (${VITALS[k].unit})`, type: 'number', width: 92, valueFormatter: (v?: number) => (v == null ? '-' : v.toFixed(VITALS[k].decimals)) })),
    { field: 'source', headerName: 'Source', width: 110, renderCell: (c) => <Chip size="small" variant="outlined" label={c.value as string} /> },
    { field: 'symptoms', headerName: 'Notes', flex: 1, minWidth: 180 },
  ];

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={<Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }} component="span"><span>{p.role} · {a.checkIns} check-ins · last {ago(a.lastCheckIn)}</span><SeverityChip severity={a.status} /></Stack>}
        actions={
          <>
            <Button variant="contained" startIcon={<FactCheckOutlined />} href={`#/check-in/${p.id}`}>New check-in</Button>
            <Button variant="outlined" startIcon={<MonitorHeartOutlined />} href={`#/live/${p.id}`}>Live monitor</Button>
            <Button variant="outlined" startIcon={<DescriptionOutlined />} href={`#/report/${p.id}`}>Report</Button>
          </>
        }
      />
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 360px' } }}>
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <Card>
            <Stack direction="row" sx={{ alignItems: 'center', px: 2.5, pt: 1.5, gap: 2 }}>
              <CrewAvatar p={p} size={34} />
              <Tabs value={metric} onChange={(_, v) => setMetric(v)} variant="scrollable" scrollButtons="auto" sx={{ flex: 1 }}>
                {METRIC_KEYS.map((k) => (
                  <Tab
                    key={k}
                    value={k}
                    label={
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                        <span>{TAB_LABEL[k]}</span>
                        {a.metrics[k].severity !== 'nominal' && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: sev(a.metrics[k].severity) }} />}
                      </Stack>
                    }
                  />
                ))}
              </Tabs>
            </Stack>
            <Box sx={{ px: 2.5, pb: 2.5, pt: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Latest</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: 30, fontWeight: 500 }}>{ms.latest ? ms.latest.value.toFixed(def.decimals) : '-'}<Typography component="span" color="text.secondary" sx={{ ml: 0.5 }}>{def.unit}</Typography></Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Personal range</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: 18, mt: 0.75 }}>{ms.baseline ? `${ms.baseline.low.toFixed(def.decimals)}-${ms.baseline.high.toFixed(def.decimals)}` : 'building…'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">vs baseline</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: 18, mt: 0.75 }}>{ms.z !== undefined ? `${ms.z > 0 ? '+' : ''}${ms.z.toFixed(1)} SD` : '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Trend, last {ms.trend?.n ?? 0}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.75 }}>
                    <TrendIcon fontSize="small" color="action" />
                    <Typography sx={{ fontFamily: MONO, fontSize: 18 }}>{ms.trend ? `${ms.trend.change > 0 ? '+' : ''}${ms.trend.change.toFixed(def.decimals || 1)}` : '-'}</Typography>
                  </Stack>
                </Box>
              </Stack>
              <VitalChart rows={mine} metric={metric} baseline={ms.baseline} height={290} color={p.color} />
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                Shaded band: personal typical range (median ± 2 robust SD of the first {ms.baseline?.n ?? 10} check-ins); dashed line: personal median; ringed points fall outside it. Reference: {def.refText}
              </Typography>
              <SourceLinks ids={def.refSourceIds} sx={{ mt: 1 }} />
            </Box>
          </Card>

          <Section title="All readings" subheader="Sortable and filterable; export from the toolbar" contentSx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Box sx={{ height: 440 }}>
              <DataGrid
                rows={mine}
                columns={columns}
                density="compact"
                showToolbar
                disableRowSelectionOnClick
                initialState={{ sorting: { sortModel: [{ field: 'timestamp', sort: 'desc' }] }, pagination: { paginationModel: { pageSize: 25 } } }}
                pageSizeOptions={[10, 25, 50]}
                sx={{ border: 0, borderRadius: 0 }}
              />
            </Box>
          </Section>
        </Stack>

        <Stack spacing={3}>
          <Section title="Findings" subheader={a.findings.length ? `${a.findings.length} active, most severe first` : 'Nothing flagged'}>
            {a.findings.length ? (
              <Stack spacing={1.5}>
                {a.findings.map((f) => (
                  <Box key={f.id} sx={{ border: 1, borderColor: 'divider', borderLeft: 3, borderLeftColor: sev(f.severity), borderRadius: 2, p: 1.5 }}>
                    <Stack direction="row" spacing={1} sx={{ mb: 0.75, alignItems: 'center' }}>
                      <SeverityChip severity={f.severity} />
                      <Typography variant="caption" color="text.secondary">{KIND_LABEL[f.kind]}</Typography>
                    </Stack>
                    <Typography variant="subtitle2">{f.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>{f.detail}</Typography>
                    {f.metric && <Link component="button" variant="body2" onClick={() => setMetric(f.metric!)} sx={{ mt: 0.75 }}>Show {VITALS[f.metric].label.toLowerCase()}</Link>}
                    <SourceLinks ids={f.sourceIds} sx={{ mt: 1 }} />
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">No finding from reference ranges, personal baseline, trends, reaction testing or exercise. This does not establish that this person is medically well.</Typography>
            )}
            {a.status === 'alert' && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                An alert is a prompt, not a diagnosis. Follow the mission procedure and involve the crew medical officer. <Link href={`#/emergency/${p.id}`}>Prepare a handover</Link>.
              </Alert>
            )}
          </Section>
          <Section title="Performance" subheader="Cognitive testing and exercise countermeasures">
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Reaction-time test (PVT)</Typography>
                  {pvtA && <SeverityChip severity={pvtA.severity} />}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{lastPvt && pvtA ? `${ago(lastPvt.timestamp)} · ${pvtA.text}` : 'No tests yet.'}</Typography>
                <Button size="small" href={`#/cognition/${p.id}`} sx={{ mt: 0.5, ml: -1 }}>Open cognitive test</Button>
              </Box>
              <Box>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Exercise, last 7 days</Typography>
                  {comp && <SeverityChip severity={comp.severity} label={`${Math.round(comp.overallPct * 100)}%`} />}
                </Stack>
                {comp ? (
                  <>
                    <LinearProgress variant="determinate" value={comp.overallPct * 100} color={comp.severity === 'nominal' ? 'success' : comp.severity === 'watch' ? 'warning' : 'error'} sx={{ mt: 1, height: 6, borderRadius: 3 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{comp.resistanceMin} min resistive · {comp.aerobicMin} min aerobic · {comp.activeDays} active days</Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">No sessions logged.</Typography>
                )}
                <Button size="small" href={`#/exercise/${p.id}`} sx={{ mt: 0.5, ml: -1 }}>Open exercise log</Button>
              </Box>
            </Stack>
          </Section>
        </Stack>
      </Box>
    </>
  );
}
