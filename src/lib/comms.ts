// Ground link: scheduled contact windows (like Deep Space Network passes) and an outbox.
// Packets queue while the link is down and transmit automatically when a window opens;
// delivery adds the one-way light-time delay.

export const WINDOW_EVERY_MIN = 180;
export const WINDOW_LENGTH_MIN = 45;

export type Packet = {
  id: string;
  kind: 'handover' | 'report' | 'brief' | 'records';
  profile?: string;
  title: string;
  createdAt: string;
  status: 'queued' | 'sent';
  sentAt?: string;
  deliveredAt?: string;
  auto: boolean;
};

const MIN = 60_000;

/** Contact windows start every WINDOW_EVERY_MIN minutes from mission start (offset by 60 min). */
export function linkState(missionStart: number, now = Date.now()) {
  const period = WINDOW_EVERY_MIN * MIN;
  const first = missionStart + 60 * MIN;
  const k = Math.floor((now - first) / period);
  const thisStart = first + k * period;
  const open = now >= thisStart && now < thisStart + WINDOW_LENGTH_MIN * MIN;
  const nextStart = open ? thisStart + period : now < first ? first : thisStart + period;
  return { open, closesAt: open ? thisStart + WINDOW_LENGTH_MIN * MIN : undefined, nextStart };
}

/** Transmit everything queued if the link is open. Returns the updated outbox (unchanged reference if nothing sent). */
export function transmit(outbox: Packet[], missionStart: number, oneWayDelayMs: number, now = Date.now()): Packet[] {
  if (!linkState(missionStart, now).open || !outbox.some((p) => p.status === 'queued')) return outbox;
  const sentAt = new Date(now).toISOString();
  const deliveredAt = new Date(now + oneWayDelayMs).toISOString();
  return outbox.map((p) => (p.status === 'queued' ? { ...p, status: 'sent', sentAt, deliveredAt } : p));
}

export function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
