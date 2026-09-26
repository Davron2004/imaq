import { describe, expect, it, vi } from "vitest";
import type { OutboxEvent, SyncResponse } from "../../../../shared/schemas";
import type { Snapshot, VoiceNoteInfo } from "../../../../shared/types";
import { DEFAULT_CONFIG } from "../../../../shared/types";
import { SyncEngine } from "./engine";
import { applyPending } from "./optimistic";
import type { DriverStore, OutboxRow, VoiceNoteRow } from "./types";

const V = "village-1";

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    serverTime: 1,
    village: { id: V, name: "Test", timezone: "America/Toronto", config: DEFAULT_CONFIG, isSandbox: true },
    houses: [
      { id: "house-14", label: "House 14", x: 0, y: 0, tankLitres: 1200, usesApp: true },
      { id: "house-22", label: "House 22", x: 0, y: 0, tankLitres: 900, usesApp: false },
    ],
    trucks: [{ id: "truck-1", label: "Truck 1", kind: "water", capacityLitres: 13600, status: "up", downSince: null, downReason: null, downHistoryDays: [], lastCheck: null }],
    openRequests: [
      { id: "req-soon-1", houseId: "house-14", houseLabel: "House 14", kind: "soon", source: "resident", createdAt: 100, updatedAt: 100, litres: 1200, attempts: [] },
    ],
    flags: [],
    logEntries: [],
    feed: [],
    needsHuman: [],
    counts: { open: { soon: 1, out: 0, emergency: 0, sewage: 0 }, waitingTooLong: [], oldestOpenAt: 100 },
    ...over,
  };
}

function memoryStore() {
  const outbox = new Map<string, OutboxRow>();
  const notes = new Map<string, VoiceNoteRow>();
  let snap: Snapshot | null = null;
  const store: DriverStore = {
    async pendingEvents(v) {
      return [...outbox.values()].filter((r) => r.villageId === v && r.status === "pending").sort((a, b) => a.queuedAt - b.queuedAt);
    },
    async removeEvents(ids) {
      ids.forEach((id) => outbox.delete(id));
    },
    async rejectEvents(rs) {
      rs.forEach((r) => {
        const row = outbox.get(r.id);
        if (row) outbox.set(r.id, { ...row, status: "rejected", error: r.error });
      });
    },
    async saveSnapshot(_v, s) {
      snap = s;
    },
    async notes(v) {
      return [...notes.values()].filter((n) => n.villageId === v);
    },
    async updateNote(id, patch) {
      const n = notes.get(id);
      if (n) notes.set(id, { ...n, ...patch });
    },
  };
  const add = (event: OutboxEvent, at = Date.now()) => outbox.set(event.id, { id: event.id, villageId: V, event, status: "pending", error: null, queuedAt: at });
  return { store, outbox, notes, add, snap: () => snap };
}

