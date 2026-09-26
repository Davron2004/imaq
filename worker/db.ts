/** D1 rows ↔ shared types, and the read models (Snapshot, ResidentView). */
import {
  DEFAULT_CONFIG,
  truckKindFor,
  type Attempt,
  type FailReason,
  type FeedItem,
  type Flag,
  type House,
  type LogEntry,
  type OpenRequest,
  type RequestKind,
  type ResidentRequest,
  type ResidentView,
  type Snapshot,
  type Stop,
  type Truck,
  type TruckCheckSummary,
  type Village,
  type VillageConfig,
  type VoiceDraft,
  type VoiceNoteInfo,
  type CheckItem,
} from "../shared/types";
import { downHistory, houseRepairs, orderQueue, placeInLine, recurringTruckProblems, snowClearing, waitingTooLong, type StatusEventLite } from "../shared/rules";
import { DEMO_GEOMETRY } from "./seed/geometry";

export type Db = D1Database;
type Row = Record<string, unknown>;

const DAY = 86_400_000;
const FEED_SIZE = 60;

export const WATER_KINDS_SQL = "('soon','out','emergency')";
/** SQL predicate: request kind `col` is in the same queue as a request kind bound at `param`. */
export const sameQueueSql = (col: string, param: string) =>
  `((${param} = 'sewage' AND ${col} = 'sewage') OR (${param} != 'sewage' AND ${col} != 'sewage'))`;

// ───────────── row mappers ─────────────

export interface VillageRow {
  id: string;
  name: string;
  timezone: string;
  config: string;
  is_sandbox: number;
  created_at: number;
}

export function toVillage(r: VillageRow): Village {
  let config: VillageConfig = DEFAULT_CONFIG;
  try {
    config = { ...DEFAULT_CONFIG, ...(JSON.parse(r.config) as Partial<VillageConfig>) };
  } catch {
    /* keep defaults */
  }
  return { id: r.id, name: r.name, timezone: r.timezone, config, isSandbox: !!r.is_sandbox, geometry: DEMO_GEOMETRY };
}

export const toHouse = (r: Row): House => ({
  id: r.id as string,
  label: r.label as string,
  x: r.x as number,
  y: r.y as number,
  tankLitres: r.tank_litres as number,
  usesApp: !!r.uses_app,
});

export const toStop = (r: Row): Stop => ({
  id: r.id as string,
  houseId: r.house_id as string,
  houseLabel: (r.house_label as string) ?? "",
  truckId: r.truck_id as string,
  requestId: (r.request_id as string | null) ?? null,
  driverInitials: (r.driver_initials as string | null) ?? null,
  litres: r.litres as number,
  outcome: r.outcome as Stop["outcome"],
  reason: (r.reason as FailReason | null) ?? null,
  voiceNoteId: (r.voice_note_id as string | null) ?? null,
  occurredAt: r.occurred_at as number,
  voided: r.voided_at !== null && r.voided_at !== undefined,
});

export const toLogEntry = (r: Row): LogEntry => ({
  id: r.id as string,
  aboutTruckId: (r.about_truck_id as string | null) ?? null,
  aboutHouseId: (r.about_house_id as string | null) ?? null,
  type: r.type as LogEntry["type"],
  category: (r.category as LogEntry["category"]) ?? null,
  severity: (r.severity as LogEntry["severity"]) ?? null,
  summary: r.summary as string,
  source: r.source as LogEntry["source"],
  voiceNoteId: (r.voice_note_id as string | null) ?? null,
  transcript: (r.transcript as string | null) ?? null,
  language: (r.language as string | null) ?? null,
  occurredAt: r.occurred_at as number,
  confirmedAt: r.confirmed_at as number,
});

export const toVoiceNote = (r: Row): VoiceNoteInfo => {
  let draft: VoiceDraft | null = null;
  if (typeof r.draft === "string") {
    try {
      draft = JSON.parse(r.draft) as VoiceDraft;
    } catch {
      draft = null;
    }
  }
  return {
    id: r.id as string,
    status: r.status as VoiceNoteInfo["status"],
    context: r.context as VoiceNoteInfo["context"],
    truckId: (r.truck_id as string | null) ?? null,
    houseId: (r.house_id as string | null) ?? null,
    durationS: (r.duration_s as number) ?? 0,
    mime: r.mime as string,
    createdAt: r.created_at as number,
    draft,
  };
};

