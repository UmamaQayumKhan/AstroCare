import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { allRecords, deleteRecord, getSetting, saveRecord, setSetting, synchronize, type RecordEntry } from './storage';
import { assess, worst, type Assessment, type Finding } from './lib/monitoring';
import { DEMO_DAYS, DEMO_PROFILES, demoRecords, type Profile } from './lib/demo';
import { demoExercise, demoInventory, demoPvt } from './lib/demoExtras';
import { missionProfile, type MissionId } from './lib/mission';
import { assessPvt, type PvtResult } from './lib/pvt';
import { DEFAULT_PRESCRIPTION, weeklyCompliance, type ExerciseSession, type Prescription } from './lib/exercise';
import type { DispenseEvent, SupplyItem } from './lib/inventory';

export type Settings = { mission: MissionId; missionStart: string; callsign: string; missionDays: number; prescription: Prescription };
export type ThemeMode = 'light' | 'dark';

type Ctx = {
  ready: boolean;
  error: string;
  profiles: Profile[];
  records: RecordEntry[];
  pvt: PvtResult[];
  exercise: ExerciseSession[];
  inventory: SupplyItem[];
  dispenses: DispenseEvent[];
  assessments: Record<string, Assessment>;
  settings: Settings;
  online: boolean;
  backend: boolean;
  pending: number;
  syncing: boolean;
  mode: ThemeMode;
  notice: string;
  notify: (msg: string) => void;
  setError: (msg: string) => void;
  toggleMode: () => void;
  sync: () => Promise<void>;
  addProfile: (name: string, role: string) => Promise<Profile>;
  saveReading: (r: RecordEntry) => Promise<void>;
  addPvt: (r: PvtResult) => Promise<void>;
  addExercise: (s: ExerciseSession) => Promise<void>;
  saveInventory: (items: SupplyItem[]) => Promise<void>;
  dispense: (itemId: string, amount: number, profile?: string) => Promise<void>;
  loadDemo: () => Promise<void>;
  removeDemo: () => Promise<void>;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
};

