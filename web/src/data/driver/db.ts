import Dexie, { type EntityTable } from "dexie";
import type { SyncResponse } from "../../../../shared/schemas";
import type { Snapshot } from "../../../../shared/types";
import type { DoneRow, DriverStore, OutboxRow, SessionRow, SnapshotRow, VoiceNoteRow } from "./types";

export const db = new Dexie("imaq-driver") as Dexie & {
  outbox: EntityTable<OutboxRow, "id">;
  snapshot: EntityTable<SnapshotRow, "villageId">;
  voiceNotes: EntityTable<VoiceNoteRow, "id">;
  session: EntityTable<SessionRow, "villageId">;
  done: EntityTable<DoneRow, "id">;
};

db.version(1).stores({
  outbox: "id, villageId, status, queuedAt",
  snapshot: "villageId",
  voiceNotes: "id, villageId, createdAt",
  session: "villageId",
  done: "id, villageId, occurredAt",
});

export const dexieStore: DriverStore = {
  async pendingEvents(villageId) {
    const rows = await db.outbox.where("villageId").equals(villageId).toArray();
    return rows.filter((r) => r.status === "pending").sort((a, b) => a.queuedAt - b.queuedAt);
  },
  async removeEvents(ids) {
    await db.outbox.bulkDelete(ids);
  },
  async rejectEvents(rejected: SyncResponse["rejected"]) {
    await db.transaction("rw", db.outbox, async () => {
      for (const r of rejected) await db.outbox.update(r.id, { status: "rejected", error: r.error });
    });
  },
  async saveSnapshot(villageId: string, snapshot: Snapshot, at: number) {
    await db.snapshot.put({ villageId, snapshot, savedAt: at });
  },
  async notes(villageId) {
    return db.voiceNotes.where("villageId").equals(villageId).toArray();
  },
  async updateNote(id, patch) {
    await db.voiceNotes.update(id, patch);
  },
};

/** One id per phone, sent with every sync so the server can tell devices apart. */
export function deviceId(): string {
  const KEY = "imaq.deviceId";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "no-storage-device";
  }
}