const toAttempt = (r: Row): Attempt => ({
  stopId: r.id as string,
  at: r.occurred_at as number,
  reason: ((r.reason as FailReason | null) ?? "other") as FailReason,
  truckId: r.truck_id as string,
});

/** Log entry select with transcript/language joined from its voice note. */
export const LOG_SELECT = `SELECT l.*, v.transcript AS transcript, v.language AS language
  FROM log_entries l LEFT JOIN voice_notes v ON v.id = l.voice_note_id`;
export const VOICE_SELECT = `SELECT id, village_id, truck_id, house_id, context, sample_id, mime, duration_s, transcript, language, draft, draft_source, status, created_at, processed_at FROM voice_notes`;

// ───────────── queries ─────────────

export async function getVillage(db: Db, villageId: string): Promise<Village | null> {
  const r = await db.prepare("SELECT * FROM villages WHERE id = ?").bind(villageId).first<VillageRow>();
  return r ? toVillage(r) : null;
}

const byLabelNumber = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "en", { numeric: true });

export async function buildSnapshot(db: Db, villageId: string, now = Date.now()): Promise<Snapshot | null> {
  const since = now - 30 * DAY;
  const q = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args);
  const res = await db.batch([
    q("SELECT * FROM villages WHERE id = ?", villageId),
    q("SELECT * FROM houses WHERE village_id = ?", villageId),
    q("SELECT * FROM trucks WHERE village_id = ?", villageId),
    q("SELECT * FROM truck_status_events WHERE village_id = ? ORDER BY occurred_at", villageId),
    q(
      `SELECT c.* FROM truck_checks c WHERE c.village_id = ?1 AND c.id = (
         SELECT c2.id FROM truck_checks c2 WHERE c2.truck_id = c.truck_id ORDER BY c2.occurred_at DESC, c2.id DESC LIMIT 1)`,
      villageId,
    ),
    q("SELECT * FROM requests WHERE village_id = ? AND status = 'open'", villageId),
    q(
      `SELECT s.* FROM stops s JOIN requests r ON r.id = s.request_id
       WHERE s.village_id = ? AND s.outcome = 'failed' AND s.voided_at IS NULL AND r.status = 'open'
       ORDER BY s.occurred_at`,
      villageId,
    ),
    q(`${LOG_SELECT} WHERE l.village_id = ? AND (l.occurred_at >= ? OR l.confirmed_at >= ?) ORDER BY l.occurred_at DESC`, villageId, since, since),
    q(
      `SELECT s.*, h.label AS house_label FROM stops s JOIN houses h ON h.id = s.house_id
       WHERE s.village_id = ? ORDER BY s.occurred_at DESC, s.id DESC LIMIT ${FEED_SIZE}`,
      villageId,
    ),
    q(
      `SELECT s.* FROM stops s WHERE s.village_id = ? AND s.outcome = 'failed' AND s.voided_at IS NULL AND s.occurred_at >= ?`,
      villageId,
      now - 15 * DAY,
    ),
    q(`SELECT * FROM requests WHERE village_id = ? ORDER BY created_at DESC, id DESC LIMIT ${FEED_SIZE}`, villageId),
    q(`${VOICE_SELECT} WHERE village_id = ? AND status = 'needs_human' ORDER BY created_at`, villageId),
  ]);
  const rows = (i: number) => (res[i]!.results ?? []) as Row[];
  const vrow = rows(0)[0] as unknown as VillageRow | undefined;
  if (!vrow) return null;
  const village = toVillage(vrow);
  const cfg = village.config;

  const houses = rows(1).map(toHouse).sort(byLabelNumber);
  const houseById = new Map(houses.map((h) => [h.id, h]));

  const eventsByTruck = new Map<string, StatusEventLite[]>();
  const feed: FeedItem[] = [];
  for (const e of rows(3)) {
    const ev: StatusEventLite = { id: e.id as string, kind: e.kind as "down" | "back", reason: (e.reason as string | null) ?? null, occurredAt: e.occurred_at as number };
    const list = eventsByTruck.get(e.truck_id as string) ?? [];
    list.push(ev);
    eventsByTruck.set(e.truck_id as string, list);
    feed.push({ id: `truck:${ev.id}`, at: ev.occurredAt, kind: ev.kind === "down" ? "truck_down" : "truck_back", truckId: e.truck_id as string, reason: ev.reason });
  }
  const lastCheck = new Map<string, TruckCheckSummary>();
  for (const c of rows(4)) {
    let items: Record<string, boolean> = {};
    try {
      items = JSON.parse(c.items as string) as Record<string, boolean>;
    } catch {
      /* ignore */
    }
    lastCheck.set(c.truck_id as string, {
      at: c.occurred_at as number,
      passed: !!c.passed,
      failed: Object.entries(items).filter(([, ok]) => ok === false).map(([k]) => k as CheckItem),
    });
  }
  const trucks: Truck[] = rows(2)
    .map((t) => {
      const st = downHistory(eventsByTruck.get(t.id as string) ?? []);
      const down = t.status === "down";
      return {
        id: t.id as string,
        label: t.label as string,
        kind: t.kind as Truck["kind"],
        capacityLitres: t.capacity_litres as number,
        status: t.status as Truck["status"],
        downSince: down ? st.downSince : null,
        downReason: down ? st.downReason : null,
        downHistoryDays: st.downHistoryDays,
        lastCheck: lastCheck.get(t.id as string) ?? null,
      };
    })
    .sort(byLabelNumber);

  const attemptsByRequest = new Map<string, Attempt[]>();
  for (const s of rows(6)) {
    const list = attemptsByRequest.get(s.request_id as string) ?? [];
    list.push(toAttempt(s));
    attemptsByRequest.set(s.request_id as string, list);
  }
  const toOpen = (r: Row, withAttempts = true): OpenRequest => {
    const house = houseById.get(r.house_id as string);
    return {
      id: r.id as string,
      houseId: r.house_id as string,
      houseLabel: house?.label ?? "",
      kind: r.kind as RequestKind,
      source: r.source as OpenRequest["source"],
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      litres: house?.tankLitres ?? cfg.defaultTankLitres,
      attempts: withAttempts ? (attemptsByRequest.get(r.id as string) ?? []) : [],
    };
  };
  const openRequests = orderQueue(rows(5).map((r) => toOpen(r)));

  const entries = rows(7).map(toLogEntry);
  const flagStops = rows(9).map((s) => ({
    id: s.id as string,
    houseId: s.house_id as string,
    reason: (s.reason as string | null) ?? null,
    occurredAt: s.occurred_at as number,
    voided: false,
    outcome: "failed" as const,
  }));
  const flags: Flag[] = [
    ...recurringTruckProblems(entries, trucks, cfg, now),
    ...snowClearing(entries, flagStops, houses, village.timezone, now),
    ...houseRepairs(entries, flagStops, houses, now),
  ];

  for (const s of rows(8)) feed.push({ id: `stop:${s.id as string}`, at: s.occurred_at as number, kind: "stop", stop: toStop(s) });
  for (const e of entries.slice(0, FEED_SIZE)) feed.push({ id: `log:${e.id}`, at: e.confirmedAt, kind: "log", entry: e });
  for (const r of rows(10)) feed.push({ id: `request:${r.id as string}`, at: r.created_at as number, kind: "request", request: toOpen(r, false) });
  feed.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  const feedTop = feed.slice(0, FEED_SIZE);

  const referenced = new Set<string>();
  for (const f of flags) f.entryIds.forEach((id) => referenced.add(id));
  for (const f of feedTop) if (f.kind === "log") referenced.add(f.entry.id);
  const logEntries = entries.filter((e) => referenced.has(e.id) || e.occurredAt >= now - 14 * DAY);

  const open: Record<RequestKind, number> = { emergency: 0, out: 0, soon: 0, sewage: 0 };
  for (const r of openRequests) open[r.kind]++;
  const oldestOpenAt = openRequests.length ? Math.min(...openRequests.map((r) => r.createdAt)) : null;

  return {
    serverTime: now,
    village,
    houses,
    trucks,
    openRequests,
    flags,
    logEntries,
    feed: feedTop,
    needsHuman: rows(11).map(toVoiceNote),
    counts: { open, waitingTooLong: waitingTooLong(openRequests, cfg, now), oldestOpenAt },
  };
}

