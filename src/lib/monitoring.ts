// AstroCare monitoring engine.
// Three transparent, explainable layers, every flag says which rule fired and why:
//   1. Reference ranges  (published Earth adult ranges, cited)
//   2. Personal baseline (robust median ± MAD from the crew member's own first check-ins)
//   3. Trend detection   (Theil-Sen slope with sign-consistency check)
// Plus symptom keyword routing and check-in staleness. No hidden scores, no diagnosis.

export type MetricKey = 'heartRate' | 'systolic' | 'diastolic' | 'temperature' | 'sleep' | 'mood' | 'glucose';
export type Severity = 'nominal' | 'info' | 'watch' | 'alert';

export type Reading = {
  id: string;
  profile: string;
  timestamp: string;
  source: string;
  symptoms?: string;
  glucoseContext?: string;
  [key: string]: unknown;
};

type Band = { below?: number; above?: number; text: string };
export type VitalDef = {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  /** minimum meaningful spread, so a very stable history doesn't make tiny changes look huge */
  floorSpread: number;
  watch: Band[];
  alert: Band[];
  refText: string;
  refSourceIds: string[];
  /** normal display band for charts */
  refBand?: [number, number];
};

export const VITALS: Record<MetricKey, VitalDef> = {
  heartRate: {
    key: 'heartRate', label: 'Heart rate', short: 'HR', unit: 'bpm', decimals: 0, floorSpread: 3,
    watch: [{ below: 50, text: 'below 50 bpm' }, { above: 100, text: 'above the 100 bpm resting adult range' }],
    alert: [{ below: 40, text: 'below 40 bpm' }, { above: 130, text: 'above 130 bpm at rest' }],
    refText: 'Resting adult range 60-100 bpm; well-trained people can rest at 40-60 bpm.',
    refSourceIds: ['pulse'], refBand: [60, 100],
  },
  systolic: {
    key: 'systolic', label: 'Systolic pressure', short: 'SYS', unit: 'mmHg', decimals: 0, floorSpread: 4,
    watch: [{ above: 129, text: 'at or above 130 mmHg (AHA stage 1)' }, { below: 90, text: 'below 90 mmHg' }],
    alert: [{ above: 139, text: 'at or above 140 mmHg (AHA stage 2)' }, { below: 80, text: 'below 80 mmHg' }],
    refText: 'AHA categories: normal < 120, elevated 120-129, stage 1 130-139, stage 2 ≥ 140 mmHg.',
    refSourceIds: ['bpCategories'], refBand: [90, 120],
  },
  diastolic: {
    key: 'diastolic', label: 'Diastolic pressure', short: 'DIA', unit: 'mmHg', decimals: 0, floorSpread: 3,
    watch: [{ above: 79, text: 'at or above 80 mmHg (AHA stage 1)' }, { below: 50, text: 'below 50 mmHg' }],
    alert: [{ above: 89, text: 'at or above 90 mmHg (AHA stage 2)' }, { below: 40, text: 'below 40 mmHg' }],
    refText: 'AHA categories: normal < 80, stage 1 80-89, stage 2 ≥ 90 mmHg.',
    refSourceIds: ['bpCategories'], refBand: [60, 80],
  },
  temperature: {
    key: 'temperature', label: 'Body temperature', short: 'TEMP', unit: '°C', decimals: 1, floorSpread: 0.15,
    watch: [{ above: 37.4, text: 'above 37.5 °C (elevated)' }, { below: 35.6, text: 'below 35.6 °C' }],
    alert: [{ above: 37.9, text: 'at or above 38.0 °C (fever range)' }, { below: 35.0, text: 'below 35.0 °C' }],
    refText: 'Typical oral temperature is about 36.5-37.2 °C; 38.0 °C or higher is generally considered a fever.',
    refSourceIds: ['temperature'], refBand: [36.1, 37.2],
  },
  sleep: {
    key: 'sleep', label: 'Sleep duration', short: 'SLEEP', unit: 'h', decimals: 1, floorSpread: 0.4,
    watch: [{ below: 6, text: 'under 6 hours' }],
    alert: [{ below: 4.5, text: 'under 4.5 hours' }],
    refText: 'Adults generally need 7 or more hours of sleep per night. Sleep is a NASA ARCHeR research focus.',
    refSourceIds: ['sleepCdc', 'research'], refBand: [7, 9],
  },
  mood: {
    key: 'mood', label: 'Mood', short: 'MOOD', unit: '/5', decimals: 0, floorSpread: 0.5,
    watch: [{ below: 2.5, text: 'self-rated 2 or lower' }],
    alert: [{ below: 1.5, text: 'self-rated 1 (very low)' }],
    refText: 'App-designed 1-5 self-report. Low ratings are a prompt to talk, not a diagnosis.',
    refSourceIds: ['hazards', 'research'],
  },
  glucose: {
    key: 'glucose', label: 'Blood glucose', short: 'GLU', unit: 'mg/dL', decimals: 0, floorSpread: 6,
    watch: [{ above: 139, text: 'above 140 mg/dL' }],
    alert: [{ below: 70, text: 'below 70 mg/dL (low)' }, { above: 199, text: 'at or above 200 mg/dL' }],
    refText: 'Fasting 70-99 mg/dL is the usual reference; below 70 mg/dL is low. Context (fasting/meal) changes interpretation.',
    refSourceIds: ['glucoseRef'], refBand: [70, 99],
  },
};

