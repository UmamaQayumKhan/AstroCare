// Mission environments: communication delay and published radiation dose-equivalent rates.
// Rates are mission-average values reported by instruments; they vary with solar cycle,
// shielding and solar particle events. They are planning context, not personal dosimetry.

export type MissionId = 'Space station' | 'Lunar base' | 'Mars transit' | 'Mars surface';

export type RadiationRef = { label: string; url: string };

export type MissionProfile = {
  id: MissionId;
  short: string;
  oneWayDelaySec: [number, number]; // min/max one-way light time
  doseRate_mSvPerDay: number;
  doseNote: string;
  doseRef: RadiationRef;
  approximate?: boolean;
  plannedDays: number;
};

export const MISSIONS: MissionProfile[] = [
  {
    id: 'Space station',
    plannedDays: 180,
    short: 'LEO',
    oneWayDelaySec: [0.1, 0.5],
    doseRate_mSvPerDay: 0.5,
    doseNote: 'Order-of-magnitude value for low Earth orbit; varies with altitude, solar cycle and shielding.',
    doseRef: { label: 'CSA · Monitoring radiation for astronaut health', url: 'https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp' },
    approximate: true,
  },
  {
    id: 'Lunar base',
    plannedDays: 45,
    short: 'MOON',
    oneWayDelaySec: [1.25, 1.35],
    doseRate_mSvPerDay: 1.37,
    doseNote: "Dose-equivalent rate measured on the lunar surface by Chang'e 4 LND (Zhang et al., 2020).",
    doseRef: { label: 'Zhang et al. 2020, Science Advances', url: 'https://doi.org/10.1126/sciadv.aaz1334' },
  },
  {
    id: 'Mars transit',
    plannedDays: 210,
    short: 'MARS-T',
    oneWayDelaySec: [3 * 60, 22 * 60],
    doseRate_mSvPerDay: 1.84,
    doseNote: 'Dose-equivalent rate measured inside the MSL spacecraft during cruise to Mars (Zeitlin et al., 2013).',
    doseRef: { label: 'Zeitlin et al. 2013, Science', url: 'https://doi.org/10.1126/science.1235989' },
  },
  {
    id: 'Mars surface',
    plannedDays: 500,
    short: 'MARS-S',
    oneWayDelaySec: [3 * 60, 22 * 60],
    doseRate_mSvPerDay: 0.64,
    doseNote: 'Dose-equivalent rate measured on the Martian surface by Curiosity RAD (Hassler et al., 2014).',
    doseRef: { label: 'Hassler et al. 2014, Science', url: 'https://doi.org/10.1126/science.1244797' },
  },
];

export const CAREER_LIMIT_mSv = 600;
export const CAREER_LIMIT_REF: RadiationRef = {
  label: 'NASA-STD-3001 Vol. 1 (career effective-dose limit)',
  url: 'https://standards.nasa.gov/standard/NASA/NASA-STD-3001-VOL-1',
};

export function missionProfile(id: string): MissionProfile {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[2];
}

export function formatDelay(sec: number): string {
  if (sec < 1) return '< 1 s';
  if (sec < 60) return `${sec.toFixed(1)} s`;
  return `${Math.round(sec / 60)} min`;
}

export function delayLabel(m: MissionProfile): string {
  const [a, b] = m.oneWayDelaySec;
  if (b < 1) return 'Near real-time';
  if (Math.abs(b - a) < 1) return `${formatDelay(b)} one-way`;
  if (a >= 60) return `${Math.round(a / 60)}-${Math.round(b / 60)} min one-way`;
  return `${formatDelay(a)}-${formatDelay(b)} one-way`;
}

/** Earliest possible reply from ground (round trip, worst case), in ms. */
export function worstRoundTripMs(m: MissionProfile): number {
  return m.oneWayDelaySec[1] * 2 * 1000;
}

export function missionDay(startIso: string | undefined, now = Date.now()): number {
  if (!startIso) return 1;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return 1;
  return Math.max(1, Math.floor((now - start) / 86_400_000) + 1);
}

export function cumulativeDose(m: MissionProfile, days: number): number {
  return m.doseRate_mSvPerDay * days;
}
