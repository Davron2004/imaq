/**
 * Driver sync engine.
 *
 * One run (single-flight; a trigger during a run schedules one more run):
 *   1. upload audio of voice notes that are only on the phone (PUT, idempotent)
 *   2. POST pending outbox events (held back: events pointing at a voice note whose audio isn't uploaded yet)
 *      → delete acked, mark rejected, replace the cached snapshot
 *   3. ask the server to process uploaded notes that have no draft yet
 *
 * "Online" = the last request succeeded. navigator.onLine is never consulted.
 * Demo offline switch (localStorage imaq.forceOffline = "1"): no network calls at all.
 */
import type { OutboxEvent, SyncResponse } from "../../../../shared/schemas";
import type { VoiceNoteInfo } from "../../../../shared/types";
import type { DriverStore, VoiceNoteRow } from "./types";

export const FORCE_OFFLINE_KEY = "imaq.forceOffline";
export const SYNC_TIMEOUT_MS = 5000;
const UPLOAD_TIMEOUT_MS = 30000;
const PROCESS_TIMEOUT_MS = 20000;
const BATCH = 100;

export type Connectivity = "unknown" | "online" | "offline" | "error";

export interface EngineState {
  syncing: boolean;
  /** Result of the last network attempt. "error" = reached the server but it failed (will retry). */
  connectivity: Connectivity;
  lastOkAt: number | null;
  forcedOffline: boolean;
  uploading: string[];
  processing: string[];
}

export interface EngineDeps {
  villageId: string;
  deviceId: string;
  store: DriverStore;
  fetch: typeof fetch;
  forcedOffline: () => boolean;
  now: () => number;
  /** Persisted "last synced at", so "All synced 11:05" survives a reload. */
  loadLastOk?: () => number | null;
  saveLastOk?: (at: number) => void;
}

class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

export function eventVoiceNoteId(e: OutboxEvent): string | null {
  const p = e.payload as { voiceNoteId?: string | null };
  return p.voiceNoteId ?? null;
}

export class SyncEngine {
  private listeners = new Set<(s: EngineState) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  /** Event ids currently in a POST. Undo must not delete these from the outbox; it must void instead. */
  readonly inFlight = new Set<string>();
  state: EngineState;

  constructor(private deps: EngineDeps) {
    this.state = {
      syncing: false,
      connectivity: "unknown",
      lastOkAt: deps.loadLastOk?.() ?? null,
      forcedOffline: deps.forcedOffline(),
      uploading: [],
      processing: [],
    };
  }

  subscribe(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  /** Re-read the demo switch (call on `storage` events). */
  refreshForced() {
    const forced = this.deps.forcedOffline();
    if (forced !== this.state.forcedOffline) this.set({ forcedOffline: forced });
  }

  /** Run a sync now. Resolves when this run (and any run queued behind it) finishes. Never throws. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await this.deps.fetch(`/api/v/${encodeURIComponent(this.deps.villageId)}${path}`, { ...init, signal: ctrl.signal });
      if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => res.statusText));
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private markResult(err: unknown | null) {
    if (err === null) {
      const at = this.deps.now();
      this.deps.saveLastOk?.(at);
      this.set({ connectivity: "online", lastOkAt: at });
    } else {
      this.set({ connectivity: err instanceof HttpError ? "error" : "offline" });
    }
  }

  private async runOnce() {
    this.refreshForced();
    if (this.state.forcedOffline) return;
    const { store, villageId, deviceId } = this.deps;
    this.set({ syncing: true });
    try {
      // 1. audio
      const notes = await store.notes(villageId);
      for (const n of notes.filter((n) => n.upload === "saved")) {
        if (this.deps.forcedOffline()) return;
        await this.upload(n); // throws on network failure → whole run stops, will retry
      }

      // 2. events
      const uploaded = new Set((await store.notes(villageId)).filter((n) => n.upload !== "saved").map((n) => n.id));
      const localNotes = new Set(notes.map((n) => n.id));
      const pending = (await store.pendingEvents(villageId)).filter((r) => {
        const v = eventVoiceNoteId(r.event);
        return !v || !localNotes.has(v) || uploaded.has(v);
      });
      let sentAny = false;
      for (let i = 0; i === 0 || i < pending.length; i += BATCH) {
        if (this.deps.forcedOffline()) return;
        const batch = pending.slice(i, i + BATCH);
        batch.forEach((r) => this.inFlight.add(r.id));
        try {
          const res = await this.request<SyncResponse>(
            "/sync",
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, events: batch.map((r) => r.event) }) },
            SYNC_TIMEOUT_MS,
          );
          await store.removeEvents(res.acked);
          if (res.rejected.length) await store.rejectEvents(res.rejected);
          await store.saveSnapshot(villageId, res.snapshot, this.deps.now());
          sentAny = true;
        } finally {
          batch.forEach((r) => this.inFlight.delete(r.id));
        }
      }
      if (sentAny) this.markResult(null);

      // 3. drafts
      for (const n of (await store.notes(villageId)).filter((n) => n.upload === "uploaded")) {
        if (this.deps.forcedOffline()) return;
        await this.process(n);
      }
    } catch (err) {
      this.markResult(err);
    } finally {
      this.set({ syncing: false });
    }
  }

  private async upload(n: VoiceNoteRow) {
    this.set({ uploading: [...this.state.uploading, n.id] });
    try {
      const q = new URLSearchParams({ context: n.context, durationS: String(Math.round(n.durationS)), createdAt: String(n.createdAt) });
      if (n.truckId) q.set("truckId", n.truckId);
      if (n.houseId) q.set("houseId", n.houseId);
      if (n.sampleId) q.set("sampleId", n.sampleId);
      const info = await this.request<VoiceNoteInfo>(
        `/voice-notes/${encodeURIComponent(n.id)}?${q}`,
        { method: "PUT", headers: { "content-type": n.mime }, body: n.blob },
        UPLOAD_TIMEOUT_MS,
      );
      await this.deps.store.updateNote(n.id, { upload: info.draft ? "processed" : "uploaded", info });
      this.markResult(null);
    } catch (err) {
      // 4xx on upload (too long, daily limit): don't retry forever; keep it local and visible.
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
        await this.deps.store.updateNote(n.id, { upload: "processed", info: null });
        this.markResult(null);
        return;
      }
      throw err;
    } finally {
      this.set({ uploading: this.state.uploading.filter((id) => id !== n.id) });
    }
  }

  private async process(n: VoiceNoteRow) {
    this.set({ processing: [...this.state.processing, n.id] });
    try {
      const info = await this.request<VoiceNoteInfo>(`/voice-notes/${encodeURIComponent(n.id)}/process`, { method: "POST" }, PROCESS_TIMEOUT_MS);
      await this.deps.store.updateNote(n.id, { upload: info.draft ? "processed" : "uploaded", info });
      this.markResult(null);
    } finally {
      this.set({ processing: this.state.processing.filter((id) => id !== n.id) });
    }
  }
}
