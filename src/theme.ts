import { alpha, createTheme, type PaletteMode } from '@mui/material/styles';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';

// Visual language: high-performance HMI (ISA-101 style) as used in control rooms.
// The interface is greyscale; colour appears only when something needs attention
// (amber = watch, red = alert). Normal state is deliberately quiet.

export const MONO = '"Geist Mono Variable", ui-monospace, monospace';
export const DISPLAY = '"Barlow Semi Condensed", "Geist Variable", system-ui, sans-serif';

type Tokens = { bg: string; paper: string; raised: string; line: string; ink: string; ink2: string; ink3: string; watch: string; alert: string; quiet: string };
const TOKENS: Record<PaletteMode, Tokens> = {
  dark: { bg: '#0e0f10', paper: '#151618', raised: '#1c1d20', line: '#28292d', ink: '#ececed', ink2: '#a3a3a8', ink3: '#6c6c72', watch: '#e8a93a', alert: '#f26b6b', quiet: '#8d8d93' },
  light: { bg: '#f5f5f6', paper: '#ffffff', raised: '#f0f0f2', line: '#e2e2e6', ink: '#17171a', ink2: '#5d5d65', ink3: '#8a8a91', watch: '#b45f06', alert: '#c41e1e', quiet: '#6d6d74' },
};
export const tokens = (mode: PaletteMode) => TOKENS[mode];

/** Data series are drawn in ink; there is no per-crew colour coding (identity is by name). */
export const crewColor = (_i: number, mode: PaletteMode) => TOKENS[mode].ink;

export function makeTheme(mode: PaletteMode) {
  const t = TOKENS[mode];
  const base = createTheme({
    palette: {
      mode,
      primary: { main: t.ink, contrastText: mode === 'dark' ? '#111113' : '#ffffff' },
      secondary: { main: t.ink2 },
      success: { main: t.quiet },
      info: { main: t.quiet },
      warning: { main: t.watch },
      error: { main: t.alert },
      background: { default: t.bg, paper: t.paper },
      text: { primary: t.ink, secondary: t.ink2, disabled: t.ink3 },
      divider: t.line,
      action: { hover: alpha(t.ink, 0.05), selected: alpha(t.ink, 0.08) },
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: '"Geist Variable", system-ui, sans-serif',
      fontSize: 14,
      h4: { fontFamily: DISPLAY, fontWeight: 600, fontSize: '2rem', letterSpacing: '0', lineHeight: 1.15 },
      h5: { fontFamily: DISPLAY, fontWeight: 600, fontSize: '1.45rem', lineHeight: 1.2 },
      h6: { fontFamily: DISPLAY, fontWeight: 600, fontSize: '1.15rem', lineHeight: 1.25 },
      subtitle1: { fontWeight: 500 },
      subtitle2: { fontWeight: 600, fontSize: '0.875rem' },
      body2: { fontSize: '0.8625rem' },
      overline: { fontFamily: DISPLAY, fontWeight: 600, letterSpacing: '0.06em', fontSize: '0.8rem', lineHeight: 1.6 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    },
  });
  return createTheme(base, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { WebkitFontSmoothing: 'antialiased' },
          '::selection': { background: alpha(t.ink, 0.2) },
          '@media print': { '.no-print': { display: 'none !important' }, body: { background: '#fff' } },
          '@keyframes blink': { '50%': { opacity: 0.35 } },
          '@media (prefers-reduced-motion: reduce)': { '*': { animation: 'none !important', transition: 'none !important' } },
        },
      },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderRadius: 8, borderColor: t.line } } },
      MuiCardHeader: {
        styleOverrides: {
          root: { padding: '14px 18px 6px' },
          title: { fontFamily: DISPLAY, fontSize: '1.08rem', fontWeight: 600 },
          subheader: { fontSize: '0.8rem', marginTop: 2, color: t.ink2 },
        },
      },
      MuiCardContent: { styleOverrides: { root: { padding: '10px 18px 18px', '&:last-child': { paddingBottom: 18 } } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 6, '&:active': { transform: 'translateY(1px)' } },
          outlined: { borderColor: t.line, color: t.ink, '&:hover': { borderColor: t.ink3, background: alpha(t.ink, 0.04) } },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 4, fontWeight: 500 },
          sizeSmall: { height: 22, fontSize: '0.72rem' },
          outlined: { borderColor: t.line },
        },
      },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 6, '& .MuiOutlinedInput-notchedOutline': { borderColor: t.line } } } },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 600, fontSize: '0.74rem', color: t.ink2, whiteSpace: 'nowrap' },
          root: { borderColor: t.line },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            margin: '1px 8px',
            '&.Mui-selected': { backgroundColor: alpha(t.ink, mode === 'dark' ? 0.09 : 0.07), '&:hover': { backgroundColor: alpha(t.ink, 0.11) } },
          },
        },
      },
      MuiListItemIcon: { styleOverrides: { root: { minWidth: 34, color: t.ink2 } } },
      MuiLinearProgress: { styleOverrides: { root: { backgroundColor: alpha(t.ink, 0.08) }, bar: { borderRadius: 3 } } },
      MuiTooltip: { styleOverrides: { tooltip: { fontSize: '0.75rem', background: t.ink, color: t.paper } } },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 8, border: `1px solid ${t.line}` },
          standardInfo: { background: t.raised, color: t.ink, '& .MuiAlert-icon': { color: t.ink2 } },
          standardSuccess: { background: t.raised, color: t.ink, '& .MuiAlert-icon': { color: t.ink2 } },
        },
      },
      MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 500, padding: '5px 12px', borderColor: t.line, '&.Mui-selected': { background: alpha(t.ink, 0.1), color: t.ink } } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 42 } } },
      MuiTabs: { styleOverrides: { root: { minHeight: 42 }, indicator: { backgroundColor: t.ink } } },
      MuiSwitch: { styleOverrides: { switchBase: { '&.Mui-checked + .MuiSwitch-track': { backgroundColor: t.ink } } } },
      MuiBadge: { styleOverrides: { badge: { fontWeight: 600 } } },
    },
  });
}
