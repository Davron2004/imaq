/**
 * Shared contract between the Worker API and the web app.
 * Times are epoch milliseconds. Every record belongs to a village.
 */

export type RequestKind = "soon" | "out" | "emergency" | "sewage";
export type RequestSource = "resident" | "lit_door" | "office";
export type RequestStatus = "open" | "served" | "cancelled";
export type TruckKind = "water" | "sewage";
export type TruckStatus = "up" | "down";
export type StopOutcome = "delivered" | "failed";
export type FailReason = "road_blocked" | "no_access" | "frozen_pipe" | "truck_problem" | "other";
export type LogType = "truck_problem" | "couldnt_deliver" | "house_problem" | "road_blocked" | "other";
export type TruckCategory = "starting" | "heater" | "pump" | "hose" | "tires" | "brakes" | "other";
export type Severity = "fine" | "care" | "cant_drive";
export type CheckItem = "starts" | "heater" | "pump" | "hoses" | "other";
export type VoiceContext = "free" | "stop" | "check" | "down";
export type VoiceStatus = "uploaded" | "ready" | "needs_human" | "confirmed";
export type FlagKind = "mechanic" | "snow" | "repair";

export const REQUEST_KINDS: RequestKind[] = ["emergency", "out", "soon", "sewage"];
export const FAIL_REASONS: FailReason[] = ["road_blocked", "no_access", "frozen_pipe", "truck_problem", "other"];
export const LOG_TYPES: LogType[] = ["truck_problem", "couldnt_deliver", "house_problem", "road_blocked", "other"];
export const TRUCK_CATEGORIES: TruckCategory[] = ["starting", "heater", "pump", "hose", "tires", "brakes", "other"];
export const SEVERITIES: Severity[] = ["fine", "care", "cant_drive"];
export const CHECK_ITEMS: CheckItem[] = ["starts", "heater", "pump", "hoses", "other"];

/** Which truck kind serves a request kind. */
export const truckKindFor = (k: RequestKind): TruckKind => (k === "sewage" ? "sewage" : "water");

export interface VillageConfig {
  truckCapacityLitres: number; // 13,600 (APTN, Puvirnituq)
  defaultTankLitres: number; // 1,200 (Kangiqsualujjuaq study)
  waitingTooLongHours: number; // 24: "out of water" open longer than this is highlighted
  recurringProblemCount: number; // 3 confirmed reports…
  recurringProblemDays: number; // …within 7 days → "check with mechanic"
  emergencyContact: string; // free text the village sets, shown to residents
  maxVoiceNotesPerDay: number; // protects the free AI allocation
}

export const DEFAULT_CONFIG: VillageConfig = {
  truckCapacityLitres: 13600,
  defaultTankLitres: 1200,
  waitingTooLongHours: 24,
  recurringProblemCount: 3,
  recurringProblemDays: 7,
  emergencyContact: "If someone is in danger, call the nursing station or the police.",
  maxVoiceNotesPerDay: 60,
};

export interface Village {
  id: string;
  name: string;
  timezone: string;
  config: VillageConfig;
  isSandbox: boolean;
}

export interface House {
  id: string;
  label: string; // "House 14"
  x: number; // metres, village-local
  y: number;
  tankLitres: number;
  usesApp: boolean;
}

export interface TruckCheckSummary {
  at: number;
  passed: boolean;
  failed: CheckItem[];
}

export interface Truck {
  id: string;
  label: string; // "Truck 2"
  kind: TruckKind;
  capacityLitres: number;
  status: TruckStatus;
  downSince: number | null;
  downReason: string | null;
  /** Past completed down→back periods, most recent first, in days (1 decimal). A record, never a forecast. */
  downHistoryDays: number[];
  lastCheck: TruckCheckSummary | null;
}

export interface Attempt {
  stopId: string;
  at: number;
  reason: FailReason;
  truckId: string;
}

export interface OpenRequest {
  id: string;
  houseId: string;
  houseLabel: string;
  kind: RequestKind;
  source: RequestSource;
  createdAt: number;
  updatedAt: number;
  /** Litres to deliver, estimated from the tank size. */
  litres: number;
  /** Earlier couldn't-deliver stops for this request. The request stays open after a failed attempt. */
  attempts: Attempt[];
}

