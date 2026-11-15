// Deterministic fictional demo crew. Every record is labelled source:'simulated'.
// Each crew member carries a small "story" so the monitoring layers have something to find.
import type { Reading } from './monitoring.ts';

export type Profile = { id: string; name: string; role: string; initials: string; color: number; demo?: boolean };

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand: () => number) {
  const u = Math.max(rand(), 1e-9), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const DEMO_PROFILES: Profile[] = [
  { id: 'demo-calder', name: 'Rhea Calder', role: 'Commander', initials: 'RC', color: 0, demo: true },
  { id: 'demo-ilunga', name: 'Tomas Ilunga', role: 'Crew medical officer', initials: 'TI', color: 1, demo: true },
  { id: 'demo-sakamoto', name: 'Mei Sakamoto', role: 'Flight engineer', initials: 'MS', color: 2, demo: true },
  { id: 'demo-vale', name: 'Arjun Vale', role: 'Mission specialist', initials: 'AV', color: 3, demo: true },
];

type Base = { heartRate: number; systolic: number; diastolic: number; temperature: number; sleep: number; mood: number; glucose: number };
const BASES: Record<string, Base> = {
  'demo-calder': { heartRate: 57, systolic: 112, diastolic: 71, temperature: 36.6, sleep: 7.4, mood: 4, glucose: 86 },
  'demo-ilunga': { heartRate: 63, systolic: 117, diastolic: 75, temperature: 36.7, sleep: 7.3, mood: 4, glucose: 90 },
  'demo-sakamoto': { heartRate: 60, systolic: 109, diastolic: 69, temperature: 36.5, sleep: 7.6, mood: 4, glucose: 84 },
  'demo-vale': { heartRate: 66, systolic: 119, diastolic: 76, temperature: 36.6, sleep: 7.0, mood: 4, glucose: 92 },
};

export const DEMO_DAYS = 30;

export function demoRecords(now = new Date(), mission = 'Mars transit', seed = 20261115): Reading[] {
  const out: Reading[] = [];
  DEMO_PROFILES.forEach((p, pi) => {
    const rand = mulberry32(seed + pi * 7919);
    const b = BASES[p.id];
    for (let d = 0; d < DEMO_DAYS; d++) {
      const daysAgo = DEMO_DAYS - 1 - d;
      const t = new Date(now);
      t.setUTCDate(t.getUTCDate() - daysAgo);
      t.setUTCHours(7, Math.floor(rand() * 50), 0, 0);
      if (t.getTime() > now.getTime()) t.setTime(now.getTime() - 3_600_000);
      const late = d - (DEMO_DAYS - 12); // >0 during the last 12 days
      let hr = b.heartRate + gauss(rand) * 2.2;
      let sys = b.systolic + gauss(rand) * 3;
      let dia = b.diastolic + gauss(rand) * 2.2;
      let temp = b.temperature + gauss(rand) * 0.12;
      let sleep = b.sleep + gauss(rand) * 0.35;
      let mood = b.mood + (rand() < 0.15 ? (rand() < 0.5 ? -1 : 1) : 0);
      let symptoms = '';

      if (p.id === 'demo-ilunga' && late > 0) {
        // isolation story: slow sleep erosion and mood dip
        sleep -= late * 0.16;
        if (late > 6) mood = 3;
        if (late > 10) mood = 2;
        if (d === DEMO_DAYS - 1) symptoms = 'Trouble falling asleep, feeling tired and a bit isolated';
      }
      if (p.id === 'demo-sakamoto' && d >= DEMO_DAYS - 2) {
        // infection story: fever onset over the last two days
        const k = d - (DEMO_DAYS - 3);
        temp = b.temperature + [0, 1.1, 1.8][k];
        hr = b.heartRate + [0, 11, 22][k];
        sleep -= 1.1;
        if (d === DEMO_DAYS - 1) symptoms = 'Headache, chills and sore throat since last night';
      }
      if (p.id === 'demo-vale' && late > 0) {
        // fluid-shift story: blood pressure creeping up
        sys += late * 1.25;
        dia += late * 0.75;
        if (d === DEMO_DAYS - 1) symptoms = 'Mild headache and facial puffiness in the morning';
      }

      const r: Reading = {
        id: `demo-${p.id.slice(5)}-${d}`,
        profile: p.id,
        timestamp: t.toISOString(),
        source: 'simulated',
        sync: 'demo',
        mission,
        symptoms,
        glucoseContext: '',
        heartRate: Math.round(hr),
        systolic: Math.round(sys),
        diastolic: Math.round(dia),
        temperature: Number(temp.toFixed(1)),
        sleep: Number(Math.max(2, sleep).toFixed(1)),
        mood: Math.min(5, Math.max(1, Math.round(mood))),
      };
      if (d % 3 === 0) {
        r.glucose = Math.round(b.glucose + gauss(rand) * 5);
        r.glucoseContext = 'Fasting, morning, finger-stick meter';
      }
      out.push(r);
    }
  });
  return out;
}
