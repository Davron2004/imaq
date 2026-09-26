import { DEFAULT_PARAMS } from "./params";
import { mulberry32, triangular } from "./rng";
import type {
  HouseState,
  Point,
  Priority,
  ScenarioMarker,
  SimEvent,
  SimParams,
  SimState,
  TruckStateObj,
  Village,
  WorldId,
  WorldState,
} from "./types";

const DAY = 1440;
const at = (day: number, h: number, m = 0) => (day - 1) * DAY + h * 60 + m;

/** Engine-private per-truck state (not part of the renderer contract). */
interface TruckInternal {
  path: Point[];
  busy: number;
  onArrive: "stop" | "plant" | "garage" | "lapDone" | null;
  fillL: number;
  waitUntil: number;
  /** Today: route-order cursor. */
  cursor: number;
  /** Imaq: already swept since the queue last went empty. */
  swept: boolean;
  /** Found anything during the current lap. */
  lapFound: boolean;
}

interface WorldInternal {
  ti: TruckInternal[];
  dryMinutes: number;
  /** Dry house-minutes accumulated only on steps where `state.blizzard` is false. */
  dryMinutesOutsideBlizzard: number;
}

export interface Sim {
  readonly state: SimState;
  step(n?: number): void;
}

// ---------- village ----------

