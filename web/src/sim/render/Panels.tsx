import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, CheckCircle2, Mic, Pause, Play, RotateCcw, TriangleAlert, X } from "lucide-react";
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

/** Five counters, same order on both sides: the first is the lead (big, full width), then four. */
export function Counters({ metrics }: { metrics: Metrics }) {
  const [lead, ...rest] = COUNTERS;
  return (
    <dl className={s.counters}>
      <div className={s.counterLead}>
        <dt className={s.counterLeadLabel}>{t(lead.label)}</dt>
        <dd className={s.counterLeadValue}>{lead.fmt(metrics)}</dd>
      </div>
      {rest.map((c) => (
        <div key={c.key} className={s.counter}>
          <dt className={s.counterLabel}>{t(c.label)}</dt>
          <dd className={s.counterValue}>{c.fmt(metrics)}</dd>
          {c.key === "householdHoursDry" && (
            <dd className={s.counterSub}>{t("sim.counter.hhOutsideBlizzard", { n: fmtInt(metrics.householdHoursDryOutsideBlizzard) })}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

// ---------- trucks in words ----------

export function TruckList({ trucks, label }: { trucks: TruckStateObj[]; label: string }) {
  return (
    <ul className={s.truckList} aria-label={label}>
      {trucks.map((tr) => {
        const Icon = TRUCK_ICON[tr.state];
        return (
          <li key={tr.id} className={tr.state === "down" ? s.truckChipDown : s.truckChip}>
            <Icon size={16} aria-hidden="true" />
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
  for (let i = events.length - 1; i >= 0 && shownPinned.length < 2; i--) {
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
      <h3 className={`eyebrow ${s.tickerTitle}`}>{t("sim.tickerEyebrow")}</h3>
      <div className={s.tickerBody}>
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
      </div>
    </section>
  );
}

// ---------- clock + timeline ----------

const SCHEDULE_RANK: Partial<Record<SimEvent["kind"], number>> = { blizzardStart: 5, truckDown: 4, truckBack: 3, blizzardEnd: 2, emergency: 1 };

/** One headline per day, derived from the scripted markers (identical on both sides). */
export function daySchedule(state: SimState): { label: string; alert: boolean }[] {
  return Array.from({ length: state.params.days }, (_, d) => {
    let best: SimState["markers"][number] | null = null;
    for (const m of state.markers) {
      if (Math.floor(m.minute / MIN_PER_DAY) !== d) continue;
      const r = SCHEDULE_RANK[m.kind] ?? 0;
      if (r > 0 && (!best || r > (SCHEDULE_RANK[best.kind] ?? 0))) best = m;
    }
    if (!best) return { label: t("sim.schedule.normal"), alert: false };
    return {
      label: t(`sim.schedule.${best.kind}`, { truck: (best.truck ?? 0) + 1, house: (best.house ?? 0) + 1 }),
      alert: best.kind === "blizzardStart" || best.kind === "truckDown" || best.kind === "emergency",
    };
  });
}

export function currentDay(state: SimState): number {
  return Math.min(state.params.days, Math.floor(Math.min(state.minute, state.totalMinutes - 1) / MIN_PER_DAY) + 1);
}

/** "Day 1 · 00:00" plus the day's headline as a status tag (words and an icon, never colour alone). */
export function Clock({ state }: { state: SimState }) {
  const day = currentDay(state);
  const sched = daySchedule(state)[day - 1];
  return (
    <div className={s.clockRow} aria-hidden="true">
      <strong className={s.clock}>{t("sim.clock", { day, time: hhmm(Math.min(state.minute, state.totalMinutes - 1) % MIN_PER_DAY) })}</strong>
      <span className={sched.alert ? s.tagWarn : s.tag}>
        {sched.alert && <TriangleAlert size={16} aria-hidden="true" />}
        {sched.label}
      </span>
    </div>
  );
}

/** Seven day segments with a label under each; scripted events are jump markers on the bar. */
export function Timeline({ state, onSeek }: { state: SimState; onSeek: (minute: number) => void }) {
  const days = state.params.days;
  const day = currentDay(state);
  const sched = daySchedule(state);
  const markers = state.markers.filter((m) => m.kind !== "blizzardEnd");
  return (
    <div className={s.timeline} role="group" aria-label={t("sim.timeline")}>
      <ol className={s.days} style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
        {sched.map((sc, d) => {
          const fill = Math.max(0, Math.min(1, (state.minute - d * MIN_PER_DAY) / MIN_PER_DAY));
          return (
            <li key={d} className={d + 1 === day ? s.dayOn : s.day} aria-current={d + 1 === day ? "step" : undefined}>
              <span className={s.dayBar}>
                <span className={s.dayFill} style={{ transform: `scaleX(${fill})` }} />
              </span>
              <span className={s.dayName}>{t("sim.day", { day: d + 1 })}</span>
              <span className={s.dayLabel}>{sc.label}</span>
            </li>
          );
        })}
      </ol>
      <div className={s.markers}>
        {markers.map((m, i) => {
          const label = t(`sim.marker.${m.kind}`, { truck: (m.truck ?? 0) + 1, house: (m.house ?? 0) + 1 });
          return (
            <button
              key={i}
              type="button"
              className={s.marker}
              style={{ left: `${(m.minute / state.totalMinutes) * 100}%` }}
              onClick={() => onSeek(m.minute - 30)}
              aria-label={t("sim.jumpTo", { label, day: Math.floor(m.minute / MIN_PER_DAY) + 1 })}
              title={label}
            >
              <span aria-hidden="true" className={s.markerDot} />
            </button>
          );
        })}
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
        {playing ? t("sim.pause") : t("sim.playWeek")}
      </Button>
      <Button variant="secondary" onClick={onRestart} icon={<RotateCcw />}>
        {t("sim.restart")}
      </Button>
      <label className={s.speedField}>
        <span>{t("sim.speedLabel")}</span>
        <select value={speed} onChange={(e) => onSpeed(e.target.value as SpeedId)}>
          {SPEED_ORDER.map((id) => (
            <option key={id} value={id}>
              {t(`sim.speed.${id}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// ---------- legend ----------

export function Legend() {
  const item = (glyph: ReactNode, label: string, vb = "-32 -26 60 46") => (
    <li className={s.legendItem}>
      <svg viewBox={vb} className={s.legendSvg} aria-hidden="true">{glyph}</svg>
      <span>{label}</span>
    </li>
  );
  const base = { x: 0, y: 0, level: 0.7, lit: false, dry: false, delivered: false, emergency: false, app: false, scale: 1 };
  return (
    <section className={s.legend} aria-label={t("sim.legend.title")}>
      <h3 className={s.legendTitle}>{t("sim.legendKey")}</h3>
      <ul>
        {item(<HouseGlyph {...base} level={0} dry />, t("sim.key.dry"))}
        {item(<HouseGlyph {...base} level={0.2} lit />, t("sim.key.door"))}
        {item(<HouseGlyph {...base} />, t("sim.key.tank"))}
        {item(<HouseGlyph {...base} delivered level={1} />, t("sim.key.delivered"))}
        {item(<HouseGlyph {...base} emergency level={0.05} lit />, t("sim.key.emergency"))}
        {item(<HouseGlyph {...base} app />, t("sim.key.app"))}
        {item(<TruckGlyph x={0} y={0} n={1} state="delivering" />, t("sim.key.truck"), "-70 -44 140 88")}
        {item(<TruckGlyph x={0} y={0} n={2} state="down" />, t("sim.key.truckDown"), "-70 -44 140 88")}
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

/** The reference's "Simulation · assumed numbers ↗" link; opens the assumptions dialog. */
export function AssumptionsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={s.simLabel} onClick={onOpen} aria-haspopup="dialog">
      <span>{t("common.simLabel")}</span>
      <ArrowUpRight size={18} aria-hidden="true" />
    </button>
  );
}

// ---------- end summary ----------

const pctChange = (T: number, I: number) => {
  const pct = T > 0 ? Math.round(((T - I) / T) * 100) : 0;
  return Math.abs(pct) < 3 ? t("sim.summary.samePct") : pct > 0 ? t("sim.summary.fewerPct", { pct }) : t("sim.summary.morePct", { pct: -pct });
};

export function Summary({ today, imaq, onReplay, onAssumptions }: { today: WorldState; imaq: WorldState; onReplay: () => void; onAssumptions: () => void }) {
  const T = today.metrics.householdHoursDry;
  const I = imaq.metrics.householdHoursDry;
  const TO = today.metrics.householdHoursDryOutsideBlizzard;
  const IO = imaq.metrics.householdHoursDryOutsideBlizzard;
  const pct = T > 0 ? Math.round(((T - I) / T) * 100) : 0;
  const line = Math.abs(pct) < 3 ? t("sim.summary.same") : pct > 0 ? t("sim.summary.fewer", { pct }) : t("sim.summary.more", { pct: -pct });
  // When the week ends, bring the summary on screen (the panes may be scrolled on a projector).
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, []);
  const rows: [string, string, string, string][] = [
    [t("sim.counter.hhDry"), fmtInt(T), fmtInt(I), pctChange(T, I)],
    [t("sim.summary.outsideBlizzard"), fmtInt(TO), fmtInt(IO), pctChange(TO, IO)],
    [t("sim.summary.oldestMax"), formatAge(today.metrics.maxWaitMin * 60_000), formatAge(imaq.metrics.maxWaitMin * 60_000), ""],
    [t("sim.counter.deliveries"), String(today.metrics.deliveries), String(imaq.metrics.deliveries), ""],
    [t("sim.counter.km"), fmtInt(today.metrics.km), fmtInt(imaq.metrics.km), ""],
  ];
  return (
    <section ref={ref} className={s.summary} aria-labelledby="sim-summary-title">
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
            <th scope="col">{t("sim.summary.change")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b, c]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{a}</td>
              <td>{b}</td>
              <td>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={s.summaryNote}>{t("sim.summary.blizzardNote")}</p>
      <p className={s.summaryNever}>{t("sim.assumptions.never")}</p>
      <div>
        <Button size="hero" onClick={onReplay} icon={<RotateCcw />}>
          {t("sim.replay")}
        </Button>
      </div>
    </section>
  );
}
