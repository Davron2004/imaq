/** Local (on-phone) records for the driver app. Storage-agnostic so the sync engine can be tested without IndexedDB. */
import type { OutboxEvent, SyncResponse } from "../../../../shared/schemas";
import type { FailReason, Snapshot, StopOutcome, VoiceContext, VoiceNoteInfo } from "../../../../shared/types";

export type OutboxStatus = "pending" | "rejected";

export interface OutboxRow {
  id: string; // = event.id
  villageId: string;
  event: OutboxEvent;
  status: OutboxStatus;
  error: string | null;
  queuedAt: number;
}

export interface SnapshotRow {
  villageId: string;
  snapshot: Snapshot;
  savedAt: number;
}

/**
 * Upload state of a voice note on this phone:
 *   saved     → audio only on the phone
 *   uploaded  → server has the audio, no draft yet
 *   processed → server returned a draft (info.draft)
 * `resolution` is what the driver did with the draft (queued as an outbox event).
 */
export type NoteUpload = "saved" | "uploaded" | "processed";

export interface VoiceNoteRow {
  id: string;
  villageId: string;
  blob: Blob;
  mime: string;
  durationS: number;
  context: VoiceContext;
  truckId: string | null;
  houseId: string | null;
  createdAt: number;
  sampleId: string | null;
  upload: NoteUpload;
  info: VoiceNoteInfo | null;
  resolution: "confirmed" | "needsHuman" | null;
}

export interface SessionRow {
  villageId: string;
  truckId: string | null;
  initials: string | null;
  /** Local day key (YYYY-MM-DD) + truck of the last pre-trip check done on this phone. */
  checkedDay: string | null;
  checkedTruckId: string | null;
}

/** This shift's stops, kept locally so "Done today" survives the outbox being emptied by sync. */
export interface DoneRow {
  id: string; // = stop event id = server stop id
  villageId: string;
  truckId: string;
  houseId: string;
  houseLabel: string;
  requestId: string | null;
  outcome: StopOutcome;
  litres: number;
  reason: FailReason | null;
  occurredAt: number;
  voided: boolean;
}

/** What the sync engine needs from storage. Implemented by Dexie in the app and by memory in tests. */
export interface DriverStore {
  pendingEvents(villageId: string): Promise<OutboxRow[]>;
  removeEvents(ids: string[]): Promise<void>;
  rejectEvents(rejected: SyncResponse["rejected"]): Promise<void>;
  saveSnapshot(villageId: string, snapshot: Snapshot, at: number): Promise<void>;
  notes(villageId: string): Promise<VoiceNoteRow[]>;
  updateNote(id: string, patch: Partial<VoiceNoteRow>): Promise<void>;
}
