/**
 * Simulation contract. The renderer reads ONLY these types; the engine owns everything else.
 *
 * Units: distances in metres on a 2000 × 1400 m map (origin top-left, y down), time in whole
 * simulated minutes since the start of Day 1 00:00 (`minute`), water in litres.
 *
 * Truck state machine (both worlds; `scouting` and `sweeping` differ by policy):
 *
 *   idle ──(service opens 08:00, has zones)──► scouting (Today) / delivering or sweeping (Imaq)
 *   scouting ──(lap done, lit doors seen)──► toPlant (via garage) or delivering (if water on board)
 *   scouting ──(lap done, nothing seen)──► returning ──► idle (waits, then laps again)
 *   toPlant ──► filling ──► delivering
 *   delivering ──(stop list empty / tank empty)──► toPlant | scouting (Today next cycle) | sweeping (Imaq)
 *   sweeping ──(lap done, nothing found)──► returning ──► idle (Imaq waits at garage for requests)
 *   ANY running state ──(17:00)──► returning ──► idle          (service hours 08:00–17:00)
 *   ANY state ──(scripted breakdown)──► down (towed to garage) ──(scripted repair)──► idle
 *   ANY non-down state ──(blizzard day)──► held (at garage) ──(blizzard ends)──► idle
 *
 * `down` and `held` are only left by the scenario script, never by the policy.
 */

export type WorldId = "today" | "imaq";

export type TruckState =
  | "idle" // parked at garage, no work or outside service hours
  | "scouting" // Today only: driving the zone lap to spot lit doors
  | "sweeping" // Imaq only: queue empty, driving a lap to spot lit doors of homes without the app
  | "toPlant" // driving to the water plant
  | "filling" // at the plant, filling
  | "delivering" // driving to a house or pumping water at a house
  | "returning" // driving back to the garage
  | "down" // broken down at the garage (scripted)
  | "held"; // held at the garage by the blizzard (scripted)

/** Request priority on the Imaq side. Today side uses only `emergency` vs normal. */
export type Priority = "emergency" | "out" | "soon";

export interface Point {
  x: number;
  y: number;
}

/** Static village layout, identical in both worlds. */
export interface Village {
  width: number; // metres
  height: number; // metres
  /** Horizontal streets (y in metres); every house, the plant and the garage sit on one. */
  streets: number[];
  /** Vertical connector roads (x in metres) linking the streets. */
  avenues: number[];
  /** Street segments to draw: [x1, x2] span per street, plus avenues span full street range. */
  streetSpan: [number, number];
  plant: Point;
  garage: Point;
  houses: HouseStatic[];
  /** zone index (0..2) → house ids. Zone i belongs to Truck i+1 while it runs. */
  zones: number[][];
}

export interface HouseStatic {
  id: number; // 0-based; shown as "House {id+1}"
  x: number; // road position (on the street)
  y: number; // road y
  /** Drawing offset from the road: houses sit slightly above or below the street. */
  side: -1 | 1;
  zone: number;
  tankL: number;
  dailyUseL: number;
  /** Imaq world only: this home uses the app. Same set in both worlds (unused in Today). */
  usesApp: boolean;
}

/** Per-world, per-house dynamic state. */
export interface HouseState {
  levelL: number;
  /** Door light on (tank at or below 25%, or emergency) and not yet refilled. */
  lightOn: boolean;
  /** Minute the light came on (waiting clock starts here in both worlds); -1 if off. */
  lightOnAt: number;
  /** Tank empty. */
  dry: boolean;
  emergency: boolean;
  /** Imaq: request known to the queue (app request or lit door marked by a driver). Today: lit door seen by a driver. */
  known: boolean;
  /** Imaq only: current priority of the known request. */
  priority: Priority | null;
  /** Minute of the last delivery, -1 if none. Renderer shows "just delivered" for 60 sim minutes. */
  lastDeliveredAt: number;
  /** Truck id (0-based) currently heading here, -1 if none. */
  claimedBy: number;
}

