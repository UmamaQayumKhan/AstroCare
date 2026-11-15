import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assess, mad, median, personalBaseline, referenceSeverity, symptomSeverity, theilSen, type Reading } from '../src/lib/monitoring.ts';
import { demoRecords, DEMO_PROFILES, mulberry32 } from '../src/lib/demo.ts';
import { parseI4, changeMatrix, timepointDay } from '../src/lib/i4.ts';
import { createSim, setScenario, step } from '../src/lib/simulator.ts';
import { cumulativeDose, missionProfile, missionDay } from '../src/lib/mission.ts';

const NOW = new Date('2026-11-15T12:00:00Z');

test('robust statistics', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(mad([1, 1, 2, 2, 4, 6, 9]), 1);
  const t = theilSen([0, 1, 2, 3].map((d) => ({ t: d * 86_400_000, v: 10 - d })));
  assert.equal(t.slope, -1);
  assert.equal(t.consistency, 1);
});

test('reference ranges follow cited thresholds', () => {
  assert.equal(referenceSeverity('temperature', 38.2).severity, 'alert');
  assert.equal(referenceSeverity('temperature', 37.6).severity, 'watch');
  assert.equal(referenceSeverity('temperature', 36.8).severity, 'nominal');
  assert.equal(referenceSeverity('systolic', 135).severity, 'watch');
  assert.equal(referenceSeverity('systolic', 142).severity, 'alert');
  assert.equal(referenceSeverity('heartRate', 55).severity, 'nominal'); // fit astronauts rest low
  assert.equal(referenceSeverity('glucose', 65).severity, 'alert');
});

test('symptom routing', () => {
  assert.equal(symptomSeverity('Sudden chest pain and shortness of breath'), 'alert');
  assert.equal(symptomSeverity('mild headache'), 'watch');
  assert.equal(symptomSeverity('ate breakfast'), 'info');
  assert.equal(symptomSeverity(''), 'nominal');
});

test('personal baseline needs 5 readings and excludes the assessed one', () => {
  const rows: Reading[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), profile: 'p', timestamp: `2026-11-0${i + 1}T08:00:00Z`, source: 'manual', heartRate: 60 + (i % 2) }));
  assert.equal(personalBaseline(rows.slice(0, 4), 'heartRate'), undefined);
  const b = personalBaseline(rows, 'heartRate', '5')!;
  assert.equal(b.n, 5);
  assert.ok(b.spread >= 3, 'floor spread applied');
});

test('demo data is deterministic, fictional and simulated', () => {
  const a = demoRecords(NOW), b = demoRecords(NOW);
  assert.deepEqual(a, b);
  assert.equal(a.length, DEMO_PROFILES.length * 30);
  assert.ok(a.every((r) => r.source === 'simulated' && Date.parse(r.timestamp) <= NOW.getTime()));
});

test('monitoring catches every demo story and leaves the healthy commander nominal', () => {
  const rows = demoRecords(NOW);
  const now = NOW.getTime();
  const calder = assess('demo-calder', rows, now);
  const ilunga = assess('demo-ilunga', rows, now);
  const sakamoto = assess('demo-sakamoto', rows, now);
  const vale = assess('demo-vale', rows, now);
  assert.ok(['nominal', 'info'].includes(calder.status), `commander should be calm, got ${calder.status}: ${calder.findings.map((f) => f.title).join('; ')}`);
  assert.ok(ilunga.findings.some((f) => f.metric === 'sleep' && f.kind === 'trend'), 'sleep decline trend detected');
  assert.equal(sakamoto.status, 'alert');
  assert.ok(sakamoto.findings.some((f) => f.metric === 'temperature' && f.severity === 'alert'), 'fever detected');
  assert.ok(vale.findings.some((f) => f.metric === 'systolic' && (f.kind === 'trend' || f.kind === 'reference')), 'BP rise detected');
});

test('Inspiration4 parser reads the real NASA file', async () => {
  const text = await readFile(new URL('../public/nasa-osd-575-cmp.csv', import.meta.url), 'utf8');
  const d = parseI4(text);
  assert.deepEqual(d.crews, ['C001', 'C002', 'C003', 'C004']);
  assert.deepEqual(d.timepoints, ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194']);
  assert.equal(d.samples.length, 28);
  assert.ok(!d.analytes.some((a) => a.id === 'egfr_african_american'), 'race-based eGFR excluded');
  const glu = d.analytes.find((a) => a.id === 'glucose')!;
  assert.equal(glu.refMin, 65);
  assert.equal(glu.refMax, 99);
  assert.equal(timepointDay('R+1'), 4);
  const m = changeMatrix(d);
  assert.equal(m.length, d.analytes.length);
});

test('simulator: exercise raises heart rate, dropout reports lost signal', () => {
  const s = createSim({ heartRate: 60, systolic: 115, diastolic: 75, temperature: 36.7 }, 0, 1);
  for (let i = 0; i < 10; i++) step(s);
  setScenario(s, 'exercise');
  let peak = 0;
  for (let i = 0; i < 6; i++) peak = Math.max(peak, step(s).values.heartRate ?? 0);
  assert.ok(peak > 90, `peak ${peak}`);
  setScenario(s, 'dropout');
  assert.equal(step(s).signal, 'lost');
});

test('mission maths', () => {
  assert.ok(Math.abs(cumulativeDose(missionProfile('Mars transit'), 180) - 331.2) < 1e-9);
  assert.equal(missionDay(new Date(NOW.getTime() - 2.5 * 86_400_000).toISOString(), NOW.getTime()), 3);
  assert.equal(mulberry32(1)(), mulberry32(1)());
});