const delivered = (id: string, voiceNoteId: string | null = null): OutboxEvent => ({
  id,
  occurredAt: 1000,
  type: "stop.delivered",
  payload: { houseId: "house-14", truckId: "truck-1", requestId: "req-soon-1", litres: 1200, driverInitials: null, voiceNoteId },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function engine(m: ReturnType<typeof memoryStore>, fetchImpl: typeof fetch, forced = () => false) {
  return new SyncEngine({ villageId: V, deviceId: "device-1", store: m.store, fetch: fetchImpl, forcedOffline: forced, now: () => 5000 });
}

describe("SyncEngine", () => {
  it("posts pending events, deletes acked, marks rejected, replaces the snapshot", async () => {
    const m = memoryStore();
    m.add(delivered("event-aaaaaaaa"), 1);
    m.add(delivered("event-bbbbbbbb"), 2);
    const fresh = snapshot({ openRequests: [] });
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`/api/v/${V}/sync`);
      const body = JSON.parse(String(init!.body));
      expect(body.deviceId).toBe("device-1");
      expect(body.events.map((e: OutboxEvent) => e.id)).toEqual(["event-aaaaaaaa", "event-bbbbbbbb"]);
      const res: SyncResponse = { acked: ["event-aaaaaaaa"], rejected: [{ id: "event-bbbbbbbb", error: "unknown request" }], snapshot: fresh };
      return json(res);
    }) as unknown as typeof fetch;
    const e = engine(m, fetchMock);
    await e.sync();
    expect(m.outbox.has("event-aaaaaaaa")).toBe(false);
    expect(m.outbox.get("event-bbbbbbbb")?.status).toBe("rejected");
    expect(m.snap()).toEqual(fresh);
    expect(e.state.connectivity).toBe("online");
    expect(e.state.lastOkAt).toBe(5000);
  });

  it("keeps events and reports offline when the network fails", async () => {
    const m = memoryStore();
    m.add(delivered("event-aaaaaaaa"));
    const e = engine(m, (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);
    await e.sync();
    expect(m.outbox.get("event-aaaaaaaa")?.status).toBe("pending");
    expect(e.state.connectivity).toBe("offline");
    expect(e.state.syncing).toBe(false);
  });

  it("reports a server error as 'will retry', not offline", async () => {
    const m = memoryStore();
    m.add(delivered("event-aaaaaaaa"));
    const e = engine(m, (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch);
    await e.sync();
    expect(e.state.connectivity).toBe("error");
    expect(m.outbox.size).toBe(1);
  });

  it("makes no network calls when the demo offline switch is on", async () => {
    const m = memoryStore();
    m.add(delivered("event-aaaaaaaa"));
    const f = vi.fn();
    const e = engine(m, f as unknown as typeof fetch, () => true);
    await e.sync();
    expect(f).not.toHaveBeenCalled();
    expect(e.state.forcedOffline).toBe(true);
  });

  it("is single-flight: concurrent triggers never send the same event twice at once", async () => {
    const m = memoryStore();
    m.add(delivered("event-aaaaaaaa"));
    const sent: string[][] = [];
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const ids = JSON.parse(String(init!.body)).events.map((x: OutboxEvent) => x.id);
      sent.push(ids);
      await new Promise((r) => setTimeout(r, 10));
      return json({ acked: ids, rejected: [], snapshot: snapshot() });
    }) as unknown as typeof fetch;
    const e = engine(m, f);
    await Promise.all([e.sync(), e.sync(), e.sync()]);
    expect(sent.filter((s) => s.includes("event-aaaaaaaa")).length).toBe(1);
    expect(m.outbox.size).toBe(0);
  });

  it("uploads audio before events that reference it, then processes the note", async () => {
    const m = memoryStore();
    m.notes.set("note-11111111", {
      id: "note-11111111", villageId: V, blob: new Blob(["abc"], { type: "audio/mp4" }), mime: "audio/mp4", durationS: 7.4,
      context: "stop", truckId: "truck-1", houseId: "house-14", createdAt: 42, sampleId: "heater-truck2", upload: "saved", info: null, resolution: null,
    });
    m.add(delivered("event-aaaaaaaa", "note-11111111"));
    const calls: string[] = [];
    const info: VoiceNoteInfo = { id: "note-11111111", status: "uploaded", context: "stop", truckId: "truck-1", houseId: "house-14", durationS: 7, mime: "audio/mp4", createdAt: 42, draft: null };
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u);
      calls.push(`${init?.method} ${url.split("?")[0]}`);
      if (init?.method === "PUT") {
        const q = new URL(url, "http://x").searchParams;
        expect(q.get("sampleId")).toBe("heater-truck2");
        expect(q.get("durationS")).toBe("7");
        expect(q.get("context")).toBe("stop");
        return json(info);
      }
      if (url.endsWith("/process")) {
        return json({ ...info, status: "ready", draft: { aboutTruckId: "truck-1", aboutHouseId: null, type: "truck_problem", category: "heater", severity: "care", summary: "Heater", transcript: "heater", language: "en", confidence: 0.9, needsHuman: false, source: "fallback" } });
      }
      return json({ acked: ["event-aaaaaaaa"], rejected: [], snapshot: snapshot() });
    }) as unknown as typeof fetch;
    await engine(m, f).sync();
    expect(calls).toEqual([`PUT /api/v/${V}/voice-notes/note-11111111`, `POST /api/v/${V}/sync`, `POST /api/v/${V}/voice-notes/note-11111111/process`]);
    expect(m.notes.get("note-11111111")?.upload).toBe("processed");
    expect(m.notes.get("note-11111111")?.info?.draft?.category).toBe("heater");
  });

  it("holds back an event whose voice note audio couldn't be uploaded yet", async () => {
    const m = memoryStore();
    m.notes.set("note-11111111", {
      id: "note-11111111", villageId: V, blob: new Blob(["abc"]), mime: "audio/webm", durationS: 3,
      context: "stop", truckId: null, houseId: null, createdAt: 42, sampleId: null, upload: "saved", info: null, resolution: null,
    });
    m.add(delivered("event-aaaaaaaa", "note-11111111"));
    const f = vi.fn(async () => {
      throw new TypeError("offline");
    });
    await engine(m, f as unknown as typeof fetch).sync();
    expect(f).toHaveBeenCalledTimes(1); // the PUT only; no sync with a dangling reference
    expect(m.outbox.get("event-aaaaaaaa")?.status).toBe("pending");
  });
});

