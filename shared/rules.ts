/**
 * Plain rules, no AI. Everything here is a pure function a staff member could check by hand.
 * Thresholds come from VillageConfig. See docs/build-plan.md §8.
 */
import type { Flag, LogEntry, RequestKind, TruckKind, VillageConfig, WeeklyRow } from "./types";

const RANK: Record<RequestKind, number> = { emergency: 0, out: 1, soon: 2, sewage: 3 };
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Emergency → Out of water → Need water soon; oldest first within each. (Sewage has its own queue.) */
export function orderQueue<T extends { kind: RequestKind; createdAt: number }>(requests: readonly T[]): T[] {
  return [...requests].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.createdAt - b.createdAt);
}

/** Truckloads needed for a number of litres. */
export function loadsNeeded(litres: number, capacityLitres: number): number {
  return litres <= 0 ? 0 : Math.ceil(litres / capacityLitres);
}

const kindOf = (k: RequestKind): TruckKind => (k === "sewage" ? "sewage" : "water");

/** Water trucks get water requests; the sewage truck gets Sewage full. Result is in queue order. */
export function queueFor<T extends { kind: RequestKind; createdAt: number }>(requests: readonly T[], truckKind: TruckKind): T[] {
  return orderQueue(requests.filter((r) => kindOf(r.kind) === truckKind));
}

/** Open requests ahead of `requestId` in its own queue (water vs sewage). -1 if it isn't in the list. */
export function placeInLine<T extends { id: string; kind: RequestKind; createdAt: number }>(open: readonly T[], requestId: string): number {
  const me = open.find((r) => r.id === requestId);
  if (!me) return -1;
  const q = queueFor(open, kindOf(me.kind));
  return q.findIndex((r) => r.id === requestId);
}

/** Ids of "Out of water" requests open longer than config.waitingTooLongHours. */
export function waitingTooLong<T extends { id: string; kind: RequestKind; createdAt: number }>(
  open: readonly T[],
  config: Pick<VillageConfig, "waitingTooLongHours">,
  now: number,
): string[] {
  const limit = config.waitingTooLongHours * HOUR;
  return orderQueue(open)
    .filter((r) => r.kind === "out" && now - r.createdAt > limit)
    .map((r) => r.id);
}

// ───────────────────────── truck down history ─────────────────────────

export interface StatusEventLite {
  id: string;
  kind: "down" | "back";
  reason: string | null;
  occurredAt: number;
}

export interface DownState {
  downSince: number | null;
  downReason: string | null;
  /** Completed down→back periods, most recent first, in days to 1 decimal. */
  downHistoryDays: number[];
  /** Completed periods as [start, end] ms, most recent first. */
  periods: [number, number][];
}

/**
 * Pair down and back events in time order. A "down" while already down is ignored (the first one counts);
 * a "back" while up is ignored. A trailing down with no back is the current down period, not history.
 */
