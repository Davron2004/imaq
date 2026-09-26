/** Pure view-model builders. No React, no storage: easy to test and to restyle around. */
import type { OpenRequest, RequestKind, Snapshot, Truck } from "../../../../shared/types";
import { loadsNeeded } from "../../../../shared/rules";
import { formatAge, formatTime, t } from "../../i18n";
import type { EngineState } from "../../data/driver/engine";
import type { DoneRow, OutboxRow, VoiceNoteRow } from "../../data/driver/types";

export type SyncTone = "ok" | "offline" | "busy" | "retry" | "forced" | "never";
export interface SyncVm {
  tone: SyncTone;
  text: string;
  waiting: number;
}

export function syncVm(e: EngineState, pendingEvents: number, notesWaiting: number): SyncVm {
  const waiting = pendingEvents + notesWaiting;
  if (e.forcedOffline) return { tone: "forced", waiting, text: waiting ? t("driver.sync.forcedCount", { count: waiting }) : t("driver.sync.forced") };
  if (e.syncing) return { tone: "busy", waiting, text: t("driver.sync.syncing") };
  if (e.connectivity === "offline") return { tone: "offline", waiting, text: waiting ? t("driver.sync.offline", { count: waiting }) : t("driver.sync.offlineNone") };
  if (e.connectivity === "error") return { tone: "retry", waiting, text: t("driver.sync.willRetry", { count: waiting }) };
  if (waiting) return { tone: "busy", waiting, text: t("driver.sync.waiting", { count: waiting }) };
  if (e.lastOkAt) return { tone: "ok", waiting, text: t("driver.sync.allSynced", { time: formatTime(e.lastOkAt) }) };
  return { tone: "never", waiting, text: t("driver.sync.neverSynced") };
}

export function eventLabel(r: OutboxRow, snap: Snapshot | null): string {
  const e = r.event;
  const base = t(`driver.event.${e.type}`);
  const p = e.payload as { houseId?: string; truckId?: string };
  const house = p.houseId ? snap?.houses.find((h) => h.id === p.houseId)?.label : undefined;
  const truck = p.truckId ? snap?.trucks.find((x) => x.id === p.truckId)?.label : undefined;
  return [base, house ?? truck, formatTime(e.occurredAt)].filter(Boolean).join(" · ");
}

export const requestsForTruck = (snap: Snapshot, truck: Truck): OpenRequest[] =>
  snap.openRequests.filter((r) => (truck.kind === "sewage" ? r.kind === "sewage" : r.kind !== "sewage"));

export interface RowVm {
  id: string;
  houseLabel: string;
  kind: RequestKind;
  kindText: string;
  waitingText: string;
  sourceText: string;
  litres: number;
  litresText: string;
  attemptsText: string[];
}

export interface ListVm {
  truckLabel: string;
  truckDown: boolean;
  summaryText: string;
  /** Just the number, e.g. "3,600" (the big figure on the load summary). */
  litresNumber: string;
  loadsText: string;
  /** "2 loads at current capacity". */
  loadsLongText: string;
  stopsText: string;
  counts: { kind: RequestKind; text: string; count: number }[];
  rows: RowVm[];
}

const nf = new Intl.NumberFormat("en-CA");

export function listVm(snap: Snapshot, truck: Truck, now: number): ListVm {
  const reqs = requestsForTruck(snap, truck);
  const litres = reqs.reduce((s, r) => s + r.litres, 0);
  const loads = loadsNeeded(litres, truck.capacityLitres || snap.village.config.truckCapacityLitres);
  const kinds: RequestKind[] = truck.kind === "sewage" ? ["sewage"] : ["emergency", "out", "soon"];
  return {
    truckLabel: truck.label,
    truckDown: truck.status === "down",
    summaryText: t("driver.list.summary", { litres: nf.format(litres) }),
    litresNumber: nf.format(litres),
    loadsText: t("driver.list.loads", { count: loads }),
    loadsLongText: t("driver.list.loadsAt", { count: loads }),
    stopsText: t("driver.list.stops", { count: reqs.length }),
    counts: kinds.map((k) => ({ kind: k, count: reqs.filter((r) => r.kind === k).length, text: t(`common.request.${k}`) })),
    rows: reqs.map((r) => ({
      id: r.id,
      houseLabel: r.houseLabel,
      kind: r.kind,
      kindText: t(`common.request.${r.kind}`),
      waitingText: t("driver.list.waiting", { age: formatAge(now - r.createdAt) }),
      sourceText: t(`common.source.${r.source}`),
      litres: r.litres,
      litresText: t("driver.list.litres", { litres: nf.format(r.litres) }),
      attemptsText: r.attempts.map((a) => t("driver.list.tried", { time: formatTime(a.at), reason: t(`common.reason.${a.reason}`) })),
    })),
  };
}

export type NoteState = "saved" | "uploading" | "understanding" | "ready" | "needs_human" | "confirmed" | "sentToHuman" | "uploadFailed";

export function noteState(n: VoiceNoteRow, e: EngineState): NoteState {
  if (n.resolution === "confirmed") return "confirmed";
  if (n.resolution === "needsHuman") return "sentToHuman";
  if (e.uploading.includes(n.id)) return "uploading";
  if (n.upload === "saved") return "saved";
  if (n.upload === "uploaded") return "understanding";
  if (!n.info) return "uploadFailed";
  if (n.info.status === "confirmed") return "confirmed";
  if (!n.info.draft) return "understanding";
  return n.info.draft.needsHuman || n.info.status === "needs_human" ? "needs_human" : "ready";
}

export function noteStateText(s: NoteState): string {
  switch (s) {
    case "saved": return t("common.voice.saved");
    case "uploading": return t("driver.voice.state.uploading");
    case "understanding": return t("common.voice.understanding");
    case "ready": return t("common.voice.ready");
    case "needs_human": return t("common.voice.needs_human");
    case "confirmed": return t("common.voice.confirmed");
    case "sentToHuman": return t("driver.voice.state.sentToHuman");
    case "uploadFailed": return t("driver.voice.state.uploadFailed");
  }
}

/** Notes waiting for the driver: a draft arrived and nobody has acted on it yet. */
export const inboxNotes = (notes: VoiceNoteRow[], e: EngineState) =>
  notes.filter((n) => {
    const s = noteState(n, e);
    return s === "ready" || s === "needs_human";
  });

export const todaysDone = (done: DoneRow[], truckId: string | null, now: number) => {
  const day = new Date(now).toDateString();
  return done.filter((d) => new Date(d.occurredAt).toDateString() === day && (!truckId || d.truckId === truckId));
};
