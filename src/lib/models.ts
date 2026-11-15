// In-browser evaluation of the exported PhysioNet next-observation models
// (sklearn HistGradientBoostingRegressor trees) with split-conformal intervals.
import type { MetricKey } from './monitoring.ts';

/** [value, featureIdx, threshold, missingGoLeft, left, right, isLeaf] */
export type Node = [number, number, number, number, number, number, number];
export type Conformal = {
  calibration: string;
  q80: number;
  q90: number;
  q95: number;
  testCoverage: { q80: number; q90: number; q95: number };
  nCalibration: number;
};
export type VitalModel = {
  label: string;
  unit: string;
  features: string[];
  baseline: number;
  trees: Node[][];
  conformal: Conformal;
  testMae: number;
  baselineMae: number;
  trainingDomain?: { gapMinutes: [number, number]; elapsedMinutes: [number, number] };
};
export type ModelBundle = {
  version: number;
  generatedAt: string;
  source: string;
  trainingDomain: { gapMinutes: [number, number]; elapsedMinutes: [number, number] };
  models: Record<string, VitalModel>;
};

export const MODEL_FOR: Partial<Record<MetricKey, string>> = {
  heartRate: 'HR',
  systolic: 'NISysABP',
  diastolic: 'NIDiasABP',
  temperature: 'Temp',
};

export function predictTree(tree: Node[], x: (number | null)[]): number {
  let i = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    const [value, f, thr, missLeft, left, right, leaf] = tree[i];
    if (leaf) return value;
    const v = x[f];
    const goLeft = v === null || Number.isNaN(v) ? missLeft === 1 : (v as number) <= thr;
    i = goLeft ? left : right;
  }
  throw new Error('Malformed tree');
}

export function predict(model: VitalModel, x: (number | null)[]): number {
  let y = model.baseline;
  for (const t of model.trees) y += predictTree(t, x);
  return y;
}

export type Level = 'q80' | 'q90' | 'q95';
export type Forecast = { prediction: number; low: number; high: number; inDomain: boolean; level: Level };

/**
 * Forecast the next observation from the three previous ones.
 * history: oldest → newest, times in ms. elapsedMin: minutes since monitoring started (ICU "elapsed").
 */
export function forecastNext(
  bundle: ModelBundle,
  key: MetricKey,
  history: { t: number; v: number }[],
  elapsedMin: number,
  level: Level = 'q90',
): Forecast | null {
  const id = MODEL_FOR[key];
  const model = id ? bundle.models[id] : undefined;
  if (!model || history.length < 3) return null;
  const [a, b, c] = history.slice(-3);
  const gap2 = (b.t - a.t) / 60_000;
  const gap1 = (c.t - b.t) / 60_000;
  const domain = model.trainingDomain ?? bundle.trainingDomain;
  const [gLo, gHi] = domain.gapMinutes;
  const [eLo, eHi] = domain.elapsedMinutes;
  const inDomain = gap1 >= gLo && gap1 <= gHi && gap2 >= gLo && gap2 <= gHi && elapsedMin >= eLo && elapsedMin <= eHi;
  const prediction = predict(model, [a.v, b.v, c.v, gap2, gap1, elapsedMin]);
  const q = model.conformal[level];
  return { prediction, low: prediction - q, high: prediction + q, inDomain, level };
}

let cache: Promise<ModelBundle | null> | null = null;
export function loadModels(): Promise<ModelBundle | null> {
  cache ??= fetch(`${import.meta.env.BASE_URL}models/vitals-models.json`)
    .then((r) => (r.ok ? (r.json() as Promise<ModelBundle>) : null))
    .catch(() => null);
  return cache;
}