export const METRIC_KEYS = Object.keys(VITALS) as MetricKey[];
export const CORE_KEYS: MetricKey[] = ['heartRate', 'systolic', 'temperature', 'sleep'];

const RANK: Record<Severity, number> = { nominal: 0, info: 1, watch: 2, alert: 3 };
export const worst = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);
export const severityRank = (s: Severity) => RANK[s];

export type Finding = {
  id: string;
  metric?: MetricKey;
  severity: Exclude<Severity, 'nominal'>;
  kind: 'reference' | 'personal' | 'trend' | 'symptom' | 'stale' | 'model' | 'cognitive' | 'exercise';
  title: string;
  detail: string;
  at?: string;
  sourceIds: string[];
};

export type Baseline = { median: number; spread: number; n: number; low: number; high: number };
export type Trend = { slopePerDay: number; change: number; consistency: number; n: number };
export type MetricStatus = {
  key: MetricKey;
  latest?: { value: number; timestamp: string };
  previous?: number;
  baseline?: Baseline;
  z?: number;
  trend?: Trend;
  severity: Severity;
};

export type Assessment = {
  profile: string;
  status: Severity;
  findings: Finding[];
  metrics: Record<MetricKey, MetricStatus>;
  lastCheckIn?: string;
  checkIns: number;
};

// ---------- statistics ----------
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function mad(values: number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/** Theil-Sen slope (per day) and fraction of pairwise slopes sharing its sign. */
export function theilSen(points: { t: number; v: number }[]): { slope: number; consistency: number } {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const dt = (points[j].t - points[i].t) / 86_400_000;
      if (dt > 0) slopes.push((points[j].v - points[i].v) / dt);
    }
  if (!slopes.length) return { slope: 0, consistency: 0 };
  const slope = median(slopes);
  const same = slopes.filter((s) => Math.sign(s) === Math.sign(slope) && s !== 0).length;
  return { slope, consistency: same / slopes.length };
}

export const BASELINE_WINDOW = 10;
export const BASELINE_MIN = 5;

