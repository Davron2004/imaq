import { useEffect, useRef, type ReactNode } from "react";
import { CheckCircle2, Info, Mic, Pause, Play, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Button } from "../../ui";
import { formatAge, t } from "../../i18n";
import { DEFAULT_PARAMS, PARAM_SOURCES, MIN_PER_DAY, type Metrics, type ParamSource, type SimEvent, type SimState, type TruckStateObj, type WorldState } from "../engine";
import { SPEED_ORDER, type SpeedId } from "./useSimRunner";
import { HouseGlyph, TRUCK_ICON, TruckGlyph } from "./VillageMap";
import s from "./sim.module.css";

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-CA");

// ---------- counters ----------

export const COUNTERS: { key: keyof Metrics; label: string; fmt: (m: Metrics) => string }[] = [
  { key: "dryNow", label: "sim.counter.dryNow", fmt: (m) => String(m.dryNow) },
  { key: "householdHoursDry", label: "sim.counter.hhDry", fmt: (m) => fmtInt(m.householdHoursDry) },
  { key: "km", label: "sim.counter.km", fmt: (m) => fmtInt(m.km) },
  { key: "deliveries", label: "sim.counter.deliveries", fmt: (m) => String(m.deliveries) },
  { key: "oldestWaitMin", label: "sim.counter.oldest", fmt: (m) => (m.oldestWaitMin > 0 ? formatAge(m.oldestWaitMin * 60_000) : t("sim.counter.none")) },
];

