// Simulated wearable stream. Physiology-inspired mean-reverting dynamics with scenario
// perturbations, so the live monitor has realistic-looking behaviour to detect.
// Clearly labelled as simulation everywhere it appears.
import { mulberry32 } from './demo.ts';

export type Scenario = 'rest' | 'exercise' | 'fever' | 'orthostatic' | 'dropout';
export const SCENARIOS: { id: Scenario; label: string; detail: string }[] = [
  { id: 'rest', label: 'Resting', detail: 'Quiet baseline physiology.' },
  { id: 'exercise', label: 'Exercise session', detail: 'Treadmill / resistance session: heart rate and systolic pressure rise, then recover.' },
  { id: 'fever', label: 'Fever onset', detail: 'Temperature climbs over ~2 h with a heart-rate response.' },
  { id: 'orthostatic', label: 'Orthostatic stress', detail: 'Sudden heart-rate rise and pressure drop, like standing after gravity transition.' },
  { id: 'dropout', label: 'Sensor dropout', detail: 'Wearable loses contact for 15 min, signal quality check.' },
];

export type Vitals = { heartRate: number; systolic: number; diastolic: number; temperature: number };
export type Sample = { t: number; signal: 'ok' | 'lost'; values: Partial<Vitals>; activity: 'rest' | 'active' };

export type SimState = {
  t: number; // simulated epoch ms
  x: Vitals;
  base: Vitals;
  scenario: Scenario;
  scenarioStart: number;
  rand: () => number;
};

export function createSim(base: Vitals, start = Date.now(), seed = 42): SimState {
  return { t: start, x: { ...base }, base: { ...base }, scenario: 'rest', scenarioStart: start, rand: mulberry32(seed) };
}

function gauss(rand: () => number) {
  const u = Math.max(rand(), 1e-9), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function offsets(s: Scenario, m: number): Vitals {
  const z = { heartRate: 0, systolic: 0, diastolic: 0, temperature: 0 };
  if (m < 0) return z;
  if (s === 'exercise') {
    const on = m <= 40 ? Math.min(1, m / 8) : Math.exp(-(m - 40) / 12);
    return { heartRate: 48 * on, systolic: 30 * on, diastolic: 4 * on, temperature: 0.5 * (m <= 40 ? Math.min(1, m / 30) : Math.exp(-(m - 40) / 40)) };
  }
  if (s === 'fever') {
    const k = 1 - Math.exp(-m / 55);
    return { heartRate: 20 * k, systolic: -3 * k, diastolic: -2 * k, temperature: 1.9 * k };
  }
  if (s === 'orthostatic') {
    const k = Math.exp(-m / 25);
    return { heartRate: 34 * k, systolic: -30 * k, diastolic: -12 * k, temperature: 0 };
  }
  return z;
}

const PULL: Vitals = { heartRate: 0.6, systolic: 0.45, diastolic: 0.45, temperature: 0.35 };
const NOISE: Vitals = { heartRate: 1.5, systolic: 2.4, diastolic: 1.7, temperature: 0.03 };

export function step(state: SimState, dtMin = 5): Sample {
  state.t += dtMin * 60_000;
  const m = (state.t - state.scenarioStart) / 60_000;
  const off = offsets(state.scenario, m);
  (Object.keys(state.x) as (keyof Vitals)[]).forEach((k) => {
    const target = state.base[k] + off[k];
    state.x[k] += (target - state.x[k]) * PULL[k] + gauss(state.rand) * NOISE[k];
  });
  // accelerometer channel: wearables confirm physical activity independently of heart rate
  const activity: Sample['activity'] = state.scenario === 'exercise' && m >= 0 && m <= 45 ? 'active' : 'rest';
  if (state.scenario === 'dropout' && m > 0 && m <= 15) return { t: state.t, signal: 'lost', values: {}, activity };
  if (state.scenario === 'dropout' && m > 15) state.scenario = 'rest';
  return {
    t: state.t,
    signal: 'ok',
    activity,
    values: {
      heartRate: Math.round(state.x.heartRate),
      systolic: Math.round(state.x.systolic),
      diastolic: Math.round(Math.min(state.x.diastolic, state.x.systolic - 15)),
      temperature: Number(state.x.temperature.toFixed(2)),
    },
  };
}

export function setScenario(state: SimState, s: Scenario) {
  state.scenario = s;
  state.scenarioStart = state.t;
}