const AppContext = createContext<Ctx | null>(null);
export function useApp() {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

const DEFAULT_SETTINGS: Settings = { mission: 'Mars transit', missionStart: new Date().toISOString(), callsign: 'ASTRA-1', missionDays: 210, prescription: DEFAULT_PRESCRIPTION };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
}
const isDemo = (id: string) => id.startsWith('demo-');

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [autoDemo, setAutoDemo] = useState(false);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [pvt, setPvt] = useState<PvtResult[]>([]);
  const [exercise, setExercise] = useState<ExerciseSession[]>([]);
  const [inventory, setInventory] = useState<SupplyItem[]>([]);
  const [dispenses, setDispenses] = useState<DispenseEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [online, setOnline] = useState(navigator.onLine);
  const [backend, setBackend] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<ThemeMode>(() => {
    try { return (localStorage.getItem('astrocare-mode') as ThemeMode) || 'dark'; } catch { return 'dark'; }
  });
  const noticeTimer = useRef<number>(undefined);

  const notify = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4500);
  }, []);

  const refresh = useCallback(async () => {
    const rows = await allRecords();
    setRecords(rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      setBackend(await synchronize());
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    try { localStorage.setItem('astrocare-mode', mode); } catch { /* storage may be blocked */ }
  }, [mode]);

  useEffect(() => {
    (async () => {
      try {
        const saved: Profile[] = (await getSetting('personalProfiles')) || [];
        setProfiles(saved.map((p, i) => ({ ...p, color: p.color ?? i % 4 })));
        const stored = (await getSetting('missionSettings')) || {};
        const mission = (await getSetting('mission')) || stored.mission || DEFAULT_SETTINGS.mission;
        setSettings({ ...DEFAULT_SETTINGS, missionDays: missionProfile(mission).plannedDays, ...stored, mission });
        setPvt((await getSetting('pvt')) || []);
        setExercise((await getSetting('exercise')) || []);
        setInventory((await getSetting('inventory')) || []);
        setDispenses((await getSetting('dispenses')) || []);
        await refresh();
        if (!saved.length && !(await getSetting('onboarded'))) setAutoDemo(true);
        setReady(true);
      } catch (e) {
        setError('Local storage could not open. Allow browser storage for this site and reload. ' + String(e));
      }
    })();
    const on = () => { setOnline(true); void sync(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [refresh, sync]);

  useEffect(() => {
    if (!ready) return;
    void sync();
    const t = setInterval(() => void sync(), 30_000);
    return () => clearInterval(t);
  }, [ready, sync]);

  const persist = async <T,>(key: string, value: T, set: (v: T) => void) => { await setSetting(key, value); set(value); };

  const addProfile = async (name: string, role: string) => {
    const p: Profile = { id: crypto.randomUUID(), name: name.trim(), role: role.trim() || 'Crew member', initials: initials(name), color: profiles.length % 4 };
    await persist('personalProfiles', [...profiles, p], setProfiles);
    notify(`${p.name} added to the crew.`);
    return p;
  };

  const saveReading = async (r: RecordEntry) => {
    await saveRecord(r);
    await refresh();
    void sync();
  };

  const addPvt = async (r: PvtResult) => persist('pvt', [...pvt, r], setPvt);
  // functional update: also called from the background telemetry loop
  const addExercise = async (s: ExerciseSession) => {
    setExercise((prev) => {
      const next = [...prev, s];
      void setSetting('exercise', next);
      return next;
    });
  };
  const saveInventory = async (items: SupplyItem[]) => persist('inventory', items, setInventory);
  const dispense = async (itemId: string, amount: number, profile?: string) => {
    const item = inventory.find((i) => i.id === itemId);
    if (!item || amount <= 0) return;
    const used = Math.min(amount, item.quantity);
    await persist('inventory', inventory.map((i) => (i.id === itemId ? { ...i, quantity: i.quantity - used } : i)), setInventory);
    await persist('dispenses', [...dispenses, { id: crypto.randomUUID(), itemId, amount: used, profile, timestamp: new Date().toISOString() }], setDispenses);
    notify(`Logged ${used} ${item.unit} of ${item.name}.`);
  };

  const updateSettings = async (p: Partial<Settings>) => {
    const next = { ...settings, ...p };
    if (p.mission && p.missionDays === undefined) next.missionDays = missionProfile(p.mission).plannedDays;
    setSettings(next);
    await setSetting('missionSettings', next);
    if (p.mission) await setSetting('mission', p.mission);
  };

  const loadDemo = async () => {
    const now = new Date();
    const start = new Date(now.getTime() - (DEMO_DAYS - 1) * 86_400_000);
    start.setUTCHours(0, 0, 0, 0);
    for (const r of demoRecords(now, settings.mission)) await saveRecord(r as RecordEntry);
    await refresh(); // records first, so telemetry starts from each person's current state
    const others = profiles.filter((p) => !p.demo);
    await persist('personalProfiles', [...DEMO_PROFILES, ...others.map((p, i) => ({ ...p, color: (DEMO_PROFILES.length + i) % 4 }))], setProfiles);
    await persist('pvt', [...pvt.filter((x) => !isDemo(x.profile)), ...demoPvt(now)], setPvt);
    await persist('exercise', [...exercise.filter((x) => !isDemo(x.profile)), ...demoExercise(now)], setExercise);
    const inv = demoInventory(start);
    await persist('inventory', inv.items, setInventory);
    await persist('dispenses', inv.events, setDispenses);
    await updateSettings({ missionStart: start.toISOString() });
    await setSetting('onboarded', true);
    await refresh();
    notify('Demo mission loaded: 4 fictional astronauts with 30 days of simulated data.');
  };

  const removeDemo = async () => {
    for (const r of records.filter((r) => isDemo(r.profile))) await deleteRecord(r.id);
    await persist('personalProfiles', profiles.filter((p) => !p.demo), setProfiles);
    await persist('pvt', pvt.filter((x) => !isDemo(x.profile)), setPvt);
    await persist('exercise', exercise.filter((x) => !isDemo(x.profile)), setExercise);
    await setSetting('onboarded', true);
    await refresh();
    notify('Demo crew removed.');
  };

  useEffect(() => {
    if (!ready || !autoDemo) return;
    setAutoDemo(false);
    void loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, autoDemo]);

  const assessments = useMemo(() => {
    const out: Record<string, Assessment> = {};
    for (const p of profiles) {
      const a = assess(p.id, records);
      const extra: Finding[] = [];
      const mine = pvt.filter((x) => x.profile === p.id).sort((x, y) => x.timestamp.localeCompare(y.timestamp));
      const last = mine.at(-1);
      if (last) {
        const pa = assessPvt(last, pvt);
        if (pa.severity !== 'nominal')
          extra.push({ id: `pvt-${last.id}`, severity: pa.severity, kind: 'cognitive', at: last.timestamp, title: 'Reaction-time test below personal norm', detail: `Latest PVT: ${pa.text}. Slowed responses and lapses are sensitive markers of fatigue and sleep loss.`, sourceIds: ['pvtBasner', 'research'] });
      }
      if (exercise.some((x) => x.profile === p.id)) {
        const c = weeklyCompliance(exercise, p.id, settings.prescription);
        if (c.severity !== 'nominal')
          extra.push({ id: `ex-${p.id}`, severity: c.severity, kind: 'exercise', title: 'Exercise countermeasures below prescription', detail: `Last 7 days: ${c.resistanceMin} min resistive, ${c.aerobicMin} min aerobic, ${c.activeDays} active days, ${Math.round(c.overallPct * 100)}% of prescription. Unloading in weightlessness drives bone and muscle loss.`, sourceIds: ['hazards', 'risks'] });
      }
      const findings = [...a.findings, ...extra].sort((x, y) => ['info', 'watch', 'alert'].indexOf(y.severity) - ['info', 'watch', 'alert'].indexOf(x.severity));
      out[p.id] = { ...a, findings, status: extra.reduce((s, f) => worst(s, f.severity), a.status) };
    }
    return out;
  }, [profiles, records, pvt, exercise, settings.prescription]);

  const value: Ctx = {
    ready, error, profiles, records, pvt, exercise, inventory, dispenses, assessments, settings, online, backend, syncing, mode, notice,
    pending: records.filter((r) => r.sync === 'pending').length,
    notify, setError,
    toggleMode: () => setMode((m) => (m === 'light' ? 'dark' : 'light')),
    sync, addProfile, saveReading, addPvt, addExercise, saveInventory, dispense, loadDemo, removeDemo, updateSettings,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
