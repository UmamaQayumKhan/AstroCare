// Deterministic demo data for the performance and logistics modules.
// Continues each demo crew member's story (see demo.ts).
import { DEMO_DAYS, DEMO_PROFILES, mulberry32 } from './demo.ts';
import { scorePvt, type PvtResult } from './pvt.ts';
import type { ExerciseSession, ExerciseType } from './exercise.ts';
import type { DispenseEvent, SupplyItem } from './inventory.ts';

function gauss(rand: () => number) {
  const u = Math.max(rand(), 1e-9), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const PVT_BASE: Record<string, number> = { 'demo-calder': 238, 'demo-ilunga': 252, 'demo-sakamoto': 246, 'demo-vale': 258 };

export function demoPvt(now = new Date(), seed = 777): PvtResult[] {
  const out: PvtResult[] = [];
  DEMO_PROFILES.forEach((p, pi) => {
    const rand = mulberry32(seed + pi * 131);
    for (let d = 1; d < DEMO_DAYS; d += 3) {
      const t = new Date(now);
      t.setUTCDate(t.getUTCDate() - (DEMO_DAYS - 1 - d));
      t.setUTCHours(8, 15, 0, 0);
      if (t.getTime() > now.getTime()) t.setTime(now.getTime() - 2 * 3_600_000);
      const late = d - (DEMO_DAYS - 12);
      let base = PVT_BASE[p.id];
      let lapseP = 0.02;
      if (p.id === 'demo-ilunga' && late > 0) { base += late * 7; lapseP += late * 0.012; }
      if (p.id === 'demo-sakamoto' && d >= DEMO_DAYS - 2) { base += 45; lapseP = 0.12; }
      const rts: number[] = [];
      let falseStarts = 0;
      for (let i = 0; i < 52; i++) {
        if (rand() < 0.015) { falseStarts++; continue; }
        rts.push(rand() < lapseP ? 360 + rand() * 420 : Math.round(base * Math.exp(gauss(rand) * 0.13)));
      }
      out.push(scorePvt(rts, falseStarts, 180, { id: `pvt-${p.id.slice(5)}-${d}`, profile: p.id, timestamp: t.toISOString(), source: 'simulated' }));
    }
  });
  return out;
}

export function demoExercise(now = new Date(), seed = 4242): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  DEMO_PROFILES.forEach((p, pi) => {
    const rand = mulberry32(seed + pi * 17);
    for (let d = 0; d < DEMO_DAYS; d++) {
      const late = d - (DEMO_DAYS - 12);
      let skip = 0.12;
      if (p.id === 'demo-calder') skip = 0.06;
      if (p.id === 'demo-vale' && late > 0) skip = 0.55;
      if (p.id === 'demo-ilunga' && late > 4) skip = 0.3;
      if (p.id === 'demo-sakamoto' && d >= DEMO_DAYS - 2) skip = 1;
      const base = new Date(now);
      base.setUTCDate(base.getUTCDate() - (DEMO_DAYS - 1 - d));
      const plan: [ExerciseType, number, number][] = [['resistance', 60, 10], [d % 2 ? 'cycle' : 'treadmill', 35, 6]];
      plan.forEach(([type, minutes, hour], si) => {
        if (rand() < skip) return;
        const t = new Date(base);
        t.setUTCHours(hour, Math.floor(rand() * 40), 0, 0);
        if (t.getTime() > now.getTime()) return;
        out.push({
          id: `ex-${p.id.slice(5)}-${d}-${si}`, profile: p.id, timestamp: t.toISOString(), type,
          minutes: Math.round(minutes * (0.85 + rand() * 0.3)), effort: rand() < 0.3 ? 4 : 3,
          avgHr: type === 'resistance' ? Math.round(105 + rand() * 15) : Math.round(130 + rand() * 20), source: 'simulated',
        });
      });
    }
  });
  return out;
}

