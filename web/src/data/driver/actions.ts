/** Everything the driver does is written to the phone first (Dexie), then the engine is nudged. Nothing waits on the network. */
import type { OutboxEvent } from "../../../../shared/schemas";
import type { CheckItem, FailReason, LogFields, OpenRequest, RequestKind, TruckCategory, VoiceContext } from "../../../../shared/types";
import { newId } from "../api";
import { db, deviceId, dexieStore } from "./db";
import { FORCE_OFFLINE_KEY, SyncEngine } from "./engine";

type EventOf<T extends OutboxEvent["type"]> = Extract<OutboxEvent, { type: T }>;

const engines = new Map<string, SyncEngine>();

export function forcedOffline(): boolean {
  try {
    return localStorage.getItem(FORCE_OFFLINE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setForcedOffline(on: boolean) {
  try {
    if (on) localStorage.setItem(FORCE_OFFLINE_KEY, "1");
    else localStorage.removeItem(FORCE_OFFLINE_KEY);
  } catch {
    /* ignore */
  }
  for (const e of engines.values()) e.refreshForced();
  if (!on) for (const e of engines.values()) void e.sync();
}

export function getEngine(villageId: string): SyncEngine {
  let e = engines.get(villageId);
  if (!e) {
    const key = `imaq.driver.lastSync.${villageId}`;
    e = new SyncEngine({
      villageId,
      deviceId: deviceId(),
      store: dexieStore,
      fetch: (...a) => fetch(...a),
      forcedOffline,
      now: Date.now,
      loadLastOk: () => {
        const v = Number(localStorage.getItem(key));
        return v > 0 ? v : null;
      },
      saveLastOk: (at) => localStorage.setItem(key, String(at)),
    });
    engines.set(villageId, e);
  }
  return e;
}

async function queue(villageId: string, event: OutboxEvent) {
  await db.outbox.put({ id: event.id, villageId, event, status: "pending", error: null, queuedAt: Date.now() });
  void getEngine(villageId).sync();
}

function envelope<T extends OutboxEvent["type"]>(type: T, payload: EventOf<T>["payload"]): EventOf<T> {
  return { id: newId(), occurredAt: Date.now(), type, payload } as EventOf<T>;
}

export const todayKey = (at = Date.now()) => new Date(at).toLocaleDateString("en-CA");

// session -----------------------------------------------------------------

export async function chooseTruck(villageId: string, truckId: string) {
  const cur = await db.session.get(villageId);
  await db.session.put({ villageId, initials: null, checkedDay: null, checkedTruckId: null, ...cur, truckId });
}

export async function forgetTruck(villageId: string) {
  await db.session.update(villageId, { truckId: null });
}

// truck --------------------------------------------------------------------

export async function truckCheck(villageId: string, truckId: string, items: Record<CheckItem, boolean>, voiceNoteId: string | null) {
  await queue(villageId, envelope("truck.check", { truckId, items, voiceNoteId }));
  await db.session.update(villageId, { checkedDay: todayKey(), checkedTruckId: truckId });
}

export const truckDown = (villageId: string, truckId: string, reason: TruckCategory, voiceNoteId: string | null) =>
  queue(villageId, envelope("truck.down", { truckId, reason, voiceNoteId }));

export const truckBack = (villageId: string, truckId: string) => queue(villageId, envelope("truck.back", { truckId }));

// stops ----------------------------------------------------------------------

export interface StopInput {
  request: OpenRequest;
  truckId: string;
  initials: string | null;
  outcome: "delivered" | "failed";
  litres: number;
  reason: FailReason | null;
  voiceNoteId: string | null;
}

/** Returns the stop id (= event id), used by Undo. */
export async function recordStop(villageId: string, s: StopInput): Promise<string> {
  const base = { houseId: s.request.houseId, truckId: s.truckId, requestId: s.request.id, driverInitials: s.initials, voiceNoteId: s.voiceNoteId };
  const ev =
    s.outcome === "delivered"
      ? envelope("stop.delivered", { ...base, litres: Math.max(0, Math.min(20000, Math.round(s.litres))) })
      : envelope("stop.failed", { ...base, reason: s.reason ?? "other" });
  await db.done.put({
    id: ev.id,
    villageId,
    truckId: s.truckId,
    houseId: s.request.houseId,
    houseLabel: s.request.houseLabel,
    requestId: s.request.id,
    outcome: s.outcome,
    litres: s.outcome === "delivered" ? Math.round(s.litres) : 0,
    reason: s.outcome === "failed" ? (s.reason ?? "other") : null,
    occurredAt: ev.occurredAt,
    voided: false,
  });
  await queue(villageId, ev);
  return ev.id;
}

/**
 * Undo / void a stop. If the stop event is still waiting on the phone (and not in a request right now),
 * it is simply removed. Otherwise the server may already have it, so a stop.void event is queued.
 */
export async function voidStop(villageId: string, stopId: string) {
  const engine = getEngine(villageId);
  const row = await db.outbox.get(stopId);
  if (row && row.status === "pending" && !engine.inFlight.has(stopId)) {
    await db.transaction("rw", db.outbox, db.done, async () => {
      await db.outbox.delete(stopId);
      await db.done.delete(stopId);
    });
    return;
  }
  await db.done.update(stopId, { voided: true });
  await queue(villageId, envelope("stop.void", { stopId }));
}

// lit door ---------------------------------------------------------------------

export const litDoor = (villageId: string, houseId: string, kind: RequestKind, truckId: string) =>
  queue(villageId, envelope("request.litDoor", { houseId, kind, truckId }));

// voice ------------------------------------------------------------------------

export interface NewNote {
  blob: Blob;
  mime: string;
  durationS: number;
  context: VoiceContext;
  truckId: string | null;
  houseId: string | null;
  sampleId: string | null;
}

export async function saveNote(villageId: string, n: NewNote): Promise<string> {
  const id = newId();
  await db.voiceNotes.put({ id, villageId, ...n, createdAt: Date.now(), upload: "saved", info: null, resolution: null });
  void getEngine(villageId).sync();
  return id;
}

export async function confirmNote(villageId: string, voiceNoteId: string, fields: LogFields) {
  await db.voiceNotes.update(voiceNoteId, { resolution: "confirmed" });
  await queue(villageId, envelope("voice.confirm", { voiceNoteId, fields }));
}

export async function noteNeedsHuman(villageId: string, voiceNoteId: string) {
  await db.voiceNotes.update(voiceNoteId, { resolution: "needsHuman" });
  await queue(villageId, envelope("voice.needsHuman", { voiceNoteId }));
}

export async function dismissRejected(id: string) {
  await db.outbox.delete(id);
}

export async function setInitials(villageId: string, initials: string) {
  const cur = await db.session.get(villageId);
  const v = initials.trim().slice(0, 8) || null;
  await db.session.put({ villageId, truckId: null, checkedDay: null, checkedTruckId: null, ...cur, initials: v });
}
