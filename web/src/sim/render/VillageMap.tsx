import { memo } from "react";
import { ArrowRight, CloudSnow, Droplet, Droplets, Eye, House, SquareParking, Search, Snowflake, Wrench } from "lucide-react";
import type { HouseState, TruckState, TruckStateObj, Village, WorldId } from "../engine";
import { t } from "../../i18n";
import s from "./sim.module.css";

/**
 * House glyphs are drawn in the design reference's own units (a 30-unit-wide outlined house)
 * and scaled up into map metres, so stroke weights match the reference.
 */
const K = 3; // reference units -> map metres
const ROAD_HALF = 28; // half the drawn road width, map metres
const SETBACK = 12; // clear gap between road edge and the nearest part of a house
const JUST_DELIVERED_MIN = 60;

export const TRUCK_ICON: Record<TruckState, typeof Eye> = {
  idle: SquareParking,
  scouting: Eye,
  sweeping: Search,
  toPlant: Droplet,
  filling: Droplets,
  delivering: ArrowRight,
  returning: House,
  down: Wrench,
  held: Snowflake,
};

/**
 * One house, in reference units around (0,0): roof peak at y=-20, body bottom at y=10.
 * Each state has its own shape so it survives greyscale: dry = × and red outline,
 * lit door = ring beside the roof, delivered = thick outline plus a check, emergency = triangle with "!",
 * app = short line under the house.
 */
export function HouseGlyph({ x, y, level, lit, dry, delivered, emergency, app, scale = K }: {
  x: number;
  y: number;
  level: number; // 0..1
  lit: boolean;
  dry: boolean;
  delivered: boolean;
  emergency: boolean;
  app: boolean;
  scale?: number;
}) {
  const ratio = Math.max(0, Math.min(1, level));
  const cls = dry ? s.houseDry : delivered ? s.houseDelivered : s.house;
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <path d="M-15,-8 L0,-20 L15,-8 V10 H-15 Z" className={cls} />
      {!dry && ratio > 0 && <rect x={-11} y={8 - 14 * ratio} width={22} height={14 * ratio} className={s.tankFill} />}
      {dry && <path d="M-5,-6 L5,4 M5,-6 L-5,4" className={s.dryMark} />}
      {lit && <circle cx={21} cy={-12} r={5} className={s.doorMark} />}
      {delivered && !dry && <path d="M16,2 l3,3 l6,-7" className={s.checkMark} />}
      {emergency && (
        <g>
          <path d="M-22,-24 L-30,-9 H-14 Z" className={s.emergencyMark} />
          <path d="M-22,-19 v5 M-22,-11.6 v0.1" className={s.emergencyBang} />
        </g>
      )}
      {app && <path d="M-6,15 h12" className={s.appMark} />}
    </g>
  );
}

/**
 * Houses are set back beside their street, never on it: the engine's house point sits on the
 * street line, and `side` says which side of the street the lot is on. Above the street (-1) the
 * glyph's lowest part (the app line, y=+15) clears the road edge; below it (+1) the roof peak does.
 */
function houseAnchorY(streetY: number, side: -1 | 1): number {
  const clear = ROAD_HALF + SETBACK;
  return side > 0 ? streetY + clear + 20 * K : streetY - clear - 17 * K;
}

const Houses = memo(function Houses({ village, houses, minute, world }: { village: Village; houses: HouseState[]; minute: number; world: WorldId; version: number }) {
  return (
    <g>
      {village.houses.map((hs) => {
        const h = houses[hs.id];
        const ay = houseAnchorY(hs.y, hs.side);
        // Short driveway from the road edge to the house.
        const dy1 = hs.y + hs.side * ROAD_HALF;
        const dy2 = hs.side > 0 ? ay - 8 * K : ay + 10 * K;
        return (
          <g key={hs.id}>
            <line x1={hs.x} x2={hs.x} y1={dy1} y2={dy2} className={s.driveway} />
            <HouseGlyph
              x={hs.x}
              y={ay}
              level={h.levelL / hs.tankL}
              lit={h.lightOn}
              dry={h.dry}
              emergency={h.emergency}
              delivered={h.lastDeliveredAt >= 0 && minute - h.lastDeliveredAt < JUST_DELIVERED_MIN}
              app={world === "imaq" && hs.usesApp}
            />
          </g>
        );
      })}
    </g>
  );
},
// Houses redraw only when `version` ticks (~5×/s); the engine mutates `houses` in place.
(a, b) => a.version === b.version && a.houses === b.houses && a.world === b.world);

