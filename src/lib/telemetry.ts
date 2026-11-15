// Continuous crew telemetry engine (simulated wearables).
// Runs every crew member at once, checks each sample against (a) the conformal band of the
// PhysioNet forecast models and (b) reference ranges, raises de-duplicated events, and
// detects exercise sessions from heart rate so they can be logged without manual entry.
import { createSim, setScenario as simSetScenario, step, type Scenario, type SimState, type Vitals } from './simulator.ts';
import { forecastNext, type ModelBundle } from './models.ts';
import { referenceSeverity, VITALS, type MetricKey } from './monitoring.ts';
import { mulberry32 } from './demo.ts';

export const LIVE_KEYS = ['heartRate', 'systolic', 'diastolic', 'temperature'] as const;
export type LiveKey = (typeof LIVE_KEYS)[number];
export const TICK_SIM_MIN = 5;
export const HISTORY = 72; // 6 simulated hours

export type TelemetryPoint = {
  t: number; // simulated time, ms
  values: Partial<Record<LiveKey, number>>;
  band: Partial<Record<LiveKey, [number, number]>>;
  flags: LiveKey[]; // outside the model band
  signal: 'ok' | 'lost';
};

export type TelemetryEvent = {
  key: string; // de-duplication key
  profile: string;
  simT: number;
  kind: 'model' | 'reference' | 'signal' | 'exercise';
  severity: 'info' | 'watch' | 'alert';
  metric?: LiveKey;
  title: string;
  detail: string;
  session?: { minutes: number; avgHr: number; peakHr: number; type: 'treadmill' | 'cycle' };
};

export type CrewStream = {
  profile: string;
  sim: SimState;
  base: Vitals;
  history: TelemetryPoint[];
  out: Record<string, boolean>;
  refRank: Partial<Record<LiveKey, number>>;
  exercise?: { startT: number; hrs: number[]; calm: number };
  scenarioTicks: number;
  autoplay: boolean;
  nextWorkout: number; // ticks until the scheduled workout
  sleepEstimate: number;
  seeded?: boolean;
};

const fmt = (k: LiveKey, v: number) => `${v.toFixed(VITALS[k].decimals)} ${VITALS[k].unit}`;

export class TelemetryEngine {
  streams = new Map<string, CrewStream>();
  bundle: ModelBundle | null;
  private startT: number;
  private rand: () => number;
  constructor(bundle: ModelBundle | null, start = Date.now(), seed = 7) {
    this.bundle = bundle;
    this.startT = start;
    this.rand = mulberry32(seed);
  }

  ensure(profile: string, base: Vitals, sleep: number, opts: { autoplay?: boolean; offset?: number } = {}) {
    const existing = this.streams.get(profile);
    if (existing) return existing;
    const s: CrewStream = {
      profile,
      sim: createSim(base, this.startT - HISTORY * TICK_SIM_MIN * 60_000, profile.length * 31 + (opts.offset ?? 0)),
      base,
      history: [],
      out: {},
      refRank: {},
      scenarioTicks: 0,
      autoplay: opts.autoplay ?? true,
      nextWorkout: 30 + (opts.offset ?? 0) * 17,
      sleepEstimate: Number((sleep + (this.rand() - 0.5) * 0.4).toFixed(1)),
    };
    this.streams.set(profile, s);
    for (let i = 0; i < HISTORY; i++) this.advance(s, true); // silent warm-up
    return s;
  }

  remove(profile: string) { this.streams.delete(profile); }

  setScenario(profile: string, sc: Scenario) {
    const s = this.streams.get(profile);
    if (!s) return;
    simSetScenario(s.sim, sc);
    s.scenarioTicks = 0;
  }

  scenario(profile: string): Scenario { return this.streams.get(profile)?.sim.scenario ?? 'rest'; }

  tick(): TelemetryEvent[] {
    const events: TelemetryEvent[] = [];
    for (const s of this.streams.values()) events.push(...this.advance(s, false));
    return events;
  }

  latest(profile: string): TelemetryPoint | undefined {
    const h = this.streams.get(profile)?.history;
    return h ? [...h].reverse().find((p) => p.signal === 'ok') : undefined;
  }

  /** Mean of the last n valid samples (used to pre-fill check-ins). */
  average(profile: string, n = 6): Partial<Record<LiveKey, number>> {
    const h = (this.streams.get(profile)?.history ?? []).filter((p) => p.signal === 'ok').slice(-n);
    const out: Partial<Record<LiveKey, number>> = {};
    for (const k of LIVE_KEYS) {
      const v = h.map((p) => p.values[k]).filter((x): x is number => x !== undefined);
      if (v.length) out[k] = v.reduce((a, b) => a + b, 0) / v.length;
    }
    return out;
  }

