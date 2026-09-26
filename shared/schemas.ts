/** Zod schemas for everything a client sends. Server validates with these; clients build payloads from the inferred types. */
import { z } from "zod";

const id = z.string().min(8).max(64);
const ms = z.number().int().nonnegative();

export const RequestKindZ = z.enum(["soon", "out", "emergency", "sewage"]);
export const FailReasonZ = z.enum(["road_blocked", "no_access", "frozen_pipe", "truck_problem", "other"]);
export const LogTypeZ = z.enum(["truck_problem", "couldnt_deliver", "house_problem", "road_blocked", "other"]);
export const TruckCategoryZ = z.enum(["starting", "heater", "pump", "hose", "tires", "brakes", "other"]);
export const SeverityZ = z.enum(["fine", "care", "cant_drive"]);
export const VoiceContextZ = z.enum(["free", "stop", "check", "down"]);

export const LogFieldsZ = z.object({
  aboutTruckId: z.string().nullable(),
  aboutHouseId: z.string().nullable(),
  type: LogTypeZ,
  category: TruckCategoryZ.nullable(),
  severity: SeverityZ.nullable(),
  summary: z.string().max(200),
});

/** Resident: create or change a request. A new water request replaces the level of an open one (keeps its createdAt). */
export const ResidentRequestZ = z.object({ id, kind: RequestKindZ });

/** Office: someone phoned in. */
export const OfficeRequestZ = z.object({ id, houseId: z.string(), kind: RequestKindZ });

/** Office: resolve a "needs a human" voice note, or log something directly. */
export const OfficeLogZ = z.object({ id, voiceNoteId: z.string().nullable(), fields: LogFieldsZ });

const envelope = { id, occurredAt: ms };

/** Driver outbox events. The event id is also the id of the row it creates, so re-sending is a no-op. */
export const OutboxEventZ = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("truck.check"), payload: z.object({
    truckId: z.string(),
    /** true = OK */
    items: z.object({ starts: z.boolean(), heater: z.boolean(), pump: z.boolean(), hoses: z.boolean(), other: z.boolean() }),
    voiceNoteId: z.string().nullable().optional(),
  }) }),
  z.object({ ...envelope, type: z.literal("truck.down"), payload: z.object({ truckId: z.string(), reason: TruckCategoryZ, voiceNoteId: z.string().nullable().optional() }) }),
  z.object({ ...envelope, type: z.literal("truck.back"), payload: z.object({ truckId: z.string() }) }),
  z.object({ ...envelope, type: z.literal("stop.delivered"), payload: z.object({
    houseId: z.string(), truckId: z.string(), requestId: z.string().nullable(),
    litres: z.number().int().min(0).max(20000), driverInitials: z.string().max(8).nullable().optional(),
    voiceNoteId: z.string().nullable().optional(),
  }) }),
  z.object({ ...envelope, type: z.literal("stop.failed"), payload: z.object({
    houseId: z.string(), truckId: z.string(), requestId: z.string().nullable(), reason: FailReasonZ,
    driverInitials: z.string().max(8).nullable().optional(), voiceNoteId: z.string().nullable().optional(),
  }) }),
  z.object({ ...envelope, type: z.literal("stop.void"), payload: z.object({ stopId: z.string() }) }),
  z.object({ ...envelope, type: z.literal("request.litDoor"), payload: z.object({ houseId: z.string(), kind: RequestKindZ, truckId: z.string() }) }),
  z.object({ ...envelope, type: z.literal("voice.confirm"), payload: z.object({ voiceNoteId: z.string(), fields: LogFieldsZ }) }),
  z.object({ ...envelope, type: z.literal("voice.needsHuman"), payload: z.object({ voiceNoteId: z.string() }) }),
]);

export const SyncRequestZ = z.object({ deviceId: z.string().max(64), events: z.array(OutboxEventZ).max(500) });

export type OutboxEvent = z.infer<typeof OutboxEventZ>;
export type OutboxEventType = OutboxEvent["type"];
export type SyncRequest = z.infer<typeof SyncRequestZ>;
export interface SyncResponse {
  acked: string[];
  /** Events the server could not apply (invalid references). The client drops them and shows them as failed. */
  rejected: { id: string; error: string }[];
  snapshot: import("./types").Snapshot;
}
