// Medical supply logistics. On a Mars mission there is no resupply: every consumable
// must last until the end of the mission. This module projects run-out dates from
// observed usage and flags items that will deplete or expire before mission end.
// Inventory only, it never recommends a medication or dose.

export type SupplyCategory = 'Medication' | 'Diagnostics' | 'Wound care' | 'Fluids' | 'Protective';
export type SupplyItem = {
  id: string;
  name: string;
  category: SupplyCategory;
  unit: string;
  quantity: number;
  initialQuantity: number;
  plannedPerWeek: number; // planning assumption used until real usage exists
  expires: string; // ISO date
  critical: boolean;
  location: string;
};
export type DispenseEvent = { id: string; itemId: string; timestamp: string; amount: number; profile?: string; note?: string };

export type Projection = {
  usePerDay: number;
  usageBasis: 'observed' | 'planned';
  daysOfSupply: number;
  runOutDay: number | null; // mission day the item runs out (null = never at this rate)
  shortfall: boolean;
  expiresBeforeEnd: boolean;
  expiryDay: number;
  status: 'nominal' | 'watch' | 'alert';
  reason: string;
};

/** Observed rate = units dispensed in the last `windowDays` / windowDays; falls back to the planned rate. */
export function project(item: SupplyItem, events: DispenseEvent[], missionStart: number, missionEndDay: number, now = Date.now(), windowDays = 14): Projection {
  const today = Math.floor((now - missionStart) / 86_400_000) + 1;
  const recent = events.filter((e) => e.itemId === item.id && now - Date.parse(e.timestamp) <= windowDays * 86_400_000);
  const observedDays = Math.min(windowDays, Math.max(1, today));
  const observed = recent.reduce((a, e) => a + e.amount, 0) / observedDays;
  const usageBasis = recent.length >= 2 ? 'observed' : 'planned';
  const usePerDay = usageBasis === 'observed' ? observed : item.plannedPerWeek / 7;
  const daysOfSupply = usePerDay > 0 ? item.quantity / usePerDay : Infinity;
  const runOutDay = Number.isFinite(daysOfSupply) ? Math.floor(today + daysOfSupply) : null;
  const shortfall = runOutDay !== null && runOutDay < missionEndDay;
  const expiryDay = Math.floor((Date.parse(item.expires) - missionStart) / 86_400_000) + 1;
  const expiresBeforeEnd = expiryDay < missionEndDay;
  let status: Projection['status'] = 'nominal';
  let reason = 'Sufficient for the mission at the current rate.';
  if (expiresBeforeEnd) { status = 'watch'; reason = `Expires on mission day ${expiryDay}, before mission end (day ${missionEndDay}).`; }
  if (shortfall) {
    status = item.critical ? 'alert' : 'watch';
    reason = `Runs out around mission day ${runOutDay} at ${usePerDay.toFixed(2)} ${item.unit}/day, ${missionEndDay - runOutDay!} days short.`;
  }
  if (item.quantity === 0) { status = item.critical ? 'alert' : 'watch'; reason = 'Out of stock.'; }
  return { usePerDay, usageBasis, daysOfSupply, runOutDay, shortfall, expiresBeforeEnd, expiryDay, status, reason };
}

/** Units needed to reach mission end at the current rate (0 if sufficient). */
export function deficit(item: SupplyItem, p: Projection, missionEndDay: number, today: number): number {
  if (!p.shortfall) return 0;
  return Math.ceil(p.usePerDay * (missionEndDay - today) - item.quantity);
}
