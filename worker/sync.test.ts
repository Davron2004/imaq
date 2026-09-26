import { describe, expect, it } from "vitest";
import { SqliteD1 } from "./test/d1-sqlite";
import { seedVillage, resetVillage } from "./seed";
import { applyEvents } from "./sync";
import { buildResidentView, buildSnapshot, houseByToken, upsertRequest } from "./db";
import type { OutboxEvent } from "../shared/schemas";

const NOW = Date.UTC(2026, 8, 26, 18, 30); // 14:30 in the village
const V = "demo";
const TABLES = ["villages", "houses", "trucks", "requests", "stops", "truck_checks", "truck_status_events", "voice_notes", "log_entries"];

async function fresh() {
  const d = new SqliteD1();
  await seedVillage(d.asD1(), V, { name: "Demo village", isSandbox: false, now: NOW });
  for (const id of ["note-confirm-1", "note-human-01"]) {
    d.db
      .prepare("INSERT INTO voice_notes (id, village_id, truck_id, context, mime, duration_s, status, created_at) VALUES (?, ?, ?, 'check', 'audio/webm', 5, 'ready', ?)")
      .run(id, V, `${V}-truck-2`, NOW - 60_000);
  }
  return d;
}
const dumpAll = (d: SqliteD1) => Object.fromEntries(TABLES.map((t) => [t, d.dump(t)]));
const counts = (d: SqliteD1) => Object.fromEntries(TABLES.map((t) => [t, (d.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));
const req = (d: SqliteD1, id: string) => d.db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as Record<string, unknown> | undefined;

const t = (min: number) => NOW + min * 60_000;
const BATCH: OutboxEvent[] = [
  { id: "ev-deliver-31", type: "stop.delivered", occurredAt: t(1), payload: { houseId: `${V}-house-31`, truckId: `${V}-truck-1`, requestId: `${V}-open-31`, litres: 1200, driverInitials: "JA" } },
  { id: "ev-deliver-26", type: "stop.delivered", occurredAt: t(2), payload: { houseId: `${V}-house-26`, truckId: `${V}-truck-1`, requestId: null, litres: 1500 } },
  { id: "ev-failed-7aa", type: "stop.failed", occurredAt: t(3), payload: { houseId: `${V}-house-7`, truckId: `${V}-truck-1`, requestId: `${V}-open-7`, reason: "road_blocked" } },
  { id: "ev-sewage-20", type: "stop.delivered", occurredAt: t(3), payload: { houseId: `${V}-house-20`, truckId: `${V}-truck-4`, requestId: null, litres: 0 } },
  { id: "ev-litdoor-44", type: "request.litDoor", occurredAt: t(4), payload: { houseId: `${V}-house-44`, kind: "out", truckId: `${V}-truck-1` } },
  { id: "ev-litdoor-44b", type: "request.litDoor", occurredAt: t(5), payload: { houseId: `${V}-house-44`, kind: "soon", truckId: `${V}-truck-2` } },
  { id: "ev-litdoor-3a", type: "request.litDoor", occurredAt: t(5), payload: { houseId: `${V}-house-3`, kind: "out", truckId: `${V}-truck-1` } },
  { id: "ev-check-3aaa", type: "truck.check", occurredAt: t(6), payload: { truckId: `${V}-truck-3`, items: { starts: true, heater: true, pump: false, hoses: true, other: true } } },
  { id: "ev-down-1aaa", type: "truck.down", occurredAt: t(7), payload: { truckId: `${V}-truck-1`, reason: "heater" } },
  { id: "ev-back-1aaa", type: "truck.back", occurredAt: t(60), payload: { truckId: `${V}-truck-1` } },
  { id: "ev-void-26aa", type: "stop.void", occurredAt: t(61), payload: { stopId: "ev-deliver-26" } },
  { id: "ev-confirm-1", type: "voice.confirm", occurredAt: t(62), payload: { voiceNoteId: "note-confirm-1", fields: { aboutTruckId: `${V}-truck-2`, aboutHouseId: null, type: "truck_problem", category: "heater", severity: "care", summary: "Heater again" } } },
  { id: "ev-human-01", type: "voice.needsHuman", occurredAt: t(62), payload: { voiceNoteId: "note-human-01" } },
  { id: "ev-bad-house", type: "stop.delivered", occurredAt: t(63), payload: { houseId: "nope", truckId: `${V}-truck-1`, requestId: null, litres: 5 } },
  { id: "ev-bad-truck", type: "truck.down", occurredAt: t(63), payload: { truckId: "sb-other-truck-1", reason: "pump" } },
  { id: "ev-bad-note", type: "voice.confirm", occurredAt: t(63), payload: { voiceNoteId: "missing", fields: { aboutTruckId: null, aboutHouseId: null, type: "other", category: null, severity: null, summary: "x" } } },
  { id: "ev-bad-void", type: "stop.void", occurredAt: t(63), payload: { stopId: "missing-stop" } },
];

describe("sync", () => {
  it("applies each event's effects", async () => {
    const d = await fresh();
    const before = counts(d);
    const { acked, rejected } = await applyEvents(d.asD1(), V, BATCH, t(70));
    expect(rejected.map((r) => r.id).sort()).toEqual(["ev-bad-house", "ev-bad-note", "ev-bad-truck", "ev-bad-void"]);
    expect(acked).toHaveLength(BATCH.length - 4);

    expect(req(d, `${V}-open-31`)).toMatchObject({ status: "served", closed_at: t(1) });
    // Delivered with requestId null served the house's open water request, then the void reopened it.
    expect(req(d, `${V}-open-26`)).toMatchObject({ status: "open", closed_at: null });
    expect((d.db.prepare("SELECT request_id, voided_at FROM stops WHERE id = 'ev-deliver-26'").get() as Record<string, unknown>)).toEqual({ request_id: `${V}-open-26`, voided_at: t(61) });
    // Couldn't deliver keeps the request open and records the attempt.
    expect(req(d, `${V}-open-7`)).toMatchObject({ status: "open" });
    expect(req(d, `${V}-open-20`)).toMatchObject({ status: "served" });
    // Lit door: one open request per queue.
    expect(req(d, "ev-litdoor-44")).toMatchObject({ status: "open", source: "lit_door", kind: "out" });
    expect(req(d, "ev-litdoor-44b")).toBeUndefined();
    expect(req(d, "ev-litdoor-3a")).toBeUndefined();
    // Failed check marks the truck down with a derived, idempotent status event id.
    expect(d.db.prepare("SELECT status FROM trucks WHERE id = ?").get(`${V}-truck-3`)).toEqual({ status: "down" });
    expect(d.db.prepare("SELECT kind FROM truck_status_events WHERE id = 'ev-check-3aaa:down'").get()).toEqual({ kind: "down" });
    expect(d.db.prepare("SELECT status FROM trucks WHERE id = ?").get(`${V}-truck-1`)).toEqual({ status: "up" });
    // Voice
    expect(d.db.prepare("SELECT status FROM voice_notes WHERE id = 'note-confirm-1'").get()).toEqual({ status: "confirmed" });
    expect(d.db.prepare("SELECT id, occurred_at, source FROM log_entries WHERE id = 'note-confirm-1'").get()).toEqual({ id: "note-confirm-1", occurred_at: NOW - 60_000, source: "voice" });
    expect(d.db.prepare("SELECT status FROM voice_notes WHERE id = 'note-human-01'").get()).toEqual({ status: "needs_human" });

    const after = counts(d);
    expect(after.stops - before.stops).toBe(4);
    expect(after.requests - before.requests).toBe(1);
    expect(after.log_entries - before.log_entries).toBe(1);

    // Third heater report within 7 days → mechanic flag on read.
    const snap = (await buildSnapshot(d.asD1(), V, t(70)))!;
    const mech = snap.flags.find((f) => f.kind === "mechanic")!;
    expect(mech.id).toBe(`mechanic:${V}-truck-2:heater`);
    expect(mech.entryIds).toHaveLength(3);
    expect(snap.trucks.find((x) => x.id === `${V}-truck-3`)).toMatchObject({ status: "down", downReason: "check: pump" });
    expect(snap.openRequests.find((r) => r.id === `${V}-open-7`)!.attempts.map((a) => a.reason)).toEqual(["road_blocked", "road_blocked"]);
  });

  it("re-sending the same batch changes nothing", async () => {
    const d = await fresh();
    await applyEvents(d.asD1(), V, BATCH, t(70));
    const once = dumpAll(d);
    const again = await applyEvents(d.asD1(), V, BATCH, t(90));
    expect(again.acked).toHaveLength(BATCH.length - 4);
    expect(dumpAll(d)).toEqual(once);
  });

  it("the same batch sent twice concurrently leaves the same data as sending it once", async () => {
    const a = await fresh();
    await applyEvents(a.asD1(), V, BATCH, t(70));
    const b = await fresh();
    await Promise.all([applyEvents(b.asD1(), V, BATCH, t(70)), applyEvents(b.asD1(), V, BATCH, t(70)), applyEvents(b.asD1(), V, [...BATCH].reverse().reverse(), t(70))]);
    expect(counts(b)).toEqual(counts(a));
    expect(dumpAll(b)).toEqual(dumpAll(a));
  });

  it("a re-sent delivery after a void does not serve the request again", async () => {
    const d = await fresh();
    const deliver = BATCH[1]!;
    await applyEvents(d.asD1(), V, [deliver, BATCH[10]!], t(70));
    expect(req(d, `${V}-open-26`)).toMatchObject({ status: "open" });
    await applyEvents(d.asD1(), V, [deliver], t(80));
    expect(req(d, `${V}-open-26`)).toMatchObject({ status: "open" });
  });

  it("out-of-order truck events settle on the latest one", async () => {
    const d = await fresh();
    await applyEvents(d.asD1(), V, [BATCH[9]!, BATCH[8]!], t(70)); // back arrives before down
    expect(d.db.prepare("SELECT status FROM trucks WHERE id = ?").get(`${V}-truck-1`)).toEqual({ status: "up" });
  });
});

describe("resident requests", () => {
  it("one open water request per house; upgrading keeps created_at; same id is a no-op", async () => {
    const d = await fresh();
    const db = d.asD1();
    const ctx = (await houseByToken(db, "demo-h14"))!;
    await upsertRequest(db, { villageId: V, houseId: ctx.houseId, id: "req-h14-00001", kind: "out", source: "resident", at: t(1) });
    await upsertRequest(db, { villageId: V, houseId: ctx.houseId, id: "req-h14-00001", kind: "out", source: "resident", at: t(2) });
    await Promise.all([
      upsertRequest(db, { villageId: V, houseId: ctx.houseId, id: "req-h14-00002", kind: "emergency", source: "resident", at: t(3) }),
      upsertRequest(db, { villageId: V, houseId: ctx.houseId, id: "req-h14-00002", kind: "emergency", source: "resident", at: t(3) }),
    ]);
    const rows = d.db.prepare("SELECT id, kind, created_at, updated_at FROM requests WHERE house_id = ? AND status = 'open'").all(ctx.houseId);
    expect(rows).toEqual([{ id: "req-h14-00001", kind: "emergency", created_at: t(1), updated_at: t(3) }]);
    await upsertRequest(db, { villageId: V, houseId: ctx.houseId, id: "req-h14-sewage", kind: "sewage", source: "resident", at: t(4) });
    const view = await buildResidentView(db, ctx, t(5));
    expect(view.water).toMatchObject({ id: "req-h14-00001", kind: "emergency", aheadCount: 1 });
    expect(view.sewage).toMatchObject({ id: "req-h14-sewage", aheadCount: 1 });
  });
});

describe("seed", () => {
  it("builds the demo village the pitch depends on", async () => {
    const d = await fresh();
    const s = (await buildSnapshot(d.asD1(), V, NOW))!;
    expect(s.houses).toHaveLength(48);
    expect(s.trucks.map((x) => [x.label, x.kind, x.status])).toEqual([
      ["Truck 1", "water", "up"],
      ["Truck 2", "water", "up"],
      ["Truck 3", "water", "up"],
      ["Truck 4", "sewage", "up"],
    ]);
    expect(s.trucks[1]!.downHistoryDays).toEqual([4, 9, 16]);
    const heater = s.logEntries.filter((e) => e.aboutTruckId === `${V}-truck-2` && e.category === "heater" && e.type === "truck_problem");
    expect(heater).toHaveLength(2);
    for (const e of heater) expect(NOW - e.occurredAt).toBeLessThan(5 * 86_400_000);
    expect(s.flags.filter((f) => f.kind === "mechanic")).toEqual([]);
    expect(s.counts.open).toEqual({ emergency: 1, out: 3, soon: 4, sewage: 1 });
    expect(s.openRequests.filter((r) => r.source === "lit_door")).toHaveLength(1);
    expect(s.openRequests.filter((r) => r.source === "office")).toHaveLength(1);
    expect(s.counts.waitingTooLong).toEqual([`${V}-open-7`]);
    expect(s.flags.map((f) => f.kind)).toEqual(["repair"]);
    const delivered = d.db.prepare("SELECT COUNT(*) AS n FROM stops WHERE outcome = 'delivered'").get() as { n: number };
    expect(delivered.n).toBeGreaterThan(14 * 20);
    expect(s.feed.length).toBe(60);
  });

  it("reset restores the seed state and keeps QR tokens", async () => {
    const d = await fresh();
    const tokens = Object.fromEntries((d.db.prepare("SELECT id, qr_token FROM houses").all() as { id: string; qr_token: string }[]).map((h) => [h.id, h.qr_token]));
    await applyEvents(d.asD1(), V, BATCH, t(70));
    d.db.exec("DELETE FROM voice_notes WHERE id IN ('note-confirm-1','note-human-01')");
    d.db.exec("DELETE FROM log_entries WHERE id IN ('note-confirm-1')");
    const seeded = await fresh();
    seeded.db.exec("DELETE FROM voice_notes WHERE id IN ('note-confirm-1','note-human-01')");
    await resetVillage(d.asD1(), V, { name: "Demo village", isSandbox: false, now: NOW, tokens });
    expect(counts(d)).toEqual(counts(seeded));
    expect(d.dump("requests")).toEqual(seeded.dump("requests"));
  });
});
