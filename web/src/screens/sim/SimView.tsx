import { useEffect, useState } from "react";
import { t } from "../../i18n";
import type { WorldId } from "../../sim/engine";
import { useSimRunner } from "../../sim/render/useSimRunner";
import { VillageMap } from "../../sim/render/VillageMap";
import { Assumptions, AssumptionsButton, Clock, Controls, Counters, Legend, Summary, Ticker, Timeline, TruckList } from "../../sim/render/Panels";
import { SiteHeader } from "../shared/SiteHeader";
import s from "../../sim/render/sim.module.css";

const SEED = 1;
/** Presenting mode is for a projector; below this width the normal layout is already compact. */
const PRESENT_MIN_WIDTH = "(min-width: 1024px)";
const wideEnough = () => typeof window !== "undefined" && window.matchMedia?.(PRESENT_MIN_WIDTH).matches === true;

/**
 * Runner states (see useSimRunner): paused at 0 -> playing -> paused ... -> finished (summary
 * over the panes, Play disabled) -> Replay (playing from 0) or Restart (paused at 0).
 * Timeline markers seek from any state and leave the play state as it was.
 *
 * Layout states, independent of the runner: normal <-> presenting.
 *  - normal -> presenting: the Present button; or Play week pressed at the start of a week (minute 0)
 *    or Replay, on viewports >= 1024 px. Resuming after a pause does not re-enter, so a presenter who
 *    left presenting mode is not pulled back in.
 *  - presenting -> normal: the Exit presentation button, or Escape (unless a dialog is open, where
 *    Escape closes the dialog).
 *  - Pause, Restart, seeking and the end of the week never change the layout.
 */
export default function SimView() {
  const r = useSimRunner(SEED);
  const { sim } = r;
  const st = sim.state;
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);

  // Space = play / pause, unless a control that uses space itself has focus. Escape leaves presenting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === "Escape") {
        if (presenting && !document.querySelector("dialog[open]") && !el?.closest("dialog")) setPresenting(false);
        return;
      }
      if (e.code !== "Space" && e.key !== " ") return;
      if (el && el.closest("button, input, select, textarea, a, dialog, summary")) return;
      e.preventDefault();
      r.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Presenting fills the viewport from the top; never start it half scrolled.
  useEffect(() => {
    if (presenting) window.scrollTo(0, 0);
  }, [presenting]);

  const onPlayButton = () => {
    if (!r.playing && st.minute === 0 && wideEnough()) setPresenting(true);
    r.toggle();
  };
  const onReplay = () => {
    if (wideEnough()) setPresenting(true);
    r.reset(0, true);
  };

  const daysDone = st.worlds.today.daily.length;
  const lastDay = daysDone > 0 ? daysDone : 0;
  const srText =
    lastDay === 0
      ? ""
      : st.done
        ? t("sim.sr.done")
        : t("sim.sr.day", {
            day: lastDay,
            tDry: st.worlds.today.metrics.dryNow,
            tHh: Math.round(st.worlds.today.daily[lastDay - 1].householdHoursDry),
            iDry: st.worlds.imaq.metrics.dryNow,
            iHh: Math.round(st.worlds.imaq.daily[lastDay - 1].householdHoursDry),
          });

  const desc = (id: WorldId) => (presenting ? t(`sim.${id}.short`) : id === "imaq" ? t("sim.imaq.descOne") : t("sim.today.desc"));

  const pane = (id: WorldId) => {
    const w = st.worlds[id];
    const lit = w.houses.filter((h) => h.lightOn).length;
    const trucks = w.trucks.map((tr) => t("sim.truckLine", { n: tr.id + 1, state: t(`sim.truckState.${tr.state}`) })).join(". ");
    return (
      <div className={s.col}>
        <section className={s.pane} aria-labelledby={`pane-${id}`}>
          <header className={s.paneHead}>
            <h2 id={`pane-${id}`} className={`eyebrow ${s.paneEyebrow}`}>{t(`sim.${id}.title`)}</h2>
            <p className={s.paneDesc}>{desc(id)}</p>
          </header>
          <figure className={s.mapWrap}>
            <VillageMap
              village={st.village}
              houses={w.houses}
              trucks={w.trucks}
              minute={st.minute}
              frac={r.frac}
              world={id}
              blizzard={st.blizzard}
              version={r.houseVersion}
              ariaLabel={t("sim.mapAria", { world: t(`sim.${id}.title`), dry: w.metrics.dryNow, lit, trucks })}
            />
            <figcaption className={s.mapCaption}>{t("sim.mapLabel")}</figcaption>
          </figure>
          <Counters metrics={w.metrics} />
        </section>
        <TruckList trucks={w.trucks} label={t("sim.trucksLabel", { world: t(`sim.${id}.title`) })} />
      </div>
    );
  };

  return (
    <div className={s.page}>
      {!presenting && <SiteHeader />}
      <main className={presenting ? `${s.root} ${s.presenting}` : s.root}>
        <div className={s.top}>
          <div className={s.headingText}>
            <AssumptionsButton onOpen={() => setAssumptionsOpen(true)} />
            <h1 className={s.title}>{t("sim.pageTitle")}</h1>
            <p className={s.subtitle}>{t("sim.pageSub")}</p>
          </div>
          <Controls
            playing={r.playing}
            done={st.done}
            onToggle={onPlayButton}
            onRestart={() => r.reset(0, false)}
            speed={r.speed}
            onSpeed={r.setSpeed}
            presenting={presenting}
            onPresent={setPresenting}
          />
          <Clock state={st} />
          <Timeline state={st} onSeek={r.seek} />
        </div>
        <div className={s.panes}>
          {pane("today")}
          {pane("imaq")}
          {st.done && (
            <div className={s.summaryOverlay}>
              <Summary
                today={st.worlds.today}
                imaq={st.worlds.imaq}
                onReplay={onReplay}
                onAssumptions={() => setAssumptionsOpen(true)}
                scrollOnShow={!presenting}
              />
            </div>
          )}
        </div>
        <Ticker state={st} />
        {!presenting && <Legend />}
        <p className={s.srOnly} aria-live="polite">{srText}</p>
        <Assumptions open={assumptionsOpen} onClose={() => setAssumptionsOpen(false)} />
      </main>
    </div>
  );
}
