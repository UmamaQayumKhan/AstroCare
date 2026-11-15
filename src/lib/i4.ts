// NASA OSDR OSD-575 (Inspiration4) comprehensive metabolic panel parser + analysis.
// 4 civilian crew (C001-C004) × 7 timepoints, 3 pre-flight (L-) and 4 post-flight (R+).

export type Analyte = { id: string; label: string; unit: string; valueCol: number; minCol: number; maxCol: number; note?: string; refMin?: number; refMax?: number };
export type Sample = { crew: string; timepoint: string; day: number; values: (number | null)[] };
export type I4Data = { analytes: Analyte[]; samples: Sample[]; crews: string[]; timepoints: string[] };

const LABELS: Record<string, [string, string?]> = {
  glucose: ['Glucose', 'Fuel for cells; stress hormones at launch and landing can raise it.'],
  calcium: ['Calcium', 'Bone loss in weightlessness can release calcium into blood.'],
  potassium: ['Potassium'],
  sodium: ['Sodium', 'Fluid shifts in microgravity change sodium and water balance.'],
  chloride: ['Chloride'],
  carbon_dioxide: ['Bicarbonate (CO₂)'],
  urea_nitrogen_bun: ['Blood urea nitrogen', 'Kidney and protein-metabolism marker.'],
  creatinine: ['Creatinine', 'Kidney-function marker; also tracks muscle mass.'],
  egfr_non_african_american: ['eGFR', 'Estimated kidney filtration.'],
  bun_to_creatinine_ratio: ['BUN / creatinine ratio'],
  albumin: ['Albumin', 'Main blood protein; reflects fluid status and nutrition.'],
  globulin: ['Globulin', 'Includes antibodies, immune-system marker.'],
  albumin_to_globulin_ratio: ['Albumin / globulin ratio'],
  total_protein: ['Total protein'],
  alkaline_phosphatase: ['Alkaline phosphatase', 'Liver and bone enzyme; relates to bone turnover.'],
  alt: ['ALT (liver enzyme)'],
  ast: ['AST (liver / muscle enzyme)'],
  total_bilirubin: ['Total bilirubin'],
};

const UNIT: Record<string, string> = {
  gram_per_deciliter: 'g/dL',
  units_per_liter: 'U/L',
  milligram_per_deciliter: 'mg/dL',
  millimol_per_liter: 'mmol/L',
  'milliliter_per_minute_per_1.73_meter_squared': 'mL/min/1.73m²',
};

export const FLIGHT_DAYS = 3; // Inspiration4: 15-18 Sep 2021

export function timepointDay(tp: string): number {
  const m = /^([LR])([+-])(\d+)$/.exec(tp);
  if (!m) return NaN;
  const n = Number(m[3]);
  return m[1] === 'L' ? -n : n + FLIGHT_DAYS;
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((s) => s.trim());
}
function toNum(s: string | undefined): number | null {
  if (s === undefined || s === '' || /^n\/?a$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseI4(text: string): I4Data {
  const lines = text.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0]);
  const analytes: Analyte[] = [];
  header.forEach((h, i) => {
    const m = /^(.*)_value_(.*)$/.exec(h);
    if (!m) return;
    const [, id, unitKey] = m;
    if (id === 'egfr_african_american') return; // race-based eGFR equation excluded deliberately
    const minCol = header.findIndex((x) => x.startsWith(`${id}_range_min`));
    const maxCol = header.findIndex((x) => x.startsWith(`${id}_range_max`) || x.startsWith(`${id}_max`));
    const [label, note] = LABELS[id] ?? [id.replaceAll('_', ' ')];
    analytes.push({ id, label, note, unit: UNIT[unitKey] ?? (unitKey.includes('ratio') ? '' : unitKey), valueCol: i, minCol, maxCol });
  });
  const rows = lines.slice(1).map(splitCsvLine);
  const samples: Sample[] = rows.map((cols) => {
    const [crew, , timepoint] = cols[0].split('_');
    return { crew, timepoint, day: timepointDay(timepoint), values: analytes.map((a) => toNum(cols[a.valueCol])) };
  });
  // reference ranges: take the most common min/max reported for the analyte
  analytes.forEach((a) => {
    const mins = rows.map((c) => toNum(c[a.minCol])).filter((v): v is number => v !== null);
    const maxs = rows.map((c) => toNum(c[a.maxCol])).filter((v): v is number => v !== null);
    a.refMin = mode(mins);
    a.refMax = mode(maxs);
  });
  samples.sort((x, y) => x.crew.localeCompare(y.crew) || x.day - y.day);
  const crews = [...new Set(samples.map((s) => s.crew))].sort();
  const timepoints = [...new Set(samples.map((s) => s.timepoint))].sort((a, b) => timepointDay(a) - timepointDay(b));
  return { analytes, samples, crews, timepoints };
}

function mode(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const c = new Map<number, number>();
  values.forEach((v) => c.set(v, (c.get(v) ?? 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Each crew member's own pre-flight mean (L-92, L-44, L-3). */
export function preflightMean(data: I4Data, crew: string, ai: number): number | null {
  const v = data.samples.filter((s) => s.crew === crew && s.day < 0).map((s) => s.values[ai]).filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Crew-average % change from each person's own pre-flight mean, per timepoint. */
export function changeMatrix(data: I4Data): { analyte: Analyte; changes: (number | null)[] }[] {
  return data.analytes.map((a, ai) => ({
    analyte: a,
    changes: data.timepoints.map((tp) => {
      const deltas = data.crews
        .map((c) => {
          const base = preflightMean(data, c, ai);
          const s = data.samples.find((x) => x.crew === c && x.timepoint === tp);
          const v = s?.values[ai];
          return base && v != null ? ((v - base) / base) * 100 : null;
        })
        .filter((x): x is number => x !== null);
      return deltas.length ? deltas.reduce((p, q) => p + q, 0) / deltas.length : null;
    }),
  }));
}

export function outOfRangeCount(data: I4Data, ai: number): number {
  const a = data.analytes[ai];
  return data.samples.filter((s) => {
    const v = s.values[ai];
    return v !== null && ((a.refMin !== undefined && v < a.refMin) || (a.refMax !== undefined && v > a.refMax));
  }).length;
}