export function Counters({ metrics }: { metrics: Metrics }) {
  return (
    <dl className={s.counters}>
      {COUNTERS.map((c) => (
        <div key={c.key} className={s.counter}>
          <dt className={s.counterLabel}>{t(c.label)}</dt>
          <dd className={s.counterValue}>{c.fmt(metrics)}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- trucks in words ----------

export function TruckList({ trucks }: { trucks: TruckStateObj[] }) {
  return (
    <ul className={s.truckList}>
      {trucks.map((tr) => {
        const Icon = TRUCK_ICON[tr.state];
        return (
          <li key={tr.id} className={tr.state === "down" ? s.truckLineDown : s.truckLine}>
            <Icon size={20} aria-hidden="true" />
            <span>{t("sim.truckLine", { n: tr.id + 1, state: t(`sim.truckState.${tr.state}`) })}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- ticker ----------

const HOLD_MS = 6000; // key moments stay on screen this long in real time, whatever the speed
const TICKER_KINDS = new Set<SimEvent["kind"]>(["appRequest", "appOut", "litDoorMarked", "emergency", "voiceNote", "heaterReport", "mechanicFlag", "truckDown", "truckBack", "blizzardStart", "blizzardEnd"]);

function eventText(e: SimEvent): { lines: string[]; icon: ReactNode; tone: "normal" | "key" | "alert" } {
  const v = { house: (e.house ?? 0) + 1, truck: (e.truck ?? 0) + 1 };
  switch (e.kind) {
    case "voiceNote":
      return { lines: [t("sim.ticker.voiceNote", { quote: t(`sim.quote.${e.note ?? 0}`) }), t("sim.ticker.voiceEntry", v)], icon: <Mic size={22} />, tone: "key" };
    case "heaterReport":
      return { lines: [t("sim.ticker.voiceNote", { quote: t(`sim.quote.${e.note ?? 0}`) }), t("sim.ticker.heaterReport", { ...v, n: (e.note ?? 0) + 1 })], icon: <Mic size={22} />, tone: "key" };
    case "mechanicFlag":
      return { lines: [t("sim.ticker.mechanicFlag", v)], icon: <TriangleAlert size={22} />, tone: "alert" };
    case "truckDown":
    case "emergency":
    case "blizzardStart":
      return { lines: [t(`sim.ticker.${e.kind}`, v)], icon: <TriangleAlert size={22} />, tone: "alert" };
    case "truckBack":
    case "blizzardEnd":
      return { lines: [t(`sim.ticker.${e.kind}`, v)], icon: <CheckCircle2 size={22} />, tone: "key" };
    default:
      return { lines: [t(`sim.ticker.${e.kind}`, v)], icon: null, tone: "normal" };
  }
}

/** Imaq-side app activity. Routine lines scroll; key moments are pinned for HOLD_MS real time. */
export function Ticker({ state }: { state: SimState }) {
  // Real time each key event first appeared. Idempotent in render (safe under StrictMode).
  const firstSeen = useRef<{ owner: SimState | null; at: Map<number, number> }>({ owner: null, at: new Map() });
  if (firstSeen.current.owner !== state) firstSeen.current = { owner: state, at: new Map() };
  const now = performance.now();
  const events = state.events;
  const shownPinned: { e: SimEvent }[] = [];
  for (let i = events.length - 1; i >= 0 && shownPinned.length < 3; i--) {
    const e = events[i];
    if (!e.important || e.world === "today" || !TICKER_KINDS.has(e.kind)) continue;
    let seenAt = firstSeen.current.at.get(i);
    if (seenAt === undefined) {
      seenAt = now;
      firstSeen.current.at.set(i, now);
    }
    if (now - seenAt < HOLD_MS) shownPinned.unshift({ e });
    else if (state.minute - e.minute > 24 * 60) break;
  }
  const routine: SimEvent[] = [];
  for (let i = events.length - 1; i >= 0 && routine.length < 3; i--) {
    const e = events[i];
    if (!e.important && e.world === "imaq" && TICKER_KINDS.has(e.kind)) routine.push(e);
  }
  return (
    <section className={s.ticker} aria-label={t("sim.ticker.title")}>
      <h3 className={s.tickerTitle}>{t("sim.ticker.title")}</h3>
      {shownPinned.map(({ e }, i) => {
        const x = eventText(e);
        return (
          <div key={`${e.minute}-${e.kind}-${i}`} className={x.tone === "alert" ? s.pinAlert : s.pin}>
            <span className={s.pinIcon} aria-hidden="true">{x.icon}</span>
            <div>
              {x.lines.map((l, j) => (
                <p key={j} className={j === 0 && x.lines.length > 1 ? s.quote : s.pinLine}>{l}</p>
              ))}
            </div>
          </div>
        );
      })}
      <ul className={s.routine}>
        {routine.length === 0 && <li>{t("sim.ticker.empty")}</li>}
        {routine.map((e, i) => (
          <li key={`${e.minute}-${i}`}>
            <span className={s.routineTime}>{hhmm(e.minute % MIN_PER_DAY)}</span> {eventText(e).lines[0]}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- clock + timeline ----------

export function Timeline({ state, onSeek }: { state: SimState; onSeek: (minute: number) => void }) {
  const total = state.totalMinutes;
  const pct = (m: number) => `${(m / total) * 100}%`;
  const day = Math.min(state.params.days, Math.floor(state.minute / MIN_PER_DAY) + 1);
  const markers = state.markers.filter((m) => m.kind !== "blizzardEnd");
  return (
    <div className={s.timelineRow}>
      <div className={s.clock} aria-hidden="true">
        <span className={s.clockDay}>{t("sim.dayOf", { day, days: state.params.days })}</span>
        <span className={s.clockTime}>{hhmm(Math.min(state.minute, total - 1) % MIN_PER_DAY)}</span>
      </div>
      <div className={s.timeline} role="group" aria-label={t("sim.timeline")}>
        <div className={s.track}>
          {Array.from({ length: state.params.days }, (_, d) => (
            <span key={d} className={s.dayTick} style={{ left: pct(d * MIN_PER_DAY) }}>
              {d + 1}
            </span>
          ))}
          <span className={s.blizzardBand} style={{ left: pct(4 * MIN_PER_DAY), width: pct(MIN_PER_DAY) }} />
          <span className={s.progress} style={{ width: pct(state.minute) }} />
        </div>
        <div className={s.markers}>
          {markers.map((m, i) => {
            const label = t(`sim.marker.${m.kind}`, { truck: (m.truck ?? 0) + 1, house: (m.house ?? 0) + 1 });
            return (
              <button
                key={i}
                type="button"
                className={s.marker}
                style={{ left: pct(m.minute) }}
                onClick={() => onSeek(m.minute - 30)}
                aria-label={t("sim.jumpTo", { label, day: Math.floor(m.minute / MIN_PER_DAY) + 1 })}
                title={label}
              >
                <span aria-hidden="true" className={s.markerText}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- controls ----------

export function Controls({ playing, done, onToggle, onRestart, speed, onSpeed }: {
  playing: boolean;
  done: boolean;
  onToggle: () => void;
  onRestart: () => void;
  speed: SpeedId;
  onSpeed: (s: SpeedId) => void;
}) {
  return (
    <div className={s.controls}>
      <Button onClick={onToggle} disabled={done} icon={playing ? <Pause /> : <Play />} aria-keyshortcuts="Space">
        {playing ? t("sim.pause") : t("sim.play")}
      </Button>
      <Button variant="secondary" onClick={onRestart} icon={<RotateCcw />}>
        {t("sim.restart")}
      </Button>
      <fieldset className={s.speeds}>
        <legend className={s.srOnly}>{t("sim.speed")}</legend>
        {SPEED_ORDER.map((id) => (
          <button key={id} type="button" className={id === speed ? s.speedOn : s.speedBtn} aria-pressed={id === speed} onClick={() => onSpeed(id)}>
            {t(`sim.speed.${id}`)}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

// ---------- legend ----------

export function Legend() {
  const item = (glyph: ReactNode, label: string, vb = "-90 -150 180 260") => (
    <li className={s.legendItem}>
      <svg viewBox={vb} className={s.legendSvg} aria-hidden="true">{glyph}</svg>
      <span>{label}</span>
    </li>
  );
  const base = { x: 0, y: 30, level: 0.7, lit: false, dry: false, delivered: false, emergency: false, app: false };
  return (
    <section className={s.legend} aria-label={t("sim.legend.title")}>
      <ul>
        {item(<HouseGlyph {...base} />, t("sim.legend.tank"))}
        {item(<HouseGlyph {...base} level={0.2} lit />, t("sim.legend.light"))}
        {item(<HouseGlyph {...base} level={0} dry />, t("sim.legend.dry"))}
        {item(<HouseGlyph {...base} delivered level={1} />, t("sim.legend.delivered"))}
        {item(<HouseGlyph {...base} emergency level={0.05} lit />, t("sim.legend.emergency"))}
        {item(<HouseGlyph {...base} app />, t("sim.legend.app"))}
        {item(<TruckGlyph x={0} y={0} n={1} state="delivering" />, t("sim.legend.truck"), "-90 -60 180 120")}
      </ul>
    </section>
  );
}

// ---------- assumptions ----------

export function Assumptions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const p = DEFAULT_PARAMS;
  const src = (k: ParamSource) => t(`sim.source.${k}`);
  const rows: [string, string, ParamSource][] = [
    [t("sim.param.houses"), t("sim.param.houses.v"), PARAM_SOURCES.houseCount!],
    [t("sim.param.trucks"), String(p.truckCount), PARAM_SOURCES.truckCount!],
    [t("sim.param.capacity"), t("sim.unit.litres", { n: fmtInt(p.truckCapacityL) }), PARAM_SOURCES.truckCapacityL!],
    [t("sim.param.tank"), t("sim.param.tank.v", { mode: fmtInt(p.tankModeL), min: fmtInt(p.tankMinL), max: fmtInt(p.tankMaxL) }), "study"],
    [t("sim.param.lasts"), t("sim.param.lasts.v", { min: p.lastsMinDays, max: p.lastsMaxDays }), "study"],
    [t("sim.param.breakdown"), t("sim.param.breakdown.v"), "amenda"],
    [t("sim.param.blizzard"), t("sim.param.blizzard.v"), "amenda"],
    [t("sim.param.speed"), t("sim.unit.kmh", { n: p.truckSpeedKmh }), "assumption"],
    [t("sim.param.stop"), t("sim.param.stop.v", { hookup: p.stopHookupMin, pump: p.pumpLPerMin }), "assumption"],
    [t("sim.param.fill"), t("sim.unit.min", { n: p.fullFillMin }), "assumption"],
    [t("sim.param.service"), t("sim.param.service.v", { from: hhmm(p.serviceStartMin), to: hhmm(p.serviceEndMin) }), "assumption"],
    [t("sim.param.use"), t("sim.param.use.v", { from: hhmm(p.useStartMin), to: hhmm(p.useEndMin) }), "assumption"],
    [t("sim.param.light"), t("sim.param.light.v", { pct: Math.round(p.lightAtFraction * 100) }), "assumption"],
    [t("sim.param.adoption"), t("sim.unit.pct", { n: Math.round(p.appAdoption * 100) }), "assumption"],
    [t("sim.param.start"), t("sim.param.start.v", { pct: Math.round(p.startLevelMin * 100) }), "assumption"],
    [t("sim.param.spot"), t("sim.unit.m", { n: p.spotRangeM }), "assumption"],
    [t("sim.param.emergency"), t("sim.param.emergency.v"), "assumption"],
    [t("sim.param.seed"), String(p.seed), "assumption"],
  ];
  return (
    <dialog ref={ref} className={s.dialog} onClose={onClose} aria-labelledby="sim-assumptions-title">
      <div className={s.dialogHead}>
        <h2 id="sim-assumptions-title">{t("sim.assumptions.title")}</h2>
        <Button variant="secondary" onClick={onClose} icon={<X />}>
          {t("sim.assumptions.close")}
        </Button>
      </div>
      <p className={s.simTag}>{t("common.simLabel")}</p>
      <p className={s.strong}>{t("sim.assumptions.never")}</p>
      <p>{t("sim.assumptions.conservative")}</p>
      <p>{t("sim.assumptions.fair")}</p>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">{t("sim.assumptions.param")}</th>
            <th scope="col">{t("sim.assumptions.value")}</th>
            <th scope="col">{t("sim.assumptions.source")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v, so]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
              <td>{src(so)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </dialog>
  );
}

export function AssumptionsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={s.simLabel} onClick={onOpen}>
      <Info size={20} aria-hidden="true" />
      <span>{t("common.simLabel")}</span>
      <span className={s.simLabelLink}>{t("sim.assumptions.open")}</span>
    </button>
  );
}

// ---------- end summary ----------

export function Summary({ today, imaq, onReplay, onAssumptions }: { today: WorldState; imaq: WorldState; onReplay: () => void; onAssumptions: () => void }) {
  const T = today.metrics.householdHoursDry;
  const I = imaq.metrics.householdHoursDry;
  const pct = T > 0 ? Math.round(((T - I) / T) * 100) : 0;
  const line = Math.abs(pct) < 3 ? t("sim.summary.same") : pct > 0 ? t("sim.summary.fewer", { pct }) : t("sim.summary.more", { pct: -pct });
  const rows: [string, string, string][] = [
    [t("sim.counter.hhDry"), fmtInt(T), fmtInt(I)],
    [t("sim.summary.oldestMax"), formatAge(today.metrics.maxWaitMin * 60_000), formatAge(imaq.metrics.maxWaitMin * 60_000)],
    [t("sim.counter.deliveries"), String(today.metrics.deliveries), String(imaq.metrics.deliveries)],
    [t("sim.counter.km"), fmtInt(today.metrics.km), fmtInt(imaq.metrics.km)],
  ];
  return (
    <section className={s.summary} aria-labelledby="sim-summary-title">
      <AssumptionsButton onOpen={onAssumptions} />
      <h2 id="sim-summary-title" className={s.summaryTitle}>{t("sim.summary.title")}</h2>
      <p className={s.summaryLead}>{t("sim.summary.lead")}</p>
      <p className={s.summaryLine}>{line}</p>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">{t("sim.summary.metric")}</th>
            <th scope="col">{t("sim.today.title")}</th>
            <th scope="col">{t("sim.imaq.title")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t("sim.assumptions.never")}</p>
      <Button size="hero" onClick={onReplay} icon={<RotateCcw />}>
        {t("sim.replay")}
      </Button>
    </section>
  );
}
