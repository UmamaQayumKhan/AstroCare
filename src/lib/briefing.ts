// Automated daily medical brief and action queue.
// Turns monitoring state into (1) a short plain-language summary and (2) a prioritised list
// of concrete next actions, so the crew medical officer starts from a to-do list, not raw data.
import type { Assessment, Severity } from './monitoring.ts';
import type { Profile } from './demo.ts';
import type { PvtResult } from './pvt.ts';
import { assessPvt } from './pvt.ts';
import type { Compliance } from './exercise.ts';
import type { Projection, SupplyItem } from './inventory.ts';

export type Action = { id: string; severity: Exclude<Severity, 'nominal'>; title: string; detail: string; href: string; profile?: string; done?: boolean };
export type Brief = { headline: string; lines: string[]; actions: Action[] };

export type BriefInput = {
  profiles: Profile[];
  assessments: Record<string, Assessment>;
  pvt: PvtResult[];
  compliance: Record<string, Compliance | undefined>;
  supplies: { item: SupplyItem; proj: Projection }[];
  unackedAlarms: number;
  missionDay: number;
  missionDays: number;
  now?: number;
};

const RANK = { info: 1, watch: 2, alert: 3 } as const;
const H = 3_600_000;

export function buildBrief(i: BriefInput): Brief {
  const now = i.now ?? Date.now();
  const actions: Action[] = [];
  const lines: string[] = [];
  const firstName = (p: Profile) => p.name.split(' ')[0];

  if (i.unackedAlarms > 0) actions.push({ id: 'ack', severity: 'alert', title: `Acknowledge ${i.unackedAlarms} telemetry alarm${i.unackedAlarms > 1 ? 's' : ''}`, detail: 'Unacknowledged alarms stay highlighted until reviewed.', href: 'alarms' });

  for (const p of i.profiles) {
    const a = i.assessments[p.id];
    if (!a) continue;
    const top = a.findings.find((f) => f.severity !== 'info');
    if (a.status === 'alert' && top) {
      actions.push({ id: `review-${p.id}`, severity: 'alert', profile: p.id, title: `Review ${p.name}`, detail: `${top.title}. ${a.findings.length > 1 ? `${a.findings.length - 1} related finding${a.findings.length > 2 ? 's' : ''}.` : ''}`.trim(), href: `crew/${p.id}` });
      actions.push({ id: `handover-${p.id}`, severity: 'watch', profile: p.id, title: `Handover for ${firstName(p)} queued for ground`, detail: 'SBAR handover packet is queued automatically and transmits at the next contact window.', href: `emergency/${p.id}` });
    } else if (a.status === 'watch' && top) {
      actions.push({ id: `review-${p.id}`, severity: 'watch', profile: p.id, title: `Check on ${p.name}`, detail: `${top.title}.`, href: `crew/${p.id}` });
    }
    // check-in schedule
    const sinceCheckIn = a.lastCheckIn ? now - Date.parse(a.lastCheckIn) : Infinity;
    if (sinceCheckIn > 20 * H) actions.push({ id: `checkin-${p.id}`, severity: 'info', profile: p.id, title: `Daily check-in due: ${firstName(p)}`, detail: a.lastCheckIn ? `Last check-in ${Math.round(sinceCheckIn / H)} h ago. Vitals are pre-filled from the wearable.` : 'No check-in yet.', href: `check-in/${p.id}` });
    // reaction-test schedule: every 72 h, or within 24 h when sleep or cognition is flagged
    const tests = i.pvt.filter((x) => x.profile === p.id).sort((x, y) => x.timestamp.localeCompare(y.timestamp));
    const last = tests.at(-1);
    const sinceTest = last ? now - Date.parse(last.timestamp) : Infinity;
    const sleepFlag = a.findings.some((f) => f.metric === 'sleep' && f.severity !== 'info');
    if (sinceTest > 72 * H || (sleepFlag && sinceTest > 24 * H))
      actions.push({ id: `pvt-${p.id}`, severity: sleepFlag ? 'watch' : 'info', profile: p.id, title: `Reaction-time test due: ${firstName(p)}`, detail: sleepFlag ? 'Triggered by a sleep finding: an objective fatigue check is recommended within 24 h.' : `Routine 72 h test; last ${last ? `${Math.round(sinceTest / H)} h ago` : 'never'}.`, href: `cognition/${p.id}` });
    else if (last && assessPvt(last, i.pvt).severity === 'alert' && !actions.some((x) => x.id === `review-${p.id}`))
      actions.push({ id: `pvt-${p.id}`, severity: 'watch', profile: p.id, title: `Discuss reaction-test result with ${firstName(p)}`, detail: assessPvt(last, i.pvt).text, href: `cognition/${p.id}` });
    // exercise
    const c = i.compliance[p.id];
    if (c && c.severity !== 'nominal') actions.push({ id: `ex-${p.id}`, severity: c.severity === 'alert' ? 'watch' : 'info', profile: p.id, title: `Exercise behind plan: ${firstName(p)} at ${Math.round(c.overallPct * 100)}%`, detail: `${c.resistanceMin} min resistive and ${c.aerobicMin} min aerobic in the last 7 days.`, href: `exercise/${p.id}` });
  }

  for (const { item, proj } of i.supplies) {
    if (proj.status === 'nominal') continue;
    actions.push({ id: `sup-${item.id}`, severity: proj.status === 'alert' ? 'alert' : 'watch', title: proj.shortfall ? `${item.name} runs out on day ${proj.runOutDay}` : `${item.name} expires on day ${proj.expiryDay}`, detail: proj.shortfall ? `Mission ends on day ${i.missionDays}. ${item.critical ? 'Critical item.' : ''}`.trim() : 'Plan a replacement or substitute.', href: 'supplies' });
  }

  actions.sort((a, b) => RANK[b.severity] - RANK[a.severity]);

  // summary lines
  const byStatus = (s: Severity) => i.profiles.filter((p) => i.assessments[p.id]?.status === s);
  const alertCrew = byStatus('alert');
  const watchCrew = byStatus('watch');
  const calm = i.profiles.length - alertCrew.length - watchCrew.length;
  const needs = alertCrew.length + watchCrew.length;
  const headline = !i.profiles.length
    ? 'No crew on the roster.'
    : needs === 0
      ? `All ${i.profiles.length} crew members within their normal ranges.`
      : `${needs} of ${i.profiles.length} crew member${i.profiles.length > 1 ? 's' : ''} need${needs === 1 ? 's' : ''} attention today.`;
  for (const p of [...alertCrew, ...watchCrew]) {
    const f = i.assessments[p.id].findings.filter((x) => x.severity !== 'info').slice(0, 2).map((x) => x.title.charAt(0).toLowerCase() + x.title.slice(1));
    lines.push(`${p.name}: ${f.join('; ')}.`);
  }
  if (calm > 0 && needs > 0) lines.push(`${calm} crew member${calm > 1 ? 's' : ''} nominal.`);
  const short = i.supplies.filter((s) => s.proj.shortfall);
  if (short.length) lines.push(`Medical kit: ${short.length} item${short.length > 1 ? 's' : ''} projected to run out before day ${i.missionDays}.`);

  return { headline, lines, actions };
}