export interface HouseCtx {
  houseId: string;
  label: string;
  villageId: string;
  village: Village;
}

export async function houseByToken(db: Db, token: string): Promise<HouseCtx | null> {
  const r = await db
    .prepare(
      `SELECT h.id AS house_id, h.label AS house_label, v.* FROM houses h JOIN villages v ON v.id = h.village_id WHERE h.qr_token = ?`,
    )
    .bind(token)
    .first<VillageRow & { house_id: string; house_label: string }>();
  if (!r) return null;
  return { houseId: r.house_id, label: r.house_label, villageId: r.id, village: toVillage(r) };
}

export async function buildResidentView(db: Db, ctx: HouseCtx, now = Date.now()): Promise<ResidentView> {
  const q = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args);
  const res = await db.batch([
    q("SELECT id, house_id, kind, created_at FROM requests WHERE village_id = ? AND status = 'open'", ctx.villageId),
    q("SELECT kind, status FROM trucks WHERE village_id = ?", ctx.villageId),
    q(
      `SELECT t.kind AS truck_kind, MAX(s.occurred_at) AS at FROM stops s JOIN trucks t ON t.id = s.truck_id
       WHERE s.house_id = ? AND s.outcome = 'delivered' AND s.voided_at IS NULL GROUP BY t.kind`,
      ctx.houseId,
    ),
    q(
      `SELECT kind, status, closed_at FROM requests WHERE house_id = ? AND status IN ('served','cancelled') AND closed_at IS NOT NULL
       ORDER BY closed_at DESC LIMIT 1`,
      ctx.houseId,
    ),
    q(
      `SELECT s.* FROM stops s JOIN requests r ON r.id = s.request_id
       WHERE r.house_id = ? AND r.status = 'open' AND s.outcome = 'failed' AND s.voided_at IS NULL ORDER BY s.occurred_at DESC`,
      ctx.houseId,
    ),
  ]);
  const rows = (i: number) => (res[i]!.results ?? []) as Row[];
  const open = rows(0).map((r) => ({ id: r.id as string, houseId: r.house_id as string, kind: r.kind as RequestKind, createdAt: r.created_at as number }));
  const lastAttempt = new Map<string, Attempt>();
  for (const s of rows(4)) if (!lastAttempt.has(s.request_id as string)) lastAttempt.set(s.request_id as string, toAttempt(s));

  const mine = (sewage: boolean): ResidentRequest | null => {
    const r = open.find((o) => o.houseId === ctx.houseId && (o.kind === "sewage") === sewage);
    if (!r) return null;
    return { id: r.id, kind: r.kind, createdAt: r.createdAt, aheadCount: Math.max(0, placeInLine(open, r.id)), lastAttempt: lastAttempt.get(r.id) ?? null };
  };
  const running = { water: { up: 0, total: 0 }, sewage: { up: 0, total: 0 } };
  for (const t of rows(1)) {
    const k = t.kind as "water" | "sewage";
    running[k].total++;
    if (t.status === "up") running[k].up++;
  }
  const lastDelivery = { water: null as number | null, sewage: null as number | null };
  for (const d of rows(2)) lastDelivery[d.truck_kind as "water" | "sewage"] = d.at as number;
  const lc = rows(3)[0];
  return {
    serverTime: now,
    village: { id: ctx.villageId, name: ctx.village.name, emergencyContact: ctx.village.config.emergencyContact },
    house: { id: ctx.houseId, label: ctx.label },
    water: mine(false),
    sewage: mine(true),
    trucksRunning: running,
    lastDelivery,
    lastClosed: lc ? { kind: lc.kind as RequestKind, status: lc.status as "served" | "cancelled", at: lc.closed_at as number } : null,
  };
}