export function demoInventory(missionStart: Date): { items: SupplyItem[]; events: DispenseEvent[] } {
  const day = (n: number) => new Date(missionStart.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const items: SupplyItem[] = [
    { id: 'analgesic', name: 'Analgesic / antipyretic tablets', category: 'Medication', unit: 'tablets', quantity: 0, initialQuantity: 160, plannedPerWeek: 3, expires: day(540), critical: true, location: 'Med kit A1' },
    { id: 'sleep-aid', name: 'Sleep-aid tablets', category: 'Medication', unit: 'tablets', quantity: 0, initialQuantity: 120, plannedPerWeek: 2, expires: day(400), critical: false, location: 'Med kit A2' },
    { id: 'antiemetic', name: 'Anti-nausea (motion sickness) tablets', category: 'Medication', unit: 'tablets', quantity: 0, initialQuantity: 60, plannedPerWeek: 1, expires: day(380), critical: true, location: 'Med kit A2' },
    { id: 'antihistamine', name: 'Antihistamine tablets', category: 'Medication', unit: 'tablets', quantity: 0, initialQuantity: 80, plannedPerWeek: 1, expires: day(500), critical: false, location: 'Med kit A3' },
    { id: 'decongestant', name: 'Nasal decongestant spray', category: 'Medication', unit: 'bottles', quantity: 0, initialQuantity: 8, plannedPerWeek: 0.15, expires: day(150), critical: false, location: 'Med kit A3' },
    { id: 'antibiotic', name: 'Broad-spectrum antibiotic course', category: 'Medication', unit: 'courses', quantity: 0, initialQuantity: 10, plannedPerWeek: 0.05, expires: day(450), critical: true, location: 'Med kit B1' },
    { id: 'eye-drops', name: 'Lubricating eye drops', category: 'Medication', unit: 'vials', quantity: 0, initialQuantity: 40, plannedPerWeek: 0.8, expires: day(300), critical: false, location: 'Med kit B2' },
    { id: 'ors', name: 'Oral rehydration salts', category: 'Fluids', unit: 'sachets', quantity: 0, initialQuantity: 60, plannedPerWeek: 0.5, expires: day(600), critical: true, location: 'Fluids bay' },
    { id: 'saline', name: 'IV saline 0.9% (500 mL)', category: 'Fluids', unit: 'bags', quantity: 0, initialQuantity: 12, plannedPerWeek: 0.05, expires: day(700), critical: true, location: 'Fluids bay' },
    { id: 'strips', name: 'Blood glucose test strips', category: 'Diagnostics', unit: 'strips', quantity: 0, initialQuantity: 400, plannedPerWeek: 10, expires: day(320), critical: false, location: 'Diagnostics drawer' },
    { id: 'probe-covers', name: 'Thermometer probe covers', category: 'Diagnostics', unit: 'covers', quantity: 0, initialQuantity: 500, plannedPerWeek: 30, expires: day(900), critical: false, location: 'Diagnostics drawer' },
    { id: 'dressings', name: 'Sterile wound dressings', category: 'Wound care', unit: 'packs', quantity: 0, initialQuantity: 80, plannedPerWeek: 0.5, expires: day(800), critical: true, location: 'Trauma kit' },
    { id: 'sutures', name: 'Skin closure / suture kit', category: 'Wound care', unit: 'kits', quantity: 0, initialQuantity: 6, plannedPerWeek: 0.02, expires: day(900), critical: true, location: 'Trauma kit' },
    { id: 'gloves', name: 'Nitrile examination gloves', category: 'Protective', unit: 'pairs', quantity: 0, initialQuantity: 600, plannedPerWeek: 12, expires: day(1000), critical: false, location: 'Protective bin' },
  ];
  // observed usage over the demo days (deterministic); tells the same stories as the vitals
  const rate: Record<string, (d: number) => number> = {
    analgesic: (d) => (d >= DEMO_DAYS - 3 ? 4 : d % 3 === 0 ? 1 : 0) + (d > DEMO_DAYS - 12 && d % 2 === 0 ? 1 : 0),
    'sleep-aid': (d) => (d > DEMO_DAYS - 14 ? 1 : 0) + (d % 2 === 0 ? 1 : 0),
    antiemetic: (d) => (d < 3 ? 2 : 0),
    antihistamine: (d) => (d % 9 === 0 ? 1 : 0),
    decongestant: (d) => (d === 6 || d === 20 ? 1 : 0),
    'eye-drops': (d) => (d % 7 === 0 ? 1 : 0),
    ors: (d) => (d >= DEMO_DAYS - 2 ? 2 : 0),
    strips: (d) => (d % 3 === 0 ? 4 : 0),
    'probe-covers': (d) => 4 + (d >= DEMO_DAYS - 2 ? 3 : 0),
    dressings: (d) => (d === 11 ? 2 : 0),
    gloves: () => 2,
  };
  const events: DispenseEvent[] = [];
  for (const item of items) {
    let used = 0;
    for (let d = 0; d < DEMO_DAYS; d++) {
      const n = rate[item.id]?.(d) ?? 0;
      if (!n) continue;
      used += n;
      events.push({ id: `disp-${item.id}-${d}`, itemId: item.id, timestamp: new Date(missionStart.getTime() + d * 86_400_000 + 9 * 3_600_000).toISOString(), amount: n });
    }
    item.quantity = Math.max(0, item.initialQuantity - used);
  }
  return { items, events };
}
