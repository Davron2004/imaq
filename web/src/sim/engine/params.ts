import type { SimParams } from "./types";

/**
 * Default parameters. Every value here is shown in the assumptions panel with its source
 * (see `PARAM_SOURCES`). Tune only within plausible ranges.
 */
export const DEFAULT_PARAMS: SimParams = {
  seed: 1,
  days: 7,
  houseCount: 48,
  truckCount: 3,
  truckCapacityL: 13_600,
  truckSpeedKmh: 15,
  stopHookupMin: 5,
  pumpLPerMin: 200,
  fullFillMin: 25,
  serviceStartMin: 8 * 60,
  serviceEndMin: 17 * 60,
  useStartMin: 7 * 60,
  useEndMin: 23 * 60,
  lightAtFraction: 0.25,
  appAdoption: 0.8,
  tankMinL: 900,
  tankMaxL: 2_000,
  tankModeL: 1_200,
  lastsMinDays: 1,
  lastsMaxDays: 2.5,
  spotRangeM: 40,
  idleWaitMin: 45,
  startLevelMin: 0.5,
};

export type ParamSource = "study" | "amenda" | "aptn" | "assumption";

/** Source of each parameter, for the assumptions panel. */
export const PARAM_SOURCES: Partial<Record<keyof SimParams, ParamSource>> = {
  houseCount: "assumption",
  truckCount: "amenda",
  truckCapacityL: "aptn",
  truckSpeedKmh: "assumption",
  stopHookupMin: "assumption",
  pumpLPerMin: "assumption",
  fullFillMin: "assumption",
  serviceStartMin: "assumption",
  lightAtFraction: "assumption",
  appAdoption: "assumption",
  tankModeL: "study",
  lastsMaxDays: "study",
  useStartMin: "assumption",
};