function buildVillage(p: SimParams, r: () => number): Village {
  const streets = [220, 540, 860, 1180];
  const avenues = [60, 760, 1320, 1940];
  const perStreet = Math.ceil(p.houseCount / streets.length);
  const houses: Village["houses"] = [];
  for (let s = 0; s < streets.length; s++) {
    for (let i = 0; i < perStreet && houses.length < p.houseCount; i++) {
      const x = Math.round(350 + i * 132 + (r() - 0.5) * 44);
      const tankL = Math.round(triangular(r, p.tankMinL, p.tankModeL, p.tankMaxL) / 10) * 10;
      const lasts = p.lastsMinDays + r() * (p.lastsMaxDays - p.lastsMinDays);
      houses.push({ id: 0, x, y: streets[s], side: r() < 0.5 ? -1 : 1, zone: 0, tankL, dailyUseL: tankL / lasts, usesApp: false });
    }
  }
  // Number houses in reading order (street by street, west to east).
  houses.forEach((h, i) => (h.id = i));
  // Contiguous zones west → east.
  const byX = [...houses].sort((a, b) => a.x - b.x || a.y - b.y);
  const zones: number[][] = [[], [], []];
  byX.forEach((h, i) => {
    const z = Math.min(2, Math.floor((i * 3) / houses.length));
    h.zone = z;
    zones[z].push(h.id);
  });
  // Adoption set: seeded shuffle.
  const order = houses.map((h) => h.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const nApp = Math.round(p.appAdoption * houses.length);
  for (let i = 0; i < nApp; i++) houses[order[i]].usesApp = true;
  return {
    width: 2000,
    height: 1400,
    streets,
    avenues,
    streetSpan: [60, 1940],
    plant: { x: 60, y: 540 },
    garage: { x: 60, y: 860 },
    houses,
    zones,
  };
}

// ---------- routing on the street grid ----------

function route(v: Village, from: Point, to: Point): Point[] {
  if (Math.abs(from.y - to.y) < 0.5) return [{ ...to }];
  let best = v.avenues[0];
  let bestD = Infinity;
  for (const a of v.avenues) {
    const d = Math.abs(from.x - a) + Math.abs(to.x - a);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return [{ x: best, y: from.y }, { x: best, y: to.y }, { ...to }];
}

function routeVia(v: Village, from: Point, stops: Point[]): Point[] {
  const out: Point[] = [];
  let cur = from;
  for (const s of stops) {
    out.push(...route(v, cur, s));
    cur = s;
  }
  return out;
}

// ---------- scenario ----------

interface Scripted {
  minute: number;
  run: () => void;
}

export function createSim(params: Partial<SimParams> = {}, seed = params.seed ?? DEFAULT_PARAMS.seed): Sim {
  const p: SimParams = { ...DEFAULT_PARAMS, ...params, seed };
  const r = mulberry32(seed);
  const v = buildVillage(p, r);
  const initLevels = v.houses.map((h) => h.tankL * (p.startLevelMin + r() * (1 - p.startLevelMin)));
  const speedM = (p.truckSpeedKmh * 1000) / 60;

  const makeWorld = (id: WorldId): WorldState => ({
    id,
    houses: v.houses.map(
      (_, i): HouseState => ({
        levelL: initLevels[i],
        lightOn: false,
        lightOnAt: -1,
        dry: false,
        emergency: false,
        known: false,
        priority: null,
        lastDeliveredAt: -1,
        claimedBy: -1,
      }),
    ),
    trucks: Array.from(
      { length: p.truckCount },
      (_, i): TruckStateObj => ({
        id: i,
        state: "idle",
        prev: { ...v.garage },
        pos: { ...v.garage },
        waterL: 0,
        capacityL: p.truckCapacityL,
        zones: [i % 3],
        target: -1,
        kmDriven: 0,
      }),
    ),
    metrics: { dryNow: 0, householdHoursDry: 0, householdHoursDryOutsideBlizzard: 0, km: 0, deliveries: 0, oldestWaitMin: 0, maxWaitMin: 0 },
    daily: [],
  });

  const state: SimState = {
    params: p,
    village: v,
    minute: 0,
    totalMinutes: p.days * DAY,
    blizzard: false,
    worlds: { today: makeWorld("today"), imaq: makeWorld("imaq") },
    markers: [],
    events: [],
    done: false,
  };
  const internal: Record<WorldId, WorldInternal> = {
    today: { ti: [], dryMinutes: 0, dryMinutesOutsideBlizzard: 0 },
    imaq: { ti: [], dryMinutes: 0, dryMinutesOutsideBlizzard: 0 },
  };
  for (const w of ["today", "imaq"] as const) {
    internal[w].ti = state.worlds[w].trucks.map(() => ({
      path: [],
      busy: 0,
      onArrive: null,
      fillL: 0,
      waitUntil: 0,
      cursor: 0,
      swept: false,
      lapFound: false,
    }));
  }
  const dayMaxDry: Record<WorldId, number> = { today: 0, imaq: 0 };
  const down = new Set<number>();

  const emit = (e: SimEvent) => state.events.push(e);

  // ----- scenario script -----
  const zoneHouse = (z: number, app: boolean, nth: number) => v.zones[z].filter((id) => v.houses[id].usesApp === app)[nth] ?? v.zones[z][0];
  const emergencyA = zoneHouse(2, true, 3);
  const emergencyB = zoneHouse(0, true, 5);
  const script: Scripted[] = [];
  const mark = (m: ScenarioMarker) => state.markers.push(m);
  const add = (minute: number, run: () => void) => script.push({ minute, run });

  add(at(1, 10, 40), () => emit({ minute: state.minute, world: "imaq", kind: "voiceNote", truck: 1, note: 0, important: true }));
  add(at(2, 9, 30), () => emit({ minute: state.minute, world: "imaq", kind: "heaterReport", truck: 1, note: 1, important: true }));
  add(at(2, 11, 30), () => emit({ minute: state.minute, world: "imaq", kind: "heaterReport", truck: 1, note: 2, important: true }));
  add(at(2, 11, 45), () => emit({ minute: state.minute, world: "imaq", kind: "mechanicFlag", truck: 1, important: true }));
  mark({ minute: at(2, 11, 45), kind: "mechanicFlag", truck: 1 });
  const breakdowns: [number, number, number][] = [
    [1, at(2, 14), at(6, 7)],
    [2, at(3, 10), at(7, 7)],
  ];
  for (const [truck, from, to] of breakdowns) {
    if (truck >= p.truckCount) continue;
    mark({ minute: from, kind: "truckDown", truck });
    mark({ minute: to, kind: "truckBack", truck });
    add(from, () => setDown(truck, true));
    add(to, () => setDown(truck, false));
  }
  mark({ minute: at(5, 0), kind: "blizzardStart" });
  mark({ minute: at(6, 0), kind: "blizzardEnd" });
  add(at(5, 0), () => setBlizzard(true));
  add(at(6, 0), () => setBlizzard(false));
  for (const [house, minute] of [
    [emergencyA, at(3, 9, 15)],
    [emergencyB, at(4, 13)],
  ] as const) {
    mark({ minute, kind: "emergency", house });
    add(minute, () => declareEmergency(house));
  }
  script.sort((a, b) => a.minute - b.minute);
  state.markers.sort((a, b) => a.minute - b.minute);
  let scriptIdx = 0;

  function releaseClaims(w: WorldState, truck: number) {
    for (const h of w.houses) if (h.claimedBy === truck) h.claimedBy = -1;
  }

  function reassignZones() {
    for (const wid of ["today", "imaq"] as const) {
      const w = state.worlds[wid];
      const running = w.trucks.filter((t) => !down.has(t.id));
      for (const t of w.trucks) t.zones = down.has(t.id) ? [] : [t.id % 3];
      let k = 0;
      for (let z = 0; z < 3; z++) {
        const owner = w.trucks.find((t) => t.id % 3 === z && !down.has(t.id));
        if (!owner && running.length) {
          running[k % running.length].zones.push(z);
          k++;
        }
      }
      // A truck whose zones changed starts its next decision fresh.
      for (const [i, ti] of internal[wid].ti.entries()) {
        ti.swept = false;
        ti.cursor = 0;
        ti.waitUntil = Math.min(ti.waitUntil, state.minute);
        void i;
      }
    }
  }

  function park(wid: WorldId, t: TruckStateObj, s: TruckStateObj["state"]) {
    const ti = internal[wid].ti[t.id];
    releaseClaims(state.worlds[wid], t.id);
    ti.path = [];
    ti.busy = 0;
    ti.onArrive = null;
    t.target = -1;
    t.state = s;
    t.pos = { ...v.garage };
    t.prev = { ...v.garage };
  }

  function setDown(truck: number, isDown: boolean) {
    if (isDown) down.add(truck);
    else down.delete(truck);
    for (const wid of ["today", "imaq"] as const) {
      const t = state.worlds[wid].trucks[truck];
      if (isDown) park(wid, t, "down");
      else t.state = state.blizzard ? "held" : "idle";
    }
    reassignZones();
    emit({ minute: state.minute, world: "both", kind: isDown ? "truckDown" : "truckBack", truck, important: true });
  }

  function setBlizzard(on: boolean) {
    state.blizzard = on;
    for (const wid of ["today", "imaq"] as const) {
      for (const t of state.worlds[wid].trucks) {
        if (down.has(t.id)) continue;
        if (on) park(wid, t, "held");
        else t.state = "idle";
      }
    }
    emit({ minute: state.minute, world: "both", kind: on ? "blizzardStart" : "blizzardEnd", important: true });
  }

  function declareEmergency(house: number) {
    for (const wid of ["today", "imaq"] as const) {
      const h = state.worlds[wid].houses[house];
      const hs = v.houses[house];
      h.levelL = Math.min(h.levelL, hs.tankL * 0.05);
      h.emergency = true;
      if (!h.lightOn) {
        h.lightOn = true;
        h.lightOnAt = state.minute;
      }
      if (wid === "imaq" && hs.usesApp) {
        h.known = true;
        h.priority = "emergency";
      }
    }
    emit({ minute: state.minute, world: "both", kind: "emergency", house, important: true });
  }

  // ----- world mechanics -----

  const threshold = (id: number) => v.houses[id].tankL * p.lightAtFraction;
  const need = (w: WorldState, id: number) => Math.max(0, v.houses[id].tankL - w.houses[id].levelL);
  const inZones = (t: TruckStateObj, id: number) => t.zones.includes(v.houses[id].zone);
  const prioRank = (h: HouseState) => (h.emergency ? 0 : h.dry || h.priority === "out" ? 1 : 2);
  const routeIdx = (id: number) => {
    const h = v.houses[id];
    const s = v.streets.indexOf(h.y);
    return s * 10_000 + (s % 2 === 0 ? h.x : v.width - h.x);
  };

  function spot(wid: WorldId, t: TruckStateObj, y: number, x0: number, x1: number) {
    const w = state.worlds[wid];
    const lo = Math.min(x0, x1) - p.spotRangeM;
    const hi = Math.max(x0, x1) + p.spotRangeM;
    for (const hs of v.houses) {
      if (hs.y !== y || hs.x < lo || hs.x > hi) continue;
      const h = w.houses[hs.id];
      if (!h.lightOn || h.known) continue;
      h.known = true;
      internal[wid].ti[t.id].lapFound = true;
      if (wid === "imaq") {
        h.priority = h.emergency ? "emergency" : h.dry ? "out" : "soon";
        emit({ minute: state.minute, world: "imaq", kind: "litDoorMarked", house: hs.id, truck: t.id });
      }
    }
  }

  function move(wid: WorldId, t: TruckStateObj) {
    const ti = internal[wid].ti[t.id];
    let left = speedM;
    while (left > 1e-9 && ti.path.length) {
      const tgt = ti.path[0];
      const dx = tgt.x - t.pos.x;
      const dy = tgt.y - t.pos.y;
      const d = Math.abs(dx) + Math.abs(dy); // segments are axis-aligned
      const x0 = t.pos.x;
      if (d <= left) {
        t.pos = { ...tgt };
        ti.path.shift();
        left -= d;
        t.kmDriven += d / 1000;
      } else {
        const f = left / d;
        t.pos = { x: t.pos.x + dx * f, y: t.pos.y + dy * f };
        t.kmDriven += left / 1000;
        left = 0;
      }
      if (Math.abs(dy) < 0.5) spot(wid, t, t.pos.y, x0, t.pos.x);
    }
  }

  function lapStops(t: TruckStateObj): Point[] {
    const ids = t.zones.flatMap((z) => v.zones[z]);
    const pts: Point[] = [];
    let flip = false;
    for (const y of v.streets) {
      const xs = ids.filter((id) => v.houses[id].y === y).map((id) => v.houses[id].x);
      if (!xs.length) continue;
      const a = Math.min(...xs) - p.spotRangeM;
      const b = Math.max(...xs) + p.spotRangeM;
      if (flip) pts.push({ x: b, y }, { x: a, y });
      else pts.push({ x: a, y }, { x: b, y });
      flip = !flip;
    }
    return pts;
  }

  function go(wid: WorldId, t: TruckStateObj, stops: Point[], onArrive: TruckInternal["onArrive"], s: TruckStateObj["state"]) {
    const ti = internal[wid].ti[t.id];
    ti.path = routeVia(v, t.pos, stops);
    ti.onArrive = onArrive;
    t.state = s;
  }

  function candidates(wid: WorldId, t: TruckStateObj): number[] {
    const w = state.worlds[wid];
    const out: number[] = [];
    for (const id of t.zones.flatMap((z) => v.zones[z])) {
      const h = w.houses[id];
      if (h.lightOn && h.known && (h.claimedBy === -1 || h.claimedBy === t.id)) out.push(id);
    }
    return out;
  }

  function pickTarget(wid: WorldId, t: TruckStateObj, c: number[]): number {
    const w = state.worlds[wid];
    const ti = internal[wid].ti[t.id];
    if (wid === "today") {
      const em = c.filter((id) => w.houses[id].emergency);
      const pool = em.length ? em : c;
      const sorted = [...pool].sort((a, b) => routeIdx(a) - routeIdx(b));
      return sorted.find((id) => routeIdx(id) >= ti.cursor) ?? sorted[0];
    }
    const band = Math.min(...c.map((id) => prioRank(w.houses[id])));
    let best = -1;
    let bestD = Infinity;
    for (const id of c) {
      if (prioRank(w.houses[id]) !== band) continue;
      const hs = v.houses[id];
      const d = routeLen(t.pos, hs);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  function routeLen(a: Point, b: Point) {
    let len = 0;
    let cur = a;
    for (const q of route(v, a, b)) {
      len += Math.abs(q.x - cur.x) + Math.abs(q.y - cur.y);
      cur = q;
    }
    return len;
  }

  function fillAmount(wid: WorldId, t: TruckStateObj, c: number[]): number {
    const w = state.worlds[wid];
    if (wid === "imaq") {
      // orderQueue: Emergency → Out → Soon, oldest first; take up to capacity.
      const q = [...c].sort((a, b) => prioRank(w.houses[a]) - prioRank(w.houses[b]) || w.houses[a].lightOnAt - w.houses[b].lightOnAt || a - b);
      let sum = 0;
      for (const id of q) {
        const n = need(w, id) * 1.1;
        if (sum + n > t.capacityL) break;
        sum += n;
      }
      return Math.max(sum, Math.min(t.capacityL, need(w, q[0]) * 1.1));
    }
    return Math.min(t.capacityL, c.reduce((s, id) => s + need(w, id) * 1.1, 0));
  }

  function decide(wid: WorldId, t: TruckStateObj) {
    const ti = internal[wid].ti[t.id];
    if (state.minute < ti.waitUntil) return;
    const w = state.worlds[wid];
    const c = candidates(wid, t);
    if (c.length) {
      ti.swept = false;
      const total = c.reduce((s, id) => s + need(w, id), 0);
      const mustFill = t.waterL < 50 || (t.state === "scouting" && t.waterL < total && t.waterL < t.capacityL * 0.9);
      if (mustFill) {
        ti.fillL = Math.max(0, fillAmount(wid, t, c) - t.waterL);
        if (ti.fillL < 50) ti.fillL = Math.min(t.capacityL - t.waterL, 1000);
        // Today: back to base, then the plant. Imaq: straight to the plant.
        const stops = wid === "today" && t.state === "scouting" ? [v.garage, v.plant] : [v.plant];
        go(wid, t, stops, "plant", "toPlant");
        return;
      }
      const id = pickTarget(wid, t, c);
      w.houses[id].claimedBy = t.id;
      t.target = id;
      go(wid, t, [{ x: v.houses[id].x, y: v.houses[id].y }], "stop", "delivering");
      return;
    }
    // Nothing known in my zones.
    if (wid === "today" || !ti.swept) {
      ti.lapFound = false;
      go(wid, t, lapStops(t), "lapDone", wid === "today" ? "scouting" : "sweeping");
      return;
    }
    // Imaq with an empty queue after a sweep: wait at the garage for requests.
    if (Math.abs(t.pos.x - v.garage.x) + Math.abs(t.pos.y - v.garage.y) > 1) {
      go(wid, t, [v.garage], "garage", "returning");
      return;
    }
    t.state = "idle";
    if (state.minute >= ti.waitUntil + p.idleWaitMin) ti.swept = false;
  }

  function arrive(wid: WorldId, t: TruckStateObj) {
    const ti = internal[wid].ti[t.id];
    const w = state.worlds[wid];
    const a = ti.onArrive;
    ti.onArrive = null;
    if (a === "plant") {
      t.state = "filling";
      ti.busy = Math.max(5, Math.round((p.fullFillMin * ti.fillL) / t.capacityL));
    } else if (a === "stop") {
      const id = t.target;
      const litres = Math.min(need(w, id), t.waterL);
      ti.busy = p.stopHookupMin + Math.ceil(litres / p.pumpLPerMin);
    } else if (a === "lapDone") {
      const found = candidates(wid, t).length > 0;
      if (wid === "imaq") ti.swept = true;
      if (!found) {
        ti.waitUntil = state.minute + (wid === "today" ? p.idleWaitMin : 0);
        go(wid, t, [v.garage], "garage", "returning");
      } else {
        ti.cursor = 0;
        // keep state "scouting" so decide() applies the Today rule: go fill before delivering
      }
    } else if (a === "garage") {
      t.state = "idle";
    }
  }

  function finishBusy(wid: WorldId, t: TruckStateObj) {
    const w = state.worlds[wid];
    const ti = internal[wid].ti[t.id];
    if (t.state === "filling") {
      t.waterL = Math.min(t.capacityL, t.waterL + ti.fillL);
      ti.cursor = 0;
      t.state = "delivering";
    } else if (t.state === "delivering" && t.target >= 0) {
      const id = t.target;
      const h = w.houses[id];
      const litres = Math.min(need(w, id), t.waterL);
      h.levelL += litres;
      t.waterL -= litres;
      h.lastDeliveredAt = state.minute;
      h.claimedBy = -1;
      h.dry = h.levelL <= 0;
      if (h.levelL > threshold(id)) {
        h.lightOn = false;
        h.lightOnAt = -1;
        h.known = false;
        h.priority = null;
        h.emergency = false;
      }
      w.metrics.deliveries++;
      ti.cursor = routeIdx(id) + 1;
      t.target = -1;
      emit({ minute: state.minute, world: wid, kind: "delivered", house: id, truck: t.id });
    }
  }

  function stepTruck(wid: WorldId, t: TruckStateObj, tod: number) {
    const ti = internal[wid].ti[t.id];
    t.prev = { ...t.pos };
    if (t.state === "down" || t.state === "held") return;
    const open = tod >= p.serviceStartMin && tod < p.serviceEndMin;
    if (!open) {
      if (t.state === "idle") return;
      if (t.state !== "returning") {
        releaseClaims(state.worlds[wid], t.id);
        t.target = -1;
        ti.busy = 0;
        go(wid, t, [v.garage], "garage", "returning");
      }
      move(wid, t);
      if (!ti.path.length) arrive(wid, t);
      return;
    }
    if (ti.busy > 0) {
      ti.busy--;
      if (ti.busy === 0) finishBusy(wid, t);
      return;
    }
    if (ti.path.length) {
      move(wid, t);
      if (!ti.path.length) arrive(wid, t);
      return;
    }
    decide(wid, t);
    if (ti.path.length) {
      move(wid, t);
      if (!ti.path.length) arrive(wid, t);
    }
  }

  function stepWorld(wid: WorldId, m: number, tod: number) {
    const w = state.worlds[wid];
    const using = tod >= p.useStartMin && tod < p.useEndMin;
    const useMins = p.useEndMin - p.useStartMin;
    for (const hs of v.houses) {
      const h = w.houses[hs.id];
      if (using) h.levelL = Math.max(0, h.levelL - hs.dailyUseL / useMins);
      const wasDry = h.dry;
      h.dry = h.levelL <= 0;
      if (!h.lightOn && h.levelL <= threshold(hs.id)) {
        h.lightOn = true;
        h.lightOnAt = m;
        if (wid === "imaq" && hs.usesApp) {
          h.known = true;
          h.priority = "soon";
          emit({ minute: m, world: "imaq", kind: "appRequest", house: hs.id });
        }
      }
      if (h.dry && !wasDry && wid === "imaq" && hs.usesApp && h.priority === "soon") {
        h.priority = "out" satisfies Priority;
        emit({ minute: m, world: "imaq", kind: "appOut", house: hs.id });
      }
    }
    for (const t of w.trucks) stepTruck(wid, t, tod);
    let dry = 0;
    let oldest = 0;
    for (const h of w.houses) {
      if (h.dry) dry++;
      if (h.lightOn) oldest = Math.max(oldest, m - h.lightOnAt);
    }
    internal[wid].dryMinutes += dry;
    if (!state.blizzard) internal[wid].dryMinutesOutsideBlizzard += dry;
    w.metrics.dryNow = dry;
    w.metrics.householdHoursDry = internal[wid].dryMinutes / 60;
    w.metrics.householdHoursDryOutsideBlizzard = internal[wid].dryMinutesOutsideBlizzard / 60;
    w.metrics.km = w.trucks.reduce((s, t) => s + t.kmDriven, 0);
    w.metrics.oldestWaitMin = oldest;
    w.metrics.maxWaitMin = Math.max(w.metrics.maxWaitMin, oldest);
    dayMaxDry[wid] = Math.max(dayMaxDry[wid], dry);
    if (tod === DAY - 1) {
      w.daily.push({ maxDry: dayMaxDry[wid], householdHoursDry: w.metrics.householdHoursDry, deliveries: w.metrics.deliveries, km: w.metrics.km });
      dayMaxDry[wid] = 0;
    }
  }

  function stepOne() {
    if (state.done) return;
    const m = state.minute;
    const tod = m % DAY;
    if (tod === 0) emit({ minute: m, world: "both", kind: "dayStart" });
    while (scriptIdx < script.length && script[scriptIdx].minute <= m) script[scriptIdx++].run();
    stepWorld("today", m, tod);
    stepWorld("imaq", m, tod);
    state.minute = m + 1;
    if (state.minute >= state.totalMinutes) state.done = true;
  }

  return {
    state,
    step(n = 1) {
      for (let i = 0; i < n && !state.done; i++) stepOne();
    },
  };
}

/** FNV-1a hash of the dynamic state, for determinism tests. */
export function hashState(s: SimState): string {
  const json = JSON.stringify({ m: s.minute, w: s.worlds, e: s.events.length });
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export const MIN_PER_DAY = DAY;