export interface Stop {
  id: string;
  houseId: string;
  houseLabel: string;
  truckId: string;
  requestId: string | null;
  driverInitials: string | null;
  litres: number;
  outcome: StopOutcome;
  reason: FailReason | null;
  voiceNoteId: string | null;
  occurredAt: number;
  voided: boolean;
}

/** The structured fields of a log entry, as the AI proposes them and a person confirms them. */
export interface LogFields {
  aboutTruckId: string | null;
  aboutHouseId: string | null;
  type: LogType;
  category: TruckCategory | null; // only for truck problems
  severity: Severity | null;
  summary: string; // one line, English
}

export interface LogEntry extends LogFields {
  id: string;
  source: "voice" | "office";
  voiceNoteId: string | null;
  transcript: string | null;
  language: string | null;
  occurredAt: number;
  confirmedAt: number;
}

export interface VoiceDraft extends LogFields {
  transcript: string;
  language: string | null; // detected, e.g. "en", "fr"
  confidence: number; // 0..1
  needsHuman: boolean;
  /** "fallback" = a stored result for a demo sample, used when the AI was unreachable or slow. */
  source: "ai" | "fallback" | "none";
}

export interface VoiceNoteInfo {
  id: string;
  status: VoiceStatus;
  context: VoiceContext;
  truckId: string | null;
  houseId: string | null;
  durationS: number;
  mime: string;
  createdAt: number;
  draft: VoiceDraft | null;
}

export interface Flag {
  /** Stable key, e.g. "mechanic:truck-2:heater". */
  id: string;
  kind: FlagKind;
  truckId: string | null;
  houseId: string | null;
  category: TruckCategory | null;
  /** Short subject for display, e.g. "Truck 2 · Heater" or "House 22". */
  subject: string;
  /** The confirmed log entries that raised this flag: the flag's explanation. */
  entryIds: string[];
  raisedAt: number;
}

export type FeedItem =
  | { id: string; at: number; kind: "stop"; stop: Stop }
  | { id: string; at: number; kind: "log"; entry: LogEntry }
  | { id: string; at: number; kind: "request"; request: OpenRequest | (Omit<OpenRequest, "attempts"> & { attempts?: Attempt[] }) }
  | { id: string; at: number; kind: "truck_down" | "truck_back"; truckId: string; reason: string | null };

export interface Snapshot {
  serverTime: number;
  village: Village;
  houses: House[];
  trucks: Truck[];
  /** All open requests, already in queue order (rules.orderQueue). */
  openRequests: OpenRequest[];
  flags: Flag[];
  /** Confirmed log entries referenced by flags and the feed. */
  logEntries: LogEntry[];
  /** Newest first, last ~60 items. */
  feed: FeedItem[];
  needsHuman: VoiceNoteInfo[];
  counts: {
    open: Record<RequestKind, number>;
    /** Ids of "out of water" requests open longer than waitingTooLongHours. */
    waitingTooLong: string[];
    oldestOpenAt: number | null;
  };
}

export interface ResidentRequest {
  id: string;
  kind: RequestKind;
  createdAt: number;
  /** Open requests ahead of this one in the same queue. Show as an approximate phrase. */
  aheadCount: number;
  lastAttempt: Attempt | null;
}

export interface ResidentView {
  serverTime: number;
  village: { id: string; name: string; emergencyContact: string };
  house: { id: string; label: string };
  water: ResidentRequest | null;
  sewage: ResidentRequest | null;
  trucksRunning: { water: { up: number; total: number }; sewage: { up: number; total: number } };
  lastDelivery: { water: number | null; sewage: number | null };
  /** The most recently closed request, so the app can say "Delivered 14:20" for a while. */
  lastClosed: { kind: RequestKind; status: "served" | "cancelled"; at: number } | null;
}

export interface DeliveryRow {
  stopId: string;
  houseId: string;
  houseLabel: string;
  truckLabel: string;
  litres: number;
  at: number;
}

export interface WeeklyRow {
  weekStart: number; // Monday 00:00 village time
  deliveries: number;
  couldntDeliver: number;
  homesWaitedOver24h: number;
  truckDownDays: number;
}