describe("applyPending (optimistic view)", () => {
  it("removes a delivered stop's request, adds a lit door in queue order, marks the truck down", () => {
    const snap = snapshot();
    const view = applyPending(snap, [
      delivered("event-aaaaaaaa"),
      { id: "lit-door-1234", occurredAt: 50, type: "request.litDoor", payload: { houseId: "house-22", kind: "out", truckId: "truck-1" } },
      { id: "truck-down-1234", occurredAt: 60, type: "truck.down", payload: { truckId: "truck-1", reason: "heater" } },
    ]);
    expect(view.openRequests.map((r) => r.id)).toEqual(["lit-door-1234"]);
    expect(view.openRequests[0]).toMatchObject({ houseLabel: "House 22", source: "lit_door", litres: 900 });
    expect(view.trucks[0]).toMatchObject({ status: "down", downSince: 60, downReason: "heater" });
  });

  it("orders a lit door 'out' ahead of an older 'soon' and doesn't duplicate an open house", () => {
    const view = applyPending(snapshot(), [
      { id: "lit-door-1234", occurredAt: 500, type: "request.litDoor", payload: { houseId: "house-22", kind: "out", truckId: "truck-1" } },
      { id: "lit-door-5678", occurredAt: 600, type: "request.litDoor", payload: { houseId: "house-14", kind: "out", truckId: "truck-1" } },
    ]);
    expect(view.openRequests.map((r) => r.id)).toEqual(["lit-door-1234", "req-soon-1"]);
  });

  it("keeps a failed stop's request open with the attempt added", () => {
    const view = applyPending(snapshot(), [
      { id: "fail-12345678", occurredAt: 700, type: "stop.failed", payload: { houseId: "house-14", truckId: "truck-1", requestId: "req-soon-1", reason: "road_blocked" } },
    ]);
    expect(view.openRequests[0].attempts).toEqual([{ stopId: "fail-12345678", at: 700, reason: "road_blocked", truckId: "truck-1" }]);
  });

  it("a failed pre-trip check marks the truck down", () => {
    const view = applyPending(snapshot(), [
      { id: "check-12345678", occurredAt: 800, type: "truck.check", payload: { truckId: "truck-1", items: { starts: true, heater: false, pump: true, hoses: true, other: true } } },
    ]);
    expect(view.trucks[0].status).toBe("down");
    expect(view.trucks[0].lastCheck).toEqual({ at: 800, passed: false, failed: ["heater"] });
  });
});
