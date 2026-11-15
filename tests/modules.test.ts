import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessPvt, LAPSE_MS, scorePvt, type PvtResult } from '../src/lib/pvt.ts';
import { weeklyCompliance, type ExerciseSession } from '../src/lib/exercise.ts';
import { deficit, project, type SupplyItem } from '../src/lib/inventory.ts';
import { demoExercise, demoInventory, demoPvt } from '../src/lib/demoExtras.ts';
import { sourceAnswer } from '../src/rag.mjs';

const NOW = new Date('2026-11-15T12:00:00Z');
const meta = (id: string, ts: string) => ({ id, profile: 'p', timestamp: ts, source: 'test' as const });

test('PVT scoring follows PVT-B definitions', () => {
  const r = scorePvt([220, 240, 260, LAPSE_MS, 600, 50], 1, 180, meta('a', '2026-11-01T08:00:00Z'));
  assert.equal(r.lapses, 2, 'responses >= 355 ms are lapses');
  assert.equal(r.stimuli, 6, '5 valid responses + 1 false start; the 50 ms response is dropped as invalid');
  assert.equal(r.medianRT, 260);
  assert.equal(r.performance, Number((1 - 3 / 6).toFixed(3)));
});

test('PVT assessment compares with personal baseline', () => {
  const fast = (id: string, d: number): PvtResult => scorePvt(Array(40).fill(240), 0, 180, meta(id, `2026-11-0${d}T08:00:00Z`));
  const history = [fast('1', 1), fast('2', 2), fast('3', 3)];
  const slow = scorePvt(Array(40).fill(320), 0, 180, meta('4', '2026-11-04T08:00:00Z'));
  const a = assessPvt(slow, [...history, slow]);
  assert.equal(a.severity, 'alert', '25% slower than baseline');
  assert.ok(a.change! < -0.2);
  assert.equal(assessPvt(history[0], history).severity, 'nominal', 'first test has no baseline');
});

test('exercise compliance over the last 7 days', () => {
  const s = (d: number, type: ExerciseSession['type'], minutes: number): ExerciseSession => ({ id: `${d}${type}`, profile: 'p', timestamp: new Date(NOW.getTime() - d * 86_400_000).toISOString(), type, minutes, effort: 3, source: 'manual' });
  const full = [0, 1, 2, 3, 4, 5].flatMap((d) => [s(d, 'resistance', 60), s(d, 'treadmill', 35)]);
  const c = weeklyCompliance(full, 'p', undefined, NOW.getTime());
  assert.equal(c.resistanceMin, 360);
  assert.equal(c.aerobicMin, 210);
  assert.equal(c.activeDays, 6);
  assert.equal(c.severity, 'nominal');
  assert.equal(weeklyCompliance(full.slice(0, 4), 'p', undefined, NOW.getTime()).severity, 'alert');
  assert.equal(weeklyCompliance([s(9, 'cycle', 30)], 'p', undefined, NOW.getTime()).activeDays, 0, 'old sessions excluded');
});

test('supply projection flags shortfalls and expiry', () => {
  const start = NOW.getTime() - 9 * 86_400_000; // mission day 10
  const item: SupplyItem = { id: 'x', name: 'X', category: 'Medication', unit: 'tabs', quantity: 40, initialQuantity: 60, plannedPerWeek: 7, expires: new Date(start + 400 * 86_400_000).toISOString(), critical: true, location: '' };
  const planned = project(item, [], start, 100, NOW.getTime());
  assert.equal(planned.usageBasis, 'planned');
  assert.equal(planned.runOutDay, 50);
  assert.equal(planned.status, 'alert');
  assert.equal(deficit(item, planned, 100, 10), 50);
  const events = [1, 2, 3].map((d) => ({ id: String(d), itemId: 'x', amount: 1, timestamp: new Date(NOW.getTime() - d * 86_400_000).toISOString() }));
  const observed = project(item, events, start, 100, NOW.getTime());
  assert.equal(observed.usageBasis, 'observed');
  assert.ok(Math.abs(observed.usePerDay - 3 / 10) < 1e-9, 'rate over the 10 mission days so far');
  assert.equal(observed.shortfall, false);
  const expiring = project({ ...item, expires: new Date(start + 50 * 86_400_000).toISOString() }, events, start, 100, NOW.getTime());
  assert.equal(expiring.expiresBeforeEnd, true);
  assert.equal(expiring.status, 'watch');
});

test('demo performance and supply data tell the crew stories', () => {
  const pvt = demoPvt(NOW);
  const last = (id: string) => pvt.filter((x) => x.profile === id).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1)!;
  assert.equal(assessPvt(last('demo-ilunga'), pvt).severity, 'alert', 'sleep-deprived officer slows down');
  assert.equal(assessPvt(last('demo-calder'), pvt).severity, 'nominal');
  const ex = demoExercise(NOW);
  assert.equal(weeklyCompliance(ex, 'demo-calder', undefined, NOW.getTime()).severity, 'nominal');
  assert.notEqual(weeklyCompliance(ex, 'demo-vale', undefined, NOW.getTime()).severity, 'nominal', 'specialist skipping exercise');
  const start = new Date(NOW.getTime() - 29 * 86_400_000);
  const inv = demoInventory(start);
  const status = (id: string) => project(inv.items.find((i) => i.id === id)!, inv.events, start.getTime(), 210, NOW.getTime()).status;
  assert.equal(status('analgesic'), 'alert', 'analgesic spike during fever runs out before Mars');
  assert.equal(status('sleep-aid'), 'watch');
  assert.equal(status('saline'), 'nominal');
});

test('Nova answers questions about the new modules', async () => {
  const corpus = JSON.parse(await readFile(new URL('../public/knowledge-base.json', import.meta.url), 'utf8'));
  for (const [q, id] of [['What is the psychomotor vigilance test?', 'pvt-module'], ['How are exercise countermeasures tracked?', 'exercise-module'], ['How do you project supplies running out?', 'supplies-module'], ['What is in the flight surgeon report?', 'report-module']]) {
    const a = sourceAnswer(q, corpus);
    assert.ok(a.citations.some((c: { id: string }) => c.id === id), `${q} → ${a.citations.map((c: { id: string }) => c.id)}`);
  }
});