const Roads = memo(function Roads({ village }: { village: Village }) {
  const [x1, x2] = village.streetSpan;
  const y1 = village.streets[0];
  const y2 = village.streets[village.streets.length - 1];
  const segs = [
    ...village.streets.map((y) => `M${x1},${y} H${x2}`),
    ...village.avenues.map((x) => `M${x},${y1} V${y2}`),
  ].join(" ");
  return (
    <g>
      <path d={segs} className={s.roadEdge} />
      <path d={segs} className={s.roadLine} />
    </g>
  );
});

export function TruckGlyph({ x, y, n, state }: { x: number; y: number; n: number; state: TruckState }) {
  const Icon = TRUCK_ICON[state];
  const broken = state === "down";
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-66} y={-40} width={132} height={80} rx={10} className={broken ? s.truckDown : s.truck} />
      <text x={-30} y={20} textAnchor="middle" className={s.truckNum}>{n}</text>
      <Icon x={0} y={-26} width={52} height={52} className={s.truckIcon} strokeWidth={2.75} aria-hidden="true" />
    </g>
  );
}

function Building({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-140} y={-50} width={280} height={100} rx={12} className={s.building} />
      <text x={0} y={14} textAnchor="middle" className={s.buildingLabel}>{label}</text>
    </g>
  );
}

export function VillageMap({ village, houses, trucks, minute, frac, world, blizzard, version, ariaLabel }: {
  village: Village;
  houses: HouseState[];
  trucks: TruckStateObj[];
  minute: number;
  frac: number;
  world: WorldId;
  blizzard: boolean;
  version: number;
  ariaLabel: string;
}) {
  const { plant, garage } = village;
  return (
    <svg className={s.map} viewBox={`-100 60 ${village.width + 150} ${village.height - 80}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
      <rect x={-200} y={-20} width={village.width + 400} height={village.height + 40} className={s.ground} />
      <Roads village={village} />
      {/* water plant and garage sit on their streets at the west edge, set back like the houses */}
      <Building x={plant.x + 90} y={plant.y - ROAD_HALF - 70} label={t("sim.plant")} />
      <Building x={garage.x + 90} y={garage.y - ROAD_HALF - 70} label={t("sim.garage")} />
      <Houses village={village} houses={houses} minute={minute} world={world} version={version} />
      {trucks.map((tr) => {
        const x = tr.prev.x + (tr.pos.x - tr.prev.x) * frac;
        const y = tr.prev.y + (tr.pos.y - tr.prev.y) * frac;
        const atGarage = Math.abs(tr.pos.x - garage.x) < 1 && Math.abs(tr.pos.y - garage.y) < 1;
        // Parked trucks line up in the garage yard, below its street, instead of stacking.
        const px = atGarage ? garage.x + 30 : x;
        const py = atGarage ? garage.y + ROAD_HALF + 60 + tr.id * 92 : y;
        return <TruckGlyph key={tr.id} x={px} y={py} n={tr.id + 1} state={tr.state} />;
      })}
      {blizzard && (
        <g className={s.blizzard}>
          <rect x={-200} y={-20} width={village.width + 400} height={village.height + 40} className={s.blizzardVeil} />
          <CloudSnow x={village.width / 2 - 110} y={420} width={220} height={220} className={s.blizzardIcon} aria-hidden="true" />
          <text x={village.width / 2} y={780} textAnchor="middle" className={s.blizzardText}>{t("sim.blizzard")}</text>
        </g>
      )}
    </svg>
  );
}