export interface TruckStateObj {
  id: number; // 0-based; shown as "Truck {id+1}"
  state: TruckState;
  /** Position at the end of the previous step and now; renderer interpolates between them. */
  prev: Point;
  pos: Point;
  waterL: number;
  capacityL: number;
  /** Zones this truck currently covers (own zone plus zones of down trucks). */
  zones: number[];
  /** Target house id while delivering, -1 otherwise. */
  target: number;
  kmDriven: number;
}

export interface Metrics {
  dryNow: number;
  /** Sum over houses of minutes spent dry, / 60. */
  householdHoursDry: number;
  km: number;
  deliveries: number;
  /** Longest current wait in minutes, measured from light-on (both worlds), 0 if none. */
  oldestWaitMin: number;
  /** Longest wait seen so far in the run, minutes. */
  maxWaitMin: number;
}

export interface WorldState {
  id: WorldId;
  houses: HouseState[];
  trucks: TruckStateObj[];
  metrics: Metrics;
  /** Per completed day (index 0 = Day 1): max dry homes at any moment, household-hours at day end. */
  daily: { maxDry: number; householdHoursDry: number; deliveries: number; km: number }[];
}

/** Ticker / timeline events. `important` ones should be held on screen for a few real seconds. */
export type SimEventKind =
  | "appRequest" // Imaq: resident taps "Need water soon"
  | "appOut" // Imaq: resident upgrades to "Out of water"
  | "litDoorMarked" // Imaq: driver marks lit door of a home without the app
  | "delivered"
  | "emergency" // household declares an emergency (both worlds)
  | "voiceNote" // Imaq: driver voice note → structured entry
  | "heaterReport" // Imaq: another heater report logged
  | "mechanicFlag" // Imaq: third heater report → check with mechanic
  | "truckDown"
  | "truckBack"
  | "blizzardStart"
  | "blizzardEnd"
  | "dayStart";

export interface SimEvent {
  minute: number;
  world: WorldId | "both";
  kind: SimEventKind;
  house?: number;
  truck?: number;
  /** For voiceNote: index into the scripted quotes (renderer looks up text via i18n). */
  note?: number;
  important?: boolean;
}

/** A scripted scenario marker, drawn on the timeline. */
export interface ScenarioMarker {
  minute: number;
  kind: "truckDown" | "truckBack" | "blizzardStart" | "blizzardEnd" | "mechanicFlag" | "emergency";
  truck?: number;
  house?: number;
}

export interface SimParams {
  seed: number;
  days: number;
  houseCount: number;
  truckCount: number;
  truckCapacityL: number;
  truckSpeedKmh: number;
  stopHookupMin: number;
  pumpLPerMin: number;
  fullFillMin: number;
  serviceStartMin: number; // minutes after midnight
  serviceEndMin: number;
  useStartMin: number; // water drawn evenly over waking hours
  useEndMin: number;
  lightAtFraction: number; // door light / app request trigger
  appAdoption: number; // 0..1
  tankMinL: number;
  tankMaxL: number;
  tankModeL: number;
  lastsMinDays: number;
  lastsMaxDays: number;
  /** Today: a driver notices a lit door within this many metres along the street. */
  spotRangeM: number;
  /** Idle wait at the garage before another lap when nothing was found (minutes). */
  idleWaitMin: number;
  /** Tanks start the week between this fraction and full. */
  startLevelMin: number;
}

export interface SimState {
  params: SimParams;
  village: Village;
  minute: number;
  totalMinutes: number;
  blizzard: boolean;
  worlds: Record<WorldId, WorldState>;
  /** Scripted events (Truck 2 breaks, etc.) for the timeline. */
  markers: ScenarioMarker[];
  /** Append-only event log. Renderer reads the tail for the ticker. */
  events: SimEvent[];
  done: boolean;
}
