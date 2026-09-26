/** What the driver sees: the cached snapshot with pending outbox events applied on top. Pure. */
import type { OutboxEvent } from "../../../../shared/schemas";
import type { CheckItem, OpenRequest, Snapshot, Truck } from "../../../../shared/types";
import { truckKindFor } from "../../../../shared/types";
import { orderQueue } from "../../../../shared/rules";

export function applyPending(snap: Snapshot, events: readonly OutboxEvent[]): Snapshot {
  let requests: OpenRequest[] = snap.openRequests;
  let trucks: Truck[] = snap.trucks;
  const setTruck = (id: string, f: (t: Truck) => Truck) => {
    trucks = trucks.map((t) => (t.id === id ? f(t) : t));
  };

  for (const e of events) {
    switch (e.type) {
      case "stop.delivered":
        requests = requests.filter((r) => (e.payload.requestId ? r.id !== e.payload.requestId : true));
        break;
      case "stop.failed":
        requests = requests.map((r) =>
          r.id === e.payload.requestId && !r.attempts.some((a) => a.stopId === e.id)
            ? { ...r, attempts: [...r.attempts, { stopId: e.id, at: e.occurredAt, reason: e.payload.reason, truckId: e.payload.truckId }] }
            : r,
        );
        break;
      case "request.litDoor": {
        const p = e.payload;
        const kindGroup = truckKindFor(p.kind);
        const dup = requests.some((r) => r.id === e.id || (r.houseId === p.houseId && truckKindFor(r.kind) === kindGroup));
        const house = snap.houses.find((h) => h.id === p.houseId);
        if (!dup && house) {
          requests = [
            ...requests,
            {
              id: e.id,
              houseId: house.id,
              houseLabel: house.label,
              kind: p.kind,
              source: "lit_door",
              createdAt: e.occurredAt,
              updatedAt: e.occurredAt,
              litres: house.tankLitres || snap.village.config.defaultTankLitres,
              attempts: [],
            },
          ];
        }
        break;
      }
      case "truck.down":
        setTruck(e.payload.truckId, (t) => ({ ...t, status: "down", downSince: t.status === "down" ? t.downSince : e.occurredAt, downReason: e.payload.reason }));
        break;
      case "truck.back":
        setTruck(e.payload.truckId, (t) => ({ ...t, status: "up", downSince: null, downReason: null }));
        break;
      case "truck.check": {
        const failed = (Object.entries(e.payload.items) as [CheckItem, boolean][]).filter(([, ok]) => !ok).map(([k]) => k);
        setTruck(e.payload.truckId, (t) => ({
          ...t,
          lastCheck: { at: e.occurredAt, passed: failed.length === 0, failed },
          ...(failed.length
            ? { status: "down" as const, downSince: t.status === "down" ? t.downSince : e.occurredAt, downReason: t.downReason ?? failed.join(", ") }
            : {}),
        }));
        break;
      }
      default:
        break;
    }
  }

  // Keep the rules' order: per truck kind, emergency → out → soon, oldest first.
  const water = orderQueue(requests.filter((r) => r.kind !== "sewage"));
  const sewage = orderQueue(requests.filter((r) => r.kind === "sewage"));
  return { ...snap, openRequests: [...water, ...sewage], trucks };
}
