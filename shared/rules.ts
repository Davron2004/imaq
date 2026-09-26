/**
 * Plain rules, no AI. Everything here is a pure function a staff member could check by hand.
 * Thresholds come from VillageConfig. See docs/build-plan.md §8.
 */
import type { RequestKind } from "./types";

const RANK: Record<RequestKind, number> = { emergency: 0, out: 1, soon: 2, sewage: 3 };

/** Emergency → Out of water → Need water soon; oldest first within each. (Sewage has its own queue.) */
export function orderQueue<T extends { kind: RequestKind; createdAt: number }>(requests: readonly T[]): T[] {
  return [...requests].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.createdAt - b.createdAt);
}

/** Truckloads needed for a number of litres. */
export function loadsNeeded(litres: number, capacityLitres: number): number {
  return litres <= 0 ? 0 : Math.ceil(litres / capacityLitres);
}