  private advance(s: CrewStream, silent: boolean): TelemetryEvent[] {
    const ev: TelemetryEvent[] = [];
    // scheduled workouts make the demo self-running (and exercise auto-detection observable)
    if (s.autoplay) {
      s.nextWorkout -= 1;
      if (s.nextWorkout <= 0 && s.sim.scenario === 'rest') { simSetScenario(s.sim, 'exercise'); s.scenarioTicks = 0; s.nextWorkout = 70 + Math.floor(this.rand() * 40); }
    }
    s.scenarioTicks += 1;
    if (s.sim.scenario === 'exercise' && s.scenarioTicks > 18) { simSetScenario(s.sim, 'rest'); s.scenarioTicks = 0; }
    if (s.sim.scenario === 'orthostatic' && s.scenarioTicks > 14) { simSetScenario(s.sim, 'rest'); s.scenarioTicks = 0; }

    const sample = step(s.sim, TICK_SIM_MIN);
    const point: TelemetryPoint = { t: sample.t, values: {}, band: {}, flags: [], signal: sample.signal };
    const emit = (e: Omit<TelemetryEvent, 'profile' | 'simT'>) => { if (!silent) ev.push({ ...e, profile: s.profile, simT: sample.t }); };

    if (sample.signal === 'lost' && !s.out.signal) emit({ key: `${s.profile}:signal`, kind: 'signal', severity: 'watch', title: 'Wearable signal lost', detail: 'No valid samples from the wearable. Readings are paused, not assumed normal. Check sensor contact.' });
    if (sample.signal === 'ok' && s.out.signal) emit({ key: `${s.profile}:signal-ok`, kind: 'signal', severity: 'info', title: 'Wearable signal restored', detail: 'Valid samples are being received again.' });
    s.out.signal = sample.signal === 'lost';

    if (sample.signal === 'ok') {
      const elapsed = 600 + (sample.t - s.history[0]?.t || 0) / 60_000;
      for (const k of LIVE_KEYS) {
        const v = sample.values[k];
        if (v === undefined) continue;
        point.values[k] = v;
        const hist = s.history.filter((p) => p.values[k] !== undefined).map((p) => ({ t: p.t, v: p.values[k]! }));
        const fc = this.bundle ? forecastNext(this.bundle, k as MetricKey, hist, Math.min(elapsed, this.bundle.trainingDomain.elapsedMinutes[1]), 'q90') : null;
        if (fc) {
          point.band[k] = [fc.low, fc.high];
          const outside = v < fc.low || v > fc.high;
          if (outside) point.flags.push(k);
          if (outside && !s.out[`m-${k}`] && sample.activity !== 'active')
            emit({ key: `${s.profile}:model:${k}`, kind: 'model', severity: 'watch', metric: k, title: `Unexpected change in ${VITALS[k].label.toLowerCase()}`, detail: `${fmt(k, v)} is outside the model's 90% expected range (${fc.low.toFixed(VITALS[k].decimals)} to ${fc.high.toFixed(VITALS[k].decimals)}).` });
          s.out[`m-${k}`] = outside;
        }
        // reference limits: alarm on entry and on escalation (watch -> alert), not on every sample;
        // heart-rate / systolic rises during accelerometer-confirmed activity are expected
        const ref = referenceSeverity(k as MetricKey, v);
        const rank = ref.severity === 'alert' ? 2 : ref.severity === 'watch' ? 1 : 0;
        const exertional = (sample.activity === 'active' || s.exercise) && (k === 'heartRate' || k === 'systolic');
        if (rank > (s.refRank[k] ?? 0) && !exertional)
          emit({ key: `${s.profile}:ref:${k}:${ref.severity}`, kind: 'reference', severity: ref.severity as 'watch' | 'alert', metric: k, title: `${VITALS[k].label} ${ref.text}`, detail: `Wearable reading ${fmt(k, v)}. ${VITALS[k].refText}` });
        if (!exertional || rank === 0) s.refRank[k] = rank;
      }
      // exercise detection: sustained heart-rate elevation above the resting base
      const hr = sample.values.heartRate;
      if (hr !== undefined) {
        const up = hr > s.base.heartRate + 25;
        if (!s.exercise && up) {
          const prevUp = (s.history.at(-1)?.values.heartRate ?? 0) > s.base.heartRate + 25;
          if (prevUp) s.exercise = { startT: s.history.at(-1)!.t, hrs: [s.history.at(-1)!.values.heartRate!, hr], calm: 0 };
        } else if (s.exercise) {
          s.exercise.hrs.push(hr);
          s.exercise.calm = hr < s.base.heartRate + 12 ? s.exercise.calm + 1 : 0;
          if (s.exercise.calm >= 2) {
            const minutes = (sample.t - s.exercise.startT) / 60_000;
            const active = s.exercise.hrs.slice(0, -2);
            const avgHr = Math.round(active.reduce((a, b) => a + b, 0) / Math.max(1, active.length));
            const peakHr = Math.max(...active);
            if (minutes >= 15)
              emit({ key: `${s.profile}:exercise:${s.exercise.startT}`, kind: 'exercise', severity: 'info', title: 'Exercise session detected and logged', detail: `${Math.round(minutes)} min with average heart rate ${avgHr} bpm (peak ${peakHr}).`, session: { minutes: Math.round(minutes), avgHr, peakHr, type: peakHr > s.base.heartRate + 40 ? 'treadmill' : 'cycle' } });
            s.exercise = undefined;
          }
        }
      }
    }
    s.history = [...s.history, point].slice(-HISTORY);
    return ev;
  }
}
