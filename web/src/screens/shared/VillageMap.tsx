/**
 * The village map: an SVG of houses at their x/y (metres) with a symbol per open request type,
 * the house label, and a mark for requests waiting more than 24 h. Never colour alone — every
 * symbol has a distinct shape and a letter, and there is a text list alternative for screen
 * readers and anyone who prefers it.
 */
import { useId, useState } from "react";
import { t } from "../../i18n";
import type { House, OpenRequest, RequestKind, VillageGeometry } from "../../../../shared/types";
import s from "./VillageMap.module.css";

const KIND_LETTER: Record<RequestKind, string> = { soon: "S", out: "O", emergency: "E", sewage: "W" };
const KIND_SHAPE: Record<RequestKind, "circle" | "square" | "triangle" | "diamond"> = {
  soon: "circle",
  out: "square",
  sewage: "diamond",
  emergency: "triangle",
};

function Shape({ kind, size }: { kind: RequestKind; size: number }) {
  const shape = KIND_SHAPE[kind];
  const cls = `${s.mark} ${s[kind]}`;
  if (shape === "circle") return <circle className={cls} r={size} />;
  if (shape === "square") return <rect className={cls} x={-size} y={-size} width={size * 2} height={size * 2} />;
  if (shape === "diamond")
    return <rect className={cls} x={-size} y={-size} width={size * 1.6} height={size * 1.6} transform="rotate(45)" />;
  const h = size * 1.7;
  return <polygon className={cls} points={`0,${-h} ${h},${h * 0.8} ${-h},${h * 0.8}`} />;
}

export interface VillageMapProps {
  houses: House[];
  openRequests: OpenRequest[];
  waitingTooLong: string[];
  /** Optional roads / plant / garage, in the same metre space as House.x/y, if the server provides it. */
  geometry?: VillageGeometry;
}

export function VillageMap({ houses, openRequests, waitingTooLong, geometry }: VillageMapProps) {
  const titleId = useId();
  const [showList, setShowList] = useState(false);
  const byHouse = new Map<string, OpenRequest[]>();
  for (const r of openRequests) {
    const list = byHouse.get(r.houseId) ?? [];
    list.push(r);
    byHouse.set(r.houseId, list);
  }
  const tooLongSet = new Set(waitingTooLong);

  // Fit the view to where things are, not to the whole geometry box.
  const points = houses.map((h) => [h.x, h.y]);
  if (geometry) points.push([geometry.plant.x, geometry.plant.y], [geometry.garage.x, geometry.garage.y]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const spanX = Math.max(10, Math.max(...xs) - Math.min(...xs));
  const spanY = Math.max(10, Math.max(...ys) - Math.min(...ys));
  // Symbols are drawn in a small unit space and scaled up, so they stay readable whatever the map's size in metres.
  const k = Math.max(spanX, spanY) / 330;
  const pad = 22 * k;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = spanX + pad * 2;
  const h = spanY + pad * 2;

  return (
    <div>
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`${minX} ${minY} ${w} ${h}`}
        className={s.svg}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>Village map: houses with open water and sewage requests</title>
        {geometry?.roads.map((road) => (
          <polyline key={road.id} className={s.road} points={road.points.map((p) => p.join(",")).join(" ")} />
        ))}
        {geometry && (
          <>
            <g transform={`translate(${geometry.plant.x} ${geometry.plant.y}) scale(${k})`}>
              <rect className={s.plant} x={-6} y={-6} width={12} height={12} />
              <text className={s.label} y={14}>
                Plant
              </text>
            </g>
            <g transform={`translate(${geometry.garage.x} ${geometry.garage.y}) scale(${k})`}>
              <rect className={s.garage} x={-6} y={-6} width={12} height={12} />
              <text className={s.label} y={14}>
                Garage
              </text>
            </g>
          </>
        )}
        {houses.map((house) => {
          const reqs = byHouse.get(house.id) ?? [];
          const anyTooLong = reqs.some((r) => tooLongSet.has(r.id));
          return (
            <g key={house.id} transform={`translate(${house.x} ${house.y}) scale(${k})`}>
              <circle className={s.house} r={3.5} />
              {anyTooLong && <circle className={s.tooLong} r={8} />}
              {reqs.map((r, i) => (
                <g key={r.id} transform={`translate(${(i - (reqs.length - 1) / 2) * 12} -14)`}>
                  <Shape kind={r.kind} size={5} />
                  <text className={s.markLetter} y={2}>
                    {KIND_LETTER[r.kind]}
                  </text>
                </g>
              ))}
              <text className={s.label} y={16}>
                {house.label.replace(/^House\s+/, "")}
              </text>
            </g>
          );
        })}
      </svg>
      <button type="button" className={s.listToggle} onClick={() => setShowList((v) => !v)} aria-expanded={showList}>
        {showList ? "Hide list view" : "Show list view"}
      </button>
      {showList && (
        <ul className={s.list}>
          {houses.map((house) => {
            const reqs = byHouse.get(house.id) ?? [];
            if (reqs.length === 0) return null;
            return (
              <li key={house.id}>
                <strong>{house.label}</strong>:{" "}
                {reqs
                  .map((r) => `${t(`common.request.${r.kind}`)}${tooLongSet.has(r.id) ? " (waiting > 24 h)" : ""}`)
                  .join(", ")}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Key for the map symbols: the same shape and letter as on the map, with the request type in words. */
export function VillageMapLegend() {
  const kinds: RequestKind[] = ["emergency", "out", "soon", "sewage"];
  return (
    <ul className={s.legend}>
      {kinds.map((kind) => (
        <li key={kind}>
          <svg viewBox="-10 -10 20 20" aria-hidden="true">
            <Shape kind={kind} size={kind === "emergency" ? 5 : 7} />
            <text className={s.markLetter} y={kind === "emergency" ? 4 : 3} style={{ fontSize: 8 }}>
              {KIND_LETTER[kind]}
            </text>
          </svg>
          {t(`common.request.${kind}`)}
        </li>
      ))}
    </ul>
  );
}