export function num(r: Reading, key: MetricKey): number | undefined {
  const v = r[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Personal baseline from the crew member's earliest check-ins (excluding the one being assessed). */
export function personalBaseline(sorted: Reading[], key: MetricKey, exclude?: string): Baseline | undefined {
  const values = sorted.filter((r) => r.id !== exclude).map((r) => num(r, key)).filter((v): v is number => v !== undefined).slice(0, BASELINE_WINDOW);
  if (values.length < BASELINE_MIN) return undefined;
  const m = median(values);
  const spread = Math.max(1.4826 * mad(values), VITALS[key].floorSpread);
  return { median: m, spread, n: values.length, low: m - 2 * spread, high: m + 2 * spread };
}

export function referenceSeverity(key: MetricKey, value: number): { severity: Severity; text?: string } {
  const def = VITALS[key];
  const hit = (b: Band) => (b.above !== undefined && value > b.above) || (b.below !== undefined && value < b.below);
  const a = def.alert.find(hit);
  if (a) return { severity: 'alert', text: a.text };
  const w = def.watch.find(hit);
  if (w) return { severity: 'watch', text: w.text };
  return { severity: 'nominal' };
}

const URGENT = /\b(chest (pain|pressure|tightness)|short(ness)? of breath|can'?t breathe|cannot breathe|difficulty breathing|faint(ed|ing)?|passed out|collapse[d]?|unconscious|seizure|confus(ed|ion)|severe (pain|headache|bleeding)|vision loss|numb(ness)?|slurred)\b/i;
const NOTABLE = /\b(headache|nause\w*|vomit\w*|dizz\w*|congest\w*|back pain|fatigue|tired|insomnia|rash|cough|sore throat|eye|blurr\w*|anxious|anxiety|lonely|low mood|stress\w*)\b/i;

export function symptomSeverity(text: string | undefined): Severity {
  if (!text?.trim()) return 'nominal';
  if (URGENT.test(text)) return 'alert';
  if (NOTABLE.test(text)) return 'watch';
  return 'info';
}

const fmt = (key: MetricKey, v: number) => `${v.toFixed(VITALS[key].decimals)} ${VITALS[key].unit}`;

export function assess(profile: string, records: Reading[], now = Date.now()): Assessment {
  const sorted = records.filter((r) => r.profile === profile).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const findings: Finding[] = [];
  const metrics = {} as Record<MetricKey, MetricStatus>;

  for (const key of METRIC_KEYS) {
    const def = VITALS[key];
    const withValue = sorted.filter((r) => num(r, key) !== undefined);
    const last = withValue.at(-1);
    const status: MetricStatus = { key, severity: 'nominal' };
    metrics[key] = status;
    if (!last) continue;
    const value = num(last, key)!;
    status.latest = { value, timestamp: last.timestamp };
    status.previous = withValue.length > 1 ? num(withValue.at(-2)!, key) : undefined;

    // 1. reference range
    const ref = referenceSeverity(key, value);
    if (ref.severity !== 'nominal') {
      status.severity = worst(status.severity, ref.severity);
      findings.push({
        id: `ref-${key}-${last.id}`, metric: key, severity: ref.severity as Finding['severity'], kind: 'reference', at: last.timestamp,
        title: `${def.label} ${ref.text}`,
        detail: `Latest reading ${fmt(key, value)}. ${def.refText}`,
        sourceIds: def.refSourceIds,
      });
    }

    // 2. personal baseline
    const base = personalBaseline(withValue, key, last.id);
    if (base) {
      status.baseline = base;
      const z = (value - base.median) / base.spread;
      status.z = z;
      const abs = Math.abs(z);
      if (abs >= 2.5 && key !== 'mood') {
        const sev: Finding['severity'] = abs >= 4 ? 'alert' : 'watch';
        status.severity = worst(status.severity, sev);
        findings.push({
          id: `personal-${key}-${last.id}`, metric: key, severity: sev, kind: 'personal', at: last.timestamp,
          title: `${def.label} unusual for this crew member`,
          detail: `${fmt(key, value)} is ${abs.toFixed(1)} robust SDs ${z > 0 ? 'above' : 'below'} their personal baseline of ${fmt(key, base.median)} (typical range ${base.low.toFixed(def.decimals)}-${base.high.toFixed(def.decimals)}, from their first ${base.n} check-ins).`,
          sourceIds: ['research'],
        });
      }
    }

    // 3. sustained trend over the last 7-10 readings
    const recent = withValue.slice(-10);
    if (recent.length >= 6) {
      const pts = recent.map((r) => ({ t: Date.parse(r.timestamp), v: num(r, key)! }));
      const { slope, consistency } = theilSen(pts);
      const spanDays = (pts.at(-1)!.t - pts[0].t) / 86_400_000;
      const change = slope * spanDays;
      status.trend = { slopePerDay: slope, change, consistency, n: recent.length };
      const scale = base?.spread ?? def.floorSpread * 2;
      if (consistency >= 0.7 && Math.abs(change) >= 2 * scale && key !== 'mood') {
        status.severity = worst(status.severity, 'watch');
        findings.push({
          id: `trend-${key}-${last.id}`, metric: key, severity: 'watch', kind: 'trend', at: last.timestamp,
          title: `${def.label} ${change > 0 ? 'rising' : 'declining'} steadily`,
          detail: `Changed ${change > 0 ? '+' : ''}${change.toFixed(def.decimals || 1)} ${def.unit} over the last ${recent.length} readings (${spanDays.toFixed(0)} days, ${Math.round(consistency * 100)}% of pairwise slopes agree).`,
          sourceIds: key === 'sleep' ? ['research', 'hazards'] : ['risks'],
        });
      }
    }
  }

  // symptoms on the latest check-in
  const latest = sorted.at(-1);
  if (latest?.symptoms?.trim()) {
    const sev = symptomSeverity(latest.symptoms);
    if (sev !== 'nominal')
      findings.push({
        id: `symptom-${latest.id}`, severity: sev as Finding['severity'], kind: 'symptom', at: latest.timestamp,
        title: sev === 'alert' ? 'Urgent symptom reported' : 'Symptom reported',
        detail: sev === 'alert'
          ? `"${latest.symptoms.trim()}". Follow the mission-approved emergency procedure and contact the crew medical officer / flight surgeon.`
          : `"${latest.symptoms.trim()}"`,
        sourceIds: ['risks'],
      });
  }

  // staleness
  if (latest && now - Date.parse(latest.timestamp) > 36 * 3_600_000) {
    const h = Math.round((now - Date.parse(latest.timestamp)) / 3_600_000);
    findings.push({ id: `stale-${latest.id}`, severity: 'info', kind: 'stale', title: 'Check-in overdue', detail: `Last check-in was ${h} h ago. Daily check-ins keep the personal baseline meaningful.`, sourceIds: ['research'] });
  }

  findings.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  const status = findings.reduce<Severity>((s, f) => worst(s, f.severity), 'nominal');
  return { profile, status, findings, metrics, lastCheckIn: latest?.timestamp, checkIns: sorted.length };
}

export const SEVERITY_LABEL: Record<Severity, string> = { nominal: 'Nominal', info: 'Info', watch: 'Watch', alert: 'Alert' };
