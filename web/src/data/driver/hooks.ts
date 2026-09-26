import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Snapshot } from "../../../../shared/types";
import { db } from "./db";
import { FORCE_OFFLINE_KEY, type EngineState } from "./engine";
import { getEngine } from "./actions";
import { applyPending } from "./optimistic";
import type { DoneRow, OutboxRow, SessionRow, VoiceNoteRow } from "./types";

const SYNC_EVERY_MS = 15000;

export function useEngineState(villageId: string): EngineState {
  const engine = getEngine(villageId);
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.state,
  );
}

/** Wires the sync triggers: mount, `online`, focus/visible, demo-switch changes, and every 15 s while anything is pending. */
export function useSyncTriggers(villageId: string, hasPending: boolean) {
  useEffect(() => {
    const engine = getEngine(villageId);
    const kick = () => void engine.sync();
    const onVisible = () => document.visibilityState === "visible" && kick();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === FORCE_OFFLINE_KEY) {
        engine.refreshForced();
        kick();
      }
    };
    kick();
    window.addEventListener("online", kick);
    window.addEventListener("focus", kick);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", kick);
      window.removeEventListener("focus", kick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [villageId]);

  useEffect(() => {
    if (!hasPending) return;
    const engine = getEngine(villageId);
    const timer = setInterval(() => void engine.sync(), SYNC_EVERY_MS);
    return () => clearInterval(timer);
  }, [villageId, hasPending]);
}

export interface DriverData {
  loaded: boolean;
  /** Cached snapshot with pending events applied. null = never synced on this phone. */
  snapshot: Snapshot | null;
  snapshotSavedAt: number | null;
  session: SessionRow | null;
  pending: OutboxRow[];
  rejected: OutboxRow[];
  notes: VoiceNoteRow[];
  done: DoneRow[];
  engine: EngineState;
}

/** A clock that ticks every 30 s so waiting ages stay fresh. */
export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function useDriverData(villageId: string): DriverData {
  const snapRow = useLiveQuery(() => db.snapshot.get(villageId), [villageId], null);
  const outbox = useLiveQuery(() => db.outbox.where("villageId").equals(villageId).sortBy("queuedAt"), [villageId]);
  const session = useLiveQuery(() => db.session.get(villageId), [villageId], null);
  const notes = useLiveQuery(() => db.voiceNotes.where("villageId").equals(villageId).sortBy("createdAt"), [villageId]);
  const done = useLiveQuery(() => db.done.where("villageId").equals(villageId).reverse().sortBy("occurredAt"), [villageId]);
  const engine = useEngineState(villageId);

  const pending = useMemo(() => (outbox ?? []).filter((r) => r.status === "pending"), [outbox]);
  const rejected = useMemo(() => (outbox ?? []).filter((r) => r.status === "rejected"), [outbox]);
  const snapshot = useMemo(
    () => (snapRow ? applyPending(snapRow.snapshot, pending.map((r) => r.event)) : null),
    [snapRow, pending],
  );
  useSyncTriggers(villageId, pending.length > 0 || (notes ?? []).some((n) => n.upload !== "processed"));

  return {
    loaded: outbox !== undefined && notes !== undefined && done !== undefined && snapRow !== null && session !== null,
    snapshot,
    snapshotSavedAt: snapRow?.savedAt ?? null,
    session: session ?? null,
    pending,
    rejected,
    notes: notes ?? [],
    done: done ?? [],
    engine,
  };
}
