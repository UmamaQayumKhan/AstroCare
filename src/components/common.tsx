import type { ReactNode } from 'react';
import { Avatar, Box, Card, CardContent, CardHeader, Chip, Link, Stack, Typography, type SxProps } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CheckRounded from '@mui/icons-material/CheckRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ReportRounded from '@mui/icons-material/ReportRounded';
import NorthEastRounded from '@mui/icons-material/NorthEastRounded';
import science from '../../science.json';
import type { Severity } from '../lib/monitoring';
import type { Profile } from '../lib/demo';
import { DISPLAY, MONO } from '../theme';

export const SEV_LABEL: Record<Severity, string> = { nominal: 'Nominal', info: 'Info', watch: 'Watch', alert: 'Alert' };

/** Colour for a severity. Normal and info are intentionally neutral (HMI convention). */
export function useSevColor() {
  const t = useTheme();
  return (s: Severity) => ({ nominal: t.palette.text.secondary, info: t.palette.text.secondary, watch: t.palette.warning.main, alert: t.palette.error.main })[s];
}

export function SeverityChip({ severity, label, size = 'small' }: { severity: Severity; label?: string; size?: 'small' | 'medium'; variant?: 'outlined' | 'filled' }) {
  const t = useTheme();
  const c = { nominal: t.palette.text.secondary, info: t.palette.text.secondary, watch: t.palette.warning.main, alert: t.palette.error.main }[severity];
  const icon = { nominal: <CheckRounded />, info: <InfoOutlined />, watch: <WarningAmberRounded />, alert: <ReportRounded /> }[severity];
  const loud = severity === 'watch' || severity === 'alert';
  return (
    <Chip
      size={size}
      icon={icon}
      label={label ?? SEV_LABEL[severity]}
      sx={{
        color: loud ? c : 'text.secondary',
        bgcolor: loud ? alpha(c, t.palette.mode === 'dark' ? 0.16 : 0.1) : 'transparent',
        border: 1,
        borderColor: loud ? alpha(c, 0.45) : 'divider',
        '& .MuiChip-icon': { color: 'inherit', fontSize: 15, ml: 0.75 },
        fontWeight: loud ? 600 : 500,
      }}
    />
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode; overline?: string }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { md: 'flex-end' }, justifyContent: 'space-between' }}>
      <Box sx={{ maxWidth: 760 }}>
        <Typography variant="h4" component="h1">{title}</Typography>
        {subtitle && <Typography color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.55, maxWidth: '68ch' }}>{subtitle}</Typography>}
      </Box>
      {actions && <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, flexShrink: 0 }}>{actions}</Stack>}
    </Stack>
  );
}

export function Section({ title, subheader, action, children, sx, contentSx }: { title?: ReactNode; subheader?: ReactNode; action?: ReactNode; children: ReactNode; sx?: SxProps; contentSx?: SxProps }) {
  return (
    <Card sx={sx}>
      {title && <CardHeader title={title} subheader={subheader} action={action} sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }} />}
      <CardContent sx={contentSx}>{children}</CardContent>
    </Card>
  );
}

type Source = { id: string; title: string; agency: string; url: string };
const SOURCES = science.sources as Source[];
export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);

export function SourceLinks({ ids, sx }: { ids: string[]; sx?: SxProps }) {
  const list = [...new Set(ids)].map(sourceById).filter(Boolean) as Source[];
  if (!list.length) return null;
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, ...sx }}>
      {list.map((s) => (
        <Link key={s.id} href={s.url} target="_blank" rel="noreferrer" underline="hover" variant="caption" color="text.secondary" title={`${s.agency}: ${s.title}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, maxWidth: '100%' }}>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.agency.split(' / ')[0].split(',')[0]}: {s.title.length > 46 ? s.title.slice(0, 44) + '...' : s.title}</Box>
          <NorthEastRounded sx={{ fontSize: 12 }} />
        </Link>
      ))}
    </Stack>
  );
}

export function CrewAvatar({ p, size = 36 }: { p: Pick<Profile, 'initials' | 'color'>; size?: number }) {
  return (
    <Avatar sx={{ width: size, height: size, fontSize: size * 0.38, fontFamily: DISPLAY, fontWeight: 600, bgcolor: 'action.selected', color: 'text.primary', border: 1, borderColor: 'divider' }}>
      {p.initials}
    </Avatar>
  );
}

export function Stat({ label, value, unit, caption, color, icon }: { label: string; value: ReactNode; unit?: string; caption?: ReactNode; color?: string; icon?: ReactNode }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: '14px 16px !important' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          {icon && <Box sx={{ color: 'text.disabled', display: 'flex', '& svg': { fontSize: 18 } }}>{icon}</Box>}
        </Stack>
        <Typography sx={{ fontFamily: MONO, fontSize: 26, fontWeight: 500, lineHeight: 1.3, mt: 0.5, color: color ?? 'text.primary', letterSpacing: '-0.02em' }}>
          {value}
          {unit && <Typography component="span" sx={{ fontSize: 13, ml: 0.5, color: 'text.secondary', fontFamily: 'inherit' }}>{unit}</Typography>}
        </Typography>
        {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 2 }}>
      {icon && <Box sx={{ color: 'text.secondary', mb: 1.5, '& svg': { fontSize: 32 } }}>{icon}</Box>}
      <Typography variant="h6">{title}</Typography>
      {children && <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 460, mx: 'auto' }}>{children}</Typography>}
      {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}
    </Box>
  );
}

export function Num({ children, sx }: { children: ReactNode; sx?: SxProps }) {
  return <Box component="span" sx={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', ...sx }}>{children}</Box>;
}

export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link href={`#/${to}`} underline="hover" color="text.primary">{children}</Link>;
}

export function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDay = (iso: string | number) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
export const fmtClock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function ago(iso?: string | number, now = Date.now()) {
  if (iso === undefined) return 'never';
  const m = Math.round((now - (typeof iso === 'number' ? iso : Date.parse(iso))) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
export const go = (path: string) => { window.location.hash = '/' + path.replace(/^\//, ''); };
