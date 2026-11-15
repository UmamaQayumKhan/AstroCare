// Exercise countermeasure tracking. Weightlessness unloads bone and muscle; ISS crews
// follow a daily prescription of aerobic (treadmill / cycle) and resistive exercise.
// The weekly prescription below is configurable, ISS-style, and not a medical order.

export type ExerciseType = 'resistance' | 'treadmill' | 'cycle';
export type ExerciseSession = {
  id: string;
  profile: string;
  timestamp: string;
  type: ExerciseType;
  minutes: number;
  effort: 1 | 2 | 3 | 4 | 5; // perceived exertion, 1 easy - 5 maximal
  avgHr?: number;
  notes?: string;
  source: 'manual' | 'simulated' | 'wearable';
};

export const TYPE_LABEL: Record<ExerciseType, string> = { resistance: 'Resistive (ARED-style)', treadmill: 'Treadmill', cycle: 'Cycle ergometer' };
export const AEROBIC: ExerciseType[] = ['treadmill', 'cycle'];

export type Prescription = { resistanceMinPerWeek: number; aerobicMinPerWeek: number; activeDaysPerWeek: number };
export const DEFAULT_PRESCRIPTION: Prescription = { resistanceMinPerWeek: 360, aerobicMinPerWeek: 210, activeDaysPerWeek: 6 };

export type Compliance = {
  resistanceMin: number;
  aerobicMin: number;
  activeDays: number;
  resistancePct: number;
  aerobicPct: number;
  daysPct: number;
  overallPct: number;
  severity: 'nominal' | 'watch' | 'alert';
  daily: { day: string; resistance: number; aerobic: number }[];
};

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function weeklyCompliance(sessions: ExerciseSession[], profile: string, rx: Prescription = DEFAULT_PRESCRIPTION, now = Date.now()): Compliance {
  const from = now - 7 * 86_400_000;
  const mine = sessions.filter((s) => s.profile === profile && Date.parse(s.timestamp) > from && Date.parse(s.timestamp) <= now);
  const resistanceMin = mine.filter((s) => s.type === 'resistance').reduce((a, s) => a + s.minutes, 0);
  const aerobicMin = mine.filter((s) => AEROBIC.includes(s.type)).reduce((a, s) => a + s.minutes, 0);
  const activeDays = new Set(mine.map((s) => dayKey(Date.parse(s.timestamp)))).size;
  const pct = (v: number, t: number) => (t > 0 ? Math.min(1.5, v / t) : 1);
  const resistancePct = pct(resistanceMin, rx.resistanceMinPerWeek);
  const aerobicPct = pct(aerobicMin, rx.aerobicMinPerWeek);
  const daysPct = pct(activeDays, rx.activeDaysPerWeek);
  const overallPct = Math.min(1, (Math.min(1, resistancePct) + Math.min(1, aerobicPct) + Math.min(1, daysPct)) / 3);
  const severity = overallPct < 0.5 ? 'alert' : overallPct < 0.75 ? 'watch' : 'nominal';
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = dayKey(now - (6 - i) * 86_400_000);
    const ofDay = mine.filter((s) => dayKey(Date.parse(s.timestamp)) === d);
    return {
      day: d,
      resistance: ofDay.filter((s) => s.type === 'resistance').reduce((a, s) => a + s.minutes, 0),
      aerobic: ofDay.filter((s) => AEROBIC.includes(s.type)).reduce((a, s) => a + s.minutes, 0),
    };
  });
  return { resistanceMin, aerobicMin, activeDays, resistancePct, aerobicPct, daysPct, overallPct, severity, daily };
}
