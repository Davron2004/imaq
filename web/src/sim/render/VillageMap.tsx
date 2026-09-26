import { memo } from "react";
import { ArrowRight, CloudSnow, Droplet, Droplets, Eye, House, SquareParking, Search, Snowflake, Wrench } from "lucide-react";
import type { HouseState, TruckState, TruckStateObj, Village, WorldId } from "../engine";
import { t } from "../../i18n";
import s from "./sim.module.css";

const HW = 112; // house width in map metres
const HH = 100;
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

/** One house glyph. Every state has its own shape, not only a colour. */
export function HouseGlyph({ x, y, level, lit, dry, delivered, emergency, app }: {
  x: number;
  y: number;
  level: number; // 0..1
  lit: boolean;
  dry: boolean;
  delivered: boolean;
  emergency: boolean;
  app: boolean;
}) {
  const bx = x - HW / 2;
  const by = y - HH / 2;
  const barH = (HH - 20) * Math.max(0, Math.min(1, level));
  return (
    <g>
      {/* roof */}
      <polygon points={`${bx - 8},${by} ${x},${by - 34} ${bx + HW + 8},${by}`} className={dry ? s.roofDry : s.roof} />
      <rect x={bx} y={by} width={HW} height={HH} className={dry ? s.bodyDry : s.body} />
      {/* tank bar */}
      {!dry && <rect x={bx + 14} y={by + 10 + (HH - 20 - barH)} width={HW - 28} height={barH} className={s.tank} />}
      {!dry && <rect x={bx + 14} y={by + 10} width={HW - 28} height={HH - 20} className={s.tankOutline} />}
      {dry && (
        <path d={`M${bx + 16},${by + 14} L${bx + HW - 16},${by + HH - 14} M${bx + HW - 16},${by + 14} L${bx + 16},${by + HH - 14}`} className={s.dryX} />
      )}
      {lit && !emergency && (
        <g className={s.light}>
          <path
            d={`M${x},${by - 118} v14 M${x},${by - 30} v-2 M${x - 52},${by - 72} h14 M${x + 52},${by - 72} h-14 M${x - 38},${by - 108} l10,10 M${x + 38},${by - 108} l-10,10`}
            className={s.rays}
          />
          <circle cx={x} cy={by - 72} r={30} />
        </g>
      )}
      {emergency && (
        <g>
          <polygon points={`${x},${by - 124} ${x + 44},${by - 44} ${x - 44},${by - 44}`} className={s.emerg} />
          <text x={x} y={by - 54} textAnchor="middle" className={s.emergText}>!</text>
        </g>
      )}
      {delivered && !lit && !emergency && (
        <g>
          <circle cx={x} cy={by - 72} r={32} className={s.deliveredDot} />
          <path d={`M${x - 16},${by - 72} l10,13 l21,-26`} className={s.check} />
        </g>
      )}
      {app && <circle cx={x} cy={by + HH + 18} r={11} className={s.appDot} />}
    </g>
  );
}

const Houses = memo(function Houses({ village, houses, minute, world }: { village: Village; houses: HouseState[]; minute: number; world: WorldId; version: number }) {
  return (
    <g>
      {village.houses.map((hs) => {
        const h = houses[hs.id];
        return (
          <HouseGlyph
            key={hs.id}
            x={hs.x}
            y={hs.y + hs.side * 88}
            level={h.levelL / hs.tankL}
            lit={h.lightOn}
            dry={h.dry}
            emergency={h.emergency}
            delivered={h.lastDeliveredAt >= 0 && minute - h.lastDeliveredAt < JUST_DELIVERED_MIN}
            app={world === "imaq" && hs.usesApp}
          />
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
  return (
    <g className={s.road}>
      {village.streets.map((y) => (
        <line key={`s${y}`} x1={x1} x2={x2} y1={y} y2={y} />
      ))}
      {village.avenues.map((x) => (
        <line key={`a${x}`} x1={x} x2={x} y1={y1} y2={y2} />
      ))}
    </g>
  );
});

export function TruckGlyph({ x, y, n, state }: { x: number; y: number; n: number; state: TruckState }) {
  const Icon = TRUCK_ICON[state];
  const broken = state === "down";
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-78} y={-50} width={156} height={100} rx={18} className={broken ? s.truckDown : s.truck} />
      <text x={-38} y={28} textAnchor="middle" className={s.truckNum}>{n}</text>
      <Icon x={2} y={-34} width={68} height={68} className={s.truckIcon} strokeWidth={2.6} aria-hidden="true" />
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
    <svg className={s.map} viewBox={`-10 40 ${village.width + 20} ${village.height - 20}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
      <rect x={-20} y={-20} width={village.width + 40} height={village.height + 40} className={s.ground} />
      <Roads village={village} />
      {/* water plant and garage sit west of the houses, each an icon plus a word */}
      <g transform={`translate(${plant.x + 100},${plant.y - 150})`}>
        <rect x={-120} y={-90} width={240} height={180} rx={10} className={s.plant} />
        <Droplets x={-40} y={-82} width={80} height={80} className={s.plantIcon} aria-hidden="true" />
        <text x={0} y={60} textAnchor="middle" className={s.placeText}>{t("sim.plantShort")}</text>
      </g>
      <g transform={`translate(${garage.x + 100},${garage.y - 150})`}>
        <rect x={-120} y={-90} width={240} height={180} rx={10} className={s.garage} />
        <Wrench x={-36} y={-80} width={72} height={72} className={s.plantIcon} aria-hidden="true" />
        <text x={0} y={60} textAnchor="middle" className={s.placeText}>{t("sim.garageShort")}</text>
      </g>
      <Houses village={village} houses={houses} minute={minute} world={world} version={version} />
      {trucks.map((tr) => {
        const x = tr.prev.x + (tr.pos.x - tr.prev.x) * frac;
        const y = tr.prev.y + (tr.pos.y - tr.prev.y) * frac;
        const atGarage = Math.abs(tr.pos.x - garage.x) < 1 && Math.abs(tr.pos.y - garage.y) < 1;
        // Parked trucks line up beside the garage instead of stacking.
        const px = atGarage ? garage.x + 100 : x;
        const py = atGarage ? garage.y + 20 + tr.id * 115 : y;
        return <TruckGlyph key={tr.id} x={px} y={py} n={tr.id + 1} state={tr.state} />;
      })}
      {blizzard && (
        <g className={s.blizzard}>
          <rect x={-20} y={-20} width={village.width + 40} height={village.height + 40} className={s.blizzardVeil} />
          <CloudSnow x={village.width / 2 - 110} y={380} width={220} height={220} className={s.blizzardIcon} aria-hidden="true" />
          <text x={village.width / 2} y={760} textAnchor="middle" className={s.blizzardText}>{t("sim.blizzard")}</text>
        </g>
      )}
    </svg>
  );
}
