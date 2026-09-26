/** Data + actions for the driver app. Views never touch storage or the engine; they get view models and callbacks from here. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CheckItem, Truck } from "../../../../shared/types";
import type { SessionRow } from "../../data/driver/types";
import * as A from "../../data/driver/actions";
import { useDriverData, type DriverData } from "../../data/driver/hooks";
import { warmSamples } from "../../data/driver/recorder";
import { t } from "../../i18n";
import { syncVm, type SyncVm } from "./model";

export interface UndoState {
  stopId: string;
  text: string;
  houseLabel: string;
}

export interface DriverApp {
  villageId: string;
  data: DriverData;
  truck: Truck | null;
  sync: SyncVm;
  notesWaiting: number;
  isDemo: boolean;
  announce: (msg: string) => void;
  announcement: string;
  /** Sync changes get their own live region so they never overwrite "Delivered · House 14". */
  syncAnnouncement: string;
  undo: UndoState | null;
  showUndo: (u: UndoState) => void;
  doUndo: () => void;
  actions: typeof A;
  session: SessionRow | null;
  chooseTruck: (truckId: string) => void;
  setInitials: (v: string) => void;
  truckCheck: (truckId: string, items: Record<CheckItem, boolean>, voiceNoteId: string | null) => void;
}

export const UNDO_MS = 8000;

export function useDriverApp(villageId: string): DriverApp {
  const data = useDriverData(villageId);
  // Session changes are applied in memory at once (then written to Dexie), so navigation right after
  // picking a truck or passing the check never sees the old value from the live query.
  const [local, setLocal] = useState<Partial<SessionRow>>({});
  const session: SessionRow | null =
    data.session || Object.keys(local).length
      ? { villageId, truckId: null, initials: null, checkedDay: null, checkedTruckId: null, ...data.session, ...local }
      : null;
  const [announcement, setAnnouncement] = useState("");
  const [syncAnnouncement, setSyncAnnouncement] = useState("");
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimer = useRef<number | null>(null);

  const announce = useCallback((msg: string) => {
    // Clear first so the same message twice is still announced.
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(msg), 50);
  }, []);

  const notesWaiting = data.notes.filter((n) => n.upload === "saved").length;
  const sync = syncVm(data.engine, data.pending.length, notesWaiting);
  const truck = useMemo(
    () => data.snapshot?.trucks.find((x) => x.id === session?.truckId) ?? null,
    [data.snapshot, session?.truckId],
  );

  // Announce meaningful sync changes (not every "Syncing…").
  const lastTone = useRef(sync.tone);
  useEffect(() => {
    if (sync.tone === lastTone.current) return;
    if (sync.tone === "ok") setSyncAnnouncement(t("driver.sync.announceSynced"));
    if (sync.tone === "offline" || sync.tone === "forced") setSyncAnnouncement(t("driver.sync.announceOffline"));
    lastTone.current = sync.tone;
  }, [sync.tone]);

  useEffect(() => {
    void warmSamples();
  }, []);

  const showUndo = useCallback((u: UndoState) => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }, []);

  const doUndo = useCallback(() => {
    if (!undo) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    void A.voidStop(villageId, undo.stopId);
    announce(t("driver.undo.undone", { house: undo.houseLabel }));
    setUndo(null);
  }, [undo, villageId, announce]);

  useEffect(() => () => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }, []);

  return {
    villageId,
    data,
    truck,
    sync,
    notesWaiting,
    isDemo: villageId === "demo" || !!data.snapshot?.village.isSandbox,
    announce,
    announcement,
    syncAnnouncement,
    undo,
    showUndo,
    doUndo,
    actions: A,
    session,
    chooseTruck: (truckId) => {
      setLocal((p) => ({ ...p, truckId }));
      void A.chooseTruck(villageId, truckId);
    },
    setInitials: (v) => {
      setLocal((p) => ({ ...p, initials: v }));
      void A.setInitials(villageId, v);
    },
    truckCheck: (truckId, items, voiceNoteId) => {
      setLocal((p) => ({ ...p, checkedDay: A.todayKey(), checkedTruckId: truckId }));
      void A.truckCheck(villageId, truckId, items, voiceNoteId);
    },
  };
}

export const DriverCtx = createContext<DriverApp | null>(null);
export function useDriver(): DriverApp {
  const v = useContext(DriverCtx);
  if (!v) throw new Error("useDriver outside DriverScreen");
  return v;
}