/**
 * One open water request and one open sewage request per house. A new request of a different level
 * changes the open one's kind and keeps its created_at; re-sending the same id is a no-op. Atomic (one batch).
 */
export async function upsertRequest(
  db: Db,
  a: { villageId: string; houseId: string; id: string; kind: RequestKind; source: "resident" | "office" | "lit_door"; at: number },
): Promise<void> {
  const sameQueue = sameQueueSql("kind", "?3");
  await db.batch([
    db
      .prepare(
        `UPDATE requests SET kind = ?3, updated_at = ?4
         WHERE house_id = ?1 AND village_id = ?2 AND status = 'open' AND ${sameQueue} AND kind != ?3
           AND NOT EXISTS (SELECT 1 FROM requests WHERE id = ?5)`,
      )
      .bind(a.houseId, a.villageId, a.kind, a.at, a.id),
    db
      .prepare(
        `INSERT OR IGNORE INTO requests (id, village_id, house_id, kind, source, status, created_at, updated_at, closed_at)
         SELECT ?5, ?2, ?1, ?3, ?6, 'open', ?4, ?4, NULL
         WHERE NOT EXISTS (SELECT 1 FROM requests WHERE house_id = ?1 AND status = 'open' AND ${sameQueue})`,
      )
      .bind(a.houseId, a.villageId, a.kind, a.at, a.id, a.source),
  ]);
}

export { truckKindFor };
