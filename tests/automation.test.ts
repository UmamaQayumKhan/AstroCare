import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TelemetryEngine, HISTORY } from '../src/lib/telemetry.ts';
import { buildBrief } from '../src/lib/briefing.ts';
import { linkState, transmit, WINDOW_EVERY_MIN, WINDOW_LENGTH_MIN, type Packet } from '../src/lib/comms.ts';
import { assess } from '../src/lib/monitoring.ts';
import { demoRecords, DEMO_PROFILES } from '../src/lib/demo.ts';
import { demoPvt, demoExercise, demoInventory } from '../src/lib/demoExtras.ts';
import { weeklyCompliance } from '../src/lib/exercise.ts';
import { project } from '../src/lib/inventory.ts';
import type { ModelBundle } from '../src/lib/models.ts';

const bundle = JSON.parse(await readFile(new URL('../public/models/vitals-models.json', import.meta.url), 'utf8')) as ModelBundle;
const BASE = { heartRate: 62, systolic: 115, diastolic: 74, temperature: 36.6 };
const NOW = new Date('2026-11-15T12:00:00Z');

test('telemetry warms up silently and attaches model bands', () => {
  const e = new TelemetryEngine(bundle, 0, 1);
  const s = e.ensure('a', BASE, 7.2, { autoplay: false });
  assert.equal(s.history.length, HISTORY);
  const last = s.history.at(-1)!;
  assert.ok(last.band.heartRate, 'heart-rate band present');
  assert.ok(last.band.heartRate![0] < last.values.heartRate! && last.values.heartRate! < last.band.heartRate![1] + 20);
  assert.ok(Math.abs(e.average('a').heartRate! - BASE.heartRate) < 8);
});

test('fever raises a single reference alarm, not one per sample', () => {
  const e = new TelemetryEngine(bundle, 0, 2);
  e.ensure('a', BASE, 7, { autoplay: false });
  e.setScenario('a', 'fever');
  const events = Array.from({ length: 60 }, () => e.tick()).flat().filter((x) => x.kind === 'reference' && x.metric === 'temperature');
  assert.ok(events.length >= 1, 'temperature alarm raised');
  assert.equal(events.filter((x) => x.severity === 'alert').length, 1, 'fever-range alarm raised once while the condition persists');
});

test('orthostatic stress is caught as an unexpected change by the model band', () => {
  const e = new TelemetryEngine(bundle, 0, 3);
  e.ensure('a', BASE, 7, { autoplay: false });
  e.setScenario('a', 'orthostatic');
  const events = Array.from({ length: 4 }, () => e.tick()).flat();
  assert.ok(events.some((x) => x.kind === 'model' && x.metric === 'heartRate'), JSON.stringify(events.map((x) => x.title)));
});

test('exercise sessions are detected from heart rate and summarised', () => {
  const e = new TelemetryEngine(bundle, 0, 4);
  e.ensure('a', BASE, 7, { autoplay: false });
  e.setScenario('a', 'exercise');
  const events = Array.from({ length: 30 }, () => e.tick()).flat();
  const session = events.find((x) => x.kind === 'exercise');
  assert.ok(session?.session, 'session event emitted');
  assert.ok(session!.session!.minutes >= 30 && session!.session!.minutes <= 90, `minutes ${session!.session!.minutes}`);
  assert.ok(session!.session!.avgHr > BASE.heartRate + 20);
  assert.ok(!events.some((x) => x.kind === 'reference' && x.metric === 'heartRate'), 'exertional heart rate is not alarmed');
});

test('sensor dropout raises a signal alarm and recovers', () => {
  const e = new TelemetryEngine(bundle, 0, 5);
  e.ensure('a', BASE, 7, { autoplay: false });
  e.setScenario('a', 'dropout');
  const events = Array.from({ length: 6 }, () => e.tick()).flat();
  assert.ok(events.some((x) => x.kind === 'signal' && x.severity === 'watch'));
  assert.ok(events.some((x) => x.kind === 'signal' && x.title.includes('restored')));
});

test('daily brief prioritises the demo crew correctly', () => {
  const now = NOW.getTime();
  const records = demoRecords(NOW);
  const assessments = Object.fromEntries(DEMO_PROFILES.map((p) => [p.id, assess(p.id, records, now)]));
  const ex = demoExercise(NOW);
  const start = new Date(now - 29 * 86_400_000);
  const inv = demoInventory(start);
  const brief = buildBrief({
    profiles: DEMO_PROFILES, assessments, pvt: demoPvt(NOW),
    compliance: Object.fromEntries(DEMO_PROFILES.map((p) => [p.id, weeklyCompliance(ex, p.id, undefined, now)])),
    supplies: inv.items.map((item) => ({ item, proj: project(item, inv.events, start.getTime(), 210, now) })),
    unackedAlarms: 2, missionDay: 30, missionDays: 210, now,
  });
  assert.match(brief.headline, /of 4 crew/);
  assert.equal(brief.actions[0].severity, 'alert', 'most severe first');
  assert.ok(brief.actions.some((a) => a.id === 'review-demo-sakamoto'));
  assert.ok(brief.actions.some((a) => a.id === 'sup-analgesic'));
  assert.ok(brief.actions.some((a) => a.id === 'ack'));
  assert.ok(!brief.actions.some((a) => a.id === 'review-demo-calder'), 'healthy commander needs no review');
  assert.ok(brief.lines.some((l) => l.startsWith('Mei Sakamoto')));
});

test('ground link transmits queued packets only inside a contact window', () => {
  const start = Date.parse('2026-11-01T00:00:00Z');
  const inWindow = start + 60 * 60_000 + 10 * 60_000;
  const outWindow = start + 60 * 60_000 + (WINDOW_LENGTH_MIN + 5) * 60_000;
  assert.equal(linkState(start, inWindow).open, true);
  assert.equal(linkState(start, outWindow).open, false);
  assert.equal(linkState(start, outWindow).nextStart, start + 60 * 60_000 + WINDOW_EVERY_MIN * 60_000);
  const box: Packet[] = [{ id: '1', kind: 'handover', title: 'x', createdAt: new Date(start).toISOString(), status: 'queued', auto: true }];
  assert.equal(transmit(box, start, 1000, outWindow), box, 'unchanged while link is down');
  const sent = transmit(box, start, 22 * 60_000, inWindow);
  assert.equal(sent[0].status, 'sent');
  assert.equal(Date.parse(sent[0].deliveredAt!) - Date.parse(sent[0].sentAt!), 22 * 60_000, 'delivery includes light time');
});
