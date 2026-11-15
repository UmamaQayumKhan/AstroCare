import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from './state';
import { getSetting, setSetting } from './storage';
import { loadModels } from './lib/models';
import { TelemetryEngine, type TelemetryEvent } from './lib/telemetry';
import { personalBaseline, num } from './lib/monitoring';
import { linkState, transmit, type Packet } from './lib/comms';
import { missionDay, missionProfile } from './lib/mission';
import type { Scenario, Vitals } from './lib/simulator';

export const TICK_MS = 2000;

export type Alarm = TelemetryEvent & { id: string; at: string; ackAt?: string };

type Ctx = {
  engine: TelemetryEngine | null;
  version: number;
  running: boolean;
  setRunning: (v: boolean) => void;
  alarms: Alarm[];
  unacked: number;
  ack: (id: string) => void;
  ackAll: () => void;
  outbox: Packet[];
  queue: (p: Omit<Packet, 'id' | 'createdAt' | 'status'>) => void;
  setScenario: (profile: string, s: Scenario) => void;
};

const TelemetryContext = createContext<Ctx | null>(null);
export function useTelemetry() {
  const c = useContext(TelemetryContext);
  if (!c) throw new Error('useTelemetry outside provider');
  return c;
}

const DEFAULT_BASE: Vitals = { heartRate: 64, systolic: 115, diastolic: 74, temperature: 36.7 };
const DAY = 86_400_000;

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;
  const [engine, setEngine] = useState<TelemetryEngine | null>(null);
  const [version, setVersion] = useState(0);
  const [running, setRunning] = useState(true);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [outbox, setOutbox] = useState<Packet[]>([]);
  const loaded = useRef(false);

  // load models + persisted alarms/outbox once
  useEffect(() => {
    (async () => {
      const bundle = await loadModels();
      setEngine(new TelemetryEngine(bundle));
      setAlarms(((await getSetting('alarms')) as Alarm[]) || []);
      setOutbox(((await getSetting('outbox')) as Packet[]) || []);
      loaded.current = true;
    })();
  }, []);

  useEffect(() => { if (loaded.current) void setSetting('alarms', alarms.slice(-300)); }, [alarms]);
  useEffect(() => { if (loaded.current) void setSetting('outbox', outbox.slice(-100)); }, [outbox]);

  // keep one stream per crew member; base physiology = their most recent check-in
  useEffect(() => {
    if (!engine || !app.ready) return;
    const ids = new Set(app.profiles.map((p) => p.id));
    for (const id of [...engine.streams.keys()]) if (!ids.has(id)) engine.remove(id);
    app.profiles.forEach((p, i) => {
      const mine = app.records.filter((r) => r.profile === p.id).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const existing = engine.streams.get(p.id);
      if (existing && (existing.seeded || !mine.length)) return;
      if (existing) engine.remove(p.id);
      const latest = (k: keyof Vitals) => [...mine].reverse().map((r) => num(r, k)).find((v) => v !== undefined);
      const base: Vitals = { ...DEFAULT_BASE };
      (Object.keys(base) as (keyof Vitals)[]).forEach((k) => { base[k] = latest(k) ?? personalBaseline(mine, k)?.median ?? DEFAULT_BASE[k]; });
      const sleep = [...mine].reverse().map((r) => num(r, 'sleep')).find((v) => v !== undefined) ?? 7;
      engine.ensure(p.id, base, sleep, { offset: i }).seeded = mine.length > 0;
    });
    setVersion((v) => v + 1);
  }, [engine, app.ready, app.profiles, app.records]);

  const queue = useCallback((p: Omit<Packet, 'id' | 'createdAt' | 'status'>) => {
    setOutbox((old) => [...old, { ...p, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'queued' }]);
  }, []);

  // main loop
  useEffect(() => {
    if (!engine || !running) return;
    const t = setInterval(() => {
      const events = engine.tick();
      const nowIso = new Date().toISOString();
      if (events.length) {
        for (const e of events) {
          if (e.kind === 'exercise' && e.session) {
            void appRef.current.addExercise({ id: crypto.randomUUID(), profile: e.profile, timestamp: nowIso, type: e.session.type, minutes: e.session.minutes, effort: 3, avgHr: e.session.avgHr, notes: `Auto-detected from wearable heart rate (peak ${e.session.peakHr} bpm)`, source: 'wearable' });
          }
        }
        setAlarms((old) => {
          const next = [...old];
          for (const e of events) {
            // one alarm per condition: suppress repeats while unacknowledged, or within 6 h of the last one
            const dup = next.find((a) => a.key === e.key && (!a.ackAt || Date.now() - Date.parse(a.at) < DAY / 4));
            if (dup) continue;
            next.push({ ...e, id: crypto.randomUUID(), at: nowIso, ackAt: e.severity === 'info' ? nowIso : undefined });
          }
          return next.slice(-300);
        });
      }
      // automatic handover queueing for crew on alert (once per crew per day)
      const a = appRef.current;
      setOutbox((old) => {
        let next = old;
        for (const p of a.profiles) {
          if (a.assessments[p.id]?.status !== 'alert') continue;
          const recent = next.some((x) => x.kind === 'handover' && x.profile === p.id && Date.now() - Date.parse(x.createdAt) < DAY);
          if (!recent) next = [...next, { id: crypto.randomUUID(), kind: 'handover', profile: p.id, title: `SBAR handover: ${p.name}`, createdAt: nowIso, status: 'queued', auto: true }];
        }
        const day = missionDay(a.settings.missionStart);
        if (a.profiles.length && !next.some((x) => x.kind === 'brief' && x.title.endsWith(`day ${day}`)))
          next = [...next, { id: crypto.randomUUID(), kind: 'brief', title: `Daily crew medical brief, day ${day}`, createdAt: nowIso, status: 'queued', auto: true }];
        const m = missionProfile(a.settings.mission);
        return transmit(next, Date.parse(a.settings.missionStart), m.oneWayDelaySec[1] * 1000);
      });
      setVersion((v) => v + 1);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [engine, running]);

  const value = useMemo<Ctx>(() => ({
    engine,
    version,
    running,
    setRunning,
    alarms,
    unacked: alarms.filter((a) => !a.ackAt).length,
    ack: (id) => setAlarms((old) => old.map((a) => (a.id === id ? { ...a, ackAt: new Date().toISOString() } : a))),
    ackAll: () => setAlarms((old) => old.map((a) => (a.ackAt ? a : { ...a, ackAt: new Date().toISOString() }))),
    outbox,
    queue,
    setScenario: (profile, s) => { engine?.setScenario(profile, s); setVersion((v) => v + 1); },
  }), [engine, version, running, alarms, outbox, queue]);

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

export function useLink() {
  const { settings } = useApp();
  useTelemetry(); // re-render with the loop
  return linkState(Date.parse(settings.missionStart));
}