export function downHistory(events: readonly StatusEventLite[]): DownState {
  const sorted = [...events].sort((a, b) => a.occurredAt - b.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const periods: [number, number][] = [];
  let open: StatusEventLite | null = null;
  for (const e of sorted) {
    if (e.kind === "down") {
      if (!open) open = e;
    } else if (open) {
      periods.push([open.occurredAt, e.occurredAt]);
      open = null;
    }
  }
  periods.reverse();
  return {
    downSince: open ? open.occurredAt : null,
    downReason: open ? open.reason : null,
    downHistoryDays: periods.map(([s, e]) => Math.round(((e - s) / DAY) * 10) / 10),
    periods,
  };
}

// ───────────────────────── flags ─────────────────────────

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Same truck + same category confirmed ≥ recurringProblemCount times within the last recurringProblemDays → "check with mechanic". */
export function recurringTruckProblems(
  entries: readonly LogEntry[],
  trucks: readonly { id: string; label: string }[],
  config: Pick<VillageConfig, "recurringProblemCount" | "recurringProblemDays">,
  now: number,
): Flag[] {
  const since = now - config.recurringProblemDays * DAY;
  const groups = new Map<string, LogEntry[]>();
  for (const e of entries) {
    if (e.type !== "truck_problem" || !e.aboutTruckId || !e.category) continue;
    if (e.occurredAt < since || e.occurredAt > now) continue;
    const key = `${e.aboutTruckId}:${e.category}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  const labels = new Map(trucks.map((t) => [t.id, t.label]));
  const flags: Flag[] = [];
  for (const [key, list] of groups) {
    if (list.length < config.recurringProblemCount) continue;
    list.sort((a, b) => a.occurredAt - b.occurredAt);
    const first = list[0]!;
    flags.push({
      id: `mechanic:${key}`,
      kind: "mechanic",
      truckId: first.aboutTruckId,
      houseId: null,
      category: first.category,
      subject: `${labels.get(first.aboutTruckId!) ?? first.aboutTruckId} · ${cap(first.category!)}`,
      entryIds: list.map((e) => e.id),
      raisedAt: list[config.recurringProblemCount - 1]!.occurredAt,
    });
  }
  return flags.sort((a, b) => b.raisedAt - a.raisedAt);
}

export interface FailedStopLite {
  id: string;
  houseId: string;
  reason: string | null;
  occurredAt: number;
  voided: boolean;
  outcome: "delivered" | "failed";
}

/** Road-blocked entries confirmed today (village time) → snow-clearing list. One flag per house (or per entry without a house). */
export function snowClearing(
  entries: readonly LogEntry[],
  stops: readonly FailedStopLite[],
  houses: readonly { id: string; label: string }[],
  timezone: string,
  now: number,
): Flag[] {
  const dayStart = startOfLocalDay(now, timezone);
  const labels = new Map(houses.map((h) => [h.id, h.label]));
  const byKey = new Map<string, Flag & { stopIds: string[] }>();
  const get = (key: string, houseId: string | null, subject: string) => {
    let f = byKey.get(key);
    if (!f) {
      f = { id: `snow:${key}`, kind: "snow", truckId: null, houseId, category: null, subject, entryIds: [], stopIds: [], raisedAt: 0 };
      byKey.set(key, f);
    }
    return f;
  };
  for (const e of entries) {
    if (e.type !== "road_blocked" || e.confirmedAt < dayStart || e.confirmedAt > now) continue;
    const f = e.aboutHouseId
      ? get(e.aboutHouseId, e.aboutHouseId, labels.get(e.aboutHouseId) ?? e.aboutHouseId)
      : get(`entry:${e.id}`, null, e.summary || "Road blocked");
    f.entryIds.push(e.id);
    f.raisedAt = Math.max(f.raisedAt, e.confirmedAt);
  }
  for (const s of stops) {
    if (s.outcome !== "failed" || s.voided || s.reason !== "road_blocked" || s.occurredAt < dayStart || s.occurredAt > now) continue;
    const f = get(s.houseId, s.houseId, labels.get(s.houseId) ?? s.houseId);
    f.stopIds.push(s.id);
    f.raisedAt = Math.max(f.raisedAt, s.occurredAt);
  }
  return [...byKey.values()].sort((a, b) => b.raisedAt - a.raisedAt);
}

/** House problems (confirmed log entries) and couldn't-deliver stops with reason frozen_pipe in the last `days` days → repair list, one flag per house. */
export function houseRepairs(
  entries: readonly LogEntry[],
  stops: readonly FailedStopLite[],
  houses: readonly { id: string; label: string }[],
  now: number,
  days = 14,
): Flag[] {
  const since = now - days * DAY;
  const labels = new Map(houses.map((h) => [h.id, h.label]));
  const byHouse = new Map<string, Flag & { stopIds: string[] }>();
  const get = (houseId: string) => {
    let f = byHouse.get(houseId);
    if (!f) {
      f = { id: `repair:${houseId}`, kind: "repair", truckId: null, houseId, category: null, subject: labels.get(houseId) ?? houseId, entryIds: [], stopIds: [], raisedAt: 0 };
      byHouse.set(houseId, f);
    }
    return f;
  };
  for (const e of entries) {
    if (e.type !== "house_problem" || !e.aboutHouseId || e.occurredAt < since || e.occurredAt > now) continue;
    const f = get(e.aboutHouseId);
    f.entryIds.push(e.id);
    f.raisedAt = Math.max(f.raisedAt, e.occurredAt);
  }
  for (const s of stops) {
    if (s.outcome !== "failed" || s.voided || s.reason !== "frozen_pipe" || s.occurredAt < since || s.occurredAt > now) continue;
    const f = get(s.houseId);
    f.stopIds.push(s.id);
    f.raisedAt = Math.max(f.raisedAt, s.occurredAt);
  }
  return [...byHouse.values()].sort((a, b) => b.raisedAt - a.raisedAt);
}

// ───────────────────────── weekly ─────────────────────────

export interface WeeklyInput {
  stops: readonly { houseId: string; outcome: "delivered" | "failed"; occurredAt: number; voided: boolean }[];
  requests: readonly { houseId: string; kind: RequestKind; createdAt: number; closedAt: number | null }[];
  /** Status events grouped by truck. */
  truckEvents: readonly (readonly StatusEventLite[])[];
}

/**
 * Last `weeks` weeks (Monday 00:00 village time), most recent first.
 * homesWaitedOver24h: distinct houses whose Out-of-water/Emergency request was still open waitingTooLongHours after it was made,
 * counted in the week that moment fell in. truckDownDays: down time (completed and ongoing) overlapping the week, summed over trucks.
 */
export function weekly(input: WeeklyInput, config: Pick<VillageConfig, "waitingTooLongHours">, timezone: string, now: number, weeks = 6): WeeklyRow[] {
  const thisWeek = startOfLocalWeek(now, timezone);
  const starts: number[] = [];
  let ws = thisWeek;
  for (let i = 0; i < weeks; i++) {
    starts.push(ws);
    ws = startOfLocalWeek(ws - 12 * HOUR, timezone); // step back into the previous week, then snap to its Monday
  }
  const bounds = starts.map((s, i) => [s, i === 0 ? Infinity : starts[i - 1]!] as const);
  const weekIndex = (t: number) => bounds.findIndex(([s, e]) => t >= s && t < e);

  const rows: WeeklyRow[] = starts.map((s) => ({ weekStart: s, deliveries: 0, couldntDeliver: 0, homesWaitedOver24h: 0, truckDownDays: 0 }));
  for (const s of input.stops) {
    if (s.voided || s.occurredAt > now) continue;
    const i = weekIndex(s.occurredAt);
    if (i < 0) continue;
    if (s.outcome === "delivered") rows[i]!.deliveries++;
    else rows[i]!.couldntDeliver++;
  }
  const limit = config.waitingTooLongHours * HOUR;
  const waited = starts.map(() => new Set<string>());
  for (const r of input.requests) {
    if (r.kind !== "out" && r.kind !== "emergency") continue;
    const crossed = r.createdAt + limit;
    if (crossed > now) continue;
    if (r.closedAt !== null && r.closedAt <= crossed) continue;
    const i = weekIndex(crossed);
    if (i >= 0) waited[i]!.add(r.houseId);
  }
  waited.forEach((set, i) => (rows[i]!.homesWaitedOver24h = set.size));
  for (const events of input.truckEvents) {
    const st = downHistory(events);
    const periods = [...st.periods];
    if (st.downSince !== null) periods.push([st.downSince, now]);
    for (const [ps, pe] of periods) {
      bounds.forEach(([s, e], i) => {
        const overlap = Math.min(pe, e === Infinity ? now : e) - Math.max(ps, s);
        if (overlap > 0) rows[i]!.truckDownDays += overlap / DAY;
      });
    }
  }
  for (const r of rows) r.truckDownDays = Math.round(r.truckDownDays * 10) / 10;
  return rows;
}

// ───────────────────────── village-time helpers ─────────────────────────

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Monday … 6 = Sunday
}

const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function localParts(at: number, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const x of dtf(tz).formatToParts(new Date(at))) p[x.type] = x.value;
  return {
    year: +p.year!,
    month: +p.month!,
    day: +p.day!,
    hour: +p.hour! % 24,
    minute: +p.minute!,
    second: +p.second!,
    weekday: WD[p.weekday!] ?? 0,
  };
}

/** Offset (local − UTC) in ms at instant `at`. */
function tzOffset(at: number, tz: string): number {
  const p = localParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant for a local wall-clock time in `tz` (y/m/d may overflow; Date.UTC normalises). */
export function localToInstant(tz: string, year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return t;
}

export function startOfLocalDay(at: number, tz: string): number {
  const p = localParts(at, tz);
  return localToInstant(tz, p.year, p.month, p.day);
}

/** Monday 00:00 village time of the week containing `at`. */
export function startOfLocalWeek(at: number, tz: string): number {
  const p = localParts(at, tz);
  return localToInstant(tz, p.year, p.month, p.day - p.weekday);
}

/** "2026-09-26 14:20" in village time. */
export function formatLocal(at: number, tz: string): string {
  const p = localParts(at, tz);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)} ${z(p.hour)}:${z(p.minute)}`;
}
