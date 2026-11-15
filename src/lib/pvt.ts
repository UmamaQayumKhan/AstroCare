// Psychomotor Vigilance Test (PVT) scoring.
// Brief 3-minute version (PVT-B) per Basner & Dinges (2011): random inter-stimulus
// interval 2-5 s, lapse = response time ≥ 355 ms, false start = response < 100 ms or
// before the stimulus. A PVT ("Reaction Self Test") has been used aboard the ISS to
// track fatigue. Here it is a self-monitoring tool, not a fitness-for-duty decision.

export const LAPSE_MS = 355;
export const FALSE_START_MS = 100;
export const ISI_RANGE_MS: [number, number] = [2000, 5000];
export const DURATION_OPTIONS = [60, 180] as const;

export type PvtResult = {
  id: string;
  profile: string;
  timestamp: string;
  source: 'test' | 'simulated';
  durationSec: number;
  stimuli: number;
  meanRT: number;
  medianRT: number;
  fastest10: number; // mean of fastest 10% RTs
  lapses: number;
  falseStarts: number;
  meanSpeed: number; // mean of 1000/RT (responses per second)
  performance: number; // 1 − (lapses + false starts) / stimuli
};

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** rts: valid response times in ms (≥ FALSE_START_MS). falseStarts: anticipations counted separately. */
export function scorePvt(rts: number[], falseStarts: number, durationSec: number, meta: Pick<PvtResult, 'id' | 'profile' | 'timestamp' | 'source'>): PvtResult {
  const valid = rts.filter((r) => r >= FALSE_START_MS);
  const stimuli = valid.length + falseStarts;
  const lapses = valid.filter((r) => r >= LAPSE_MS).length;
  const sorted = [...valid].sort((a, b) => a - b);
  const k = Math.max(1, Math.round(sorted.length * 0.1));
  return {
    ...meta,
    durationSec,
    stimuli,
    meanRT: Math.round(mean(valid)),
    medianRT: Math.round(median(valid)),
    fastest10: Math.round(mean(sorted.slice(0, k))),
    lapses,
    falseStarts,
    meanSpeed: Number(mean(valid.map((r) => 1000 / r)).toFixed(3)),
    performance: stimuli ? Number((1 - (lapses + falseStarts) / stimuli).toFixed(3)) : 0,
  };
}

export type PvtAssessment = { severity: 'nominal' | 'watch' | 'alert'; text: string; baselineSpeed?: number; change?: number };

/** Compare a result to the person's own earlier tests (median speed of up to 5 earliest). */
export function assessPvt(result: PvtResult, history: PvtResult[]): PvtAssessment {
  const prior = history
    .filter((h) => h.profile === result.profile && h.id !== result.id && h.timestamp < result.timestamp)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(0, 5);
  const lapseRate = result.stimuli ? result.lapses / result.stimuli : 0;
  let severity: PvtAssessment['severity'] = lapseRate >= 0.2 ? 'alert' : lapseRate >= 0.1 ? 'watch' : 'nominal';
  const parts = [`${result.lapses} lapse${result.lapses === 1 ? '' : 's'} in ${result.stimuli} stimuli`, `median RT ${result.medianRT} ms`];
  if (prior.length >= 2) {
    const baselineSpeed = median(prior.map((p) => p.meanSpeed));
    const change = (result.meanSpeed - baselineSpeed) / baselineSpeed;
    if (change <= -0.2) severity = 'alert';
    else if (change <= -0.1 && severity === 'nominal') severity = 'watch';
    parts.push(`response speed ${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}% vs personal baseline`);
    return { severity, text: parts.join(' · '), baselineSpeed, change };
  }
  parts.push('baseline builds after 2 tests');
  return { severity, text: parts.join(' · ') };
}

export function randomIsi(rand: () => number = Math.random) {
  return ISI_RANGE_MS[0] + rand() * (ISI_RANGE_MS[1] - ISI_RANGE_MS[0]);
}
