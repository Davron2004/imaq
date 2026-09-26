import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "../../ui";
import { t } from "../../i18n";
import type { WorldId } from "../../sim/engine";
import { useSimRunner } from "../../sim/render/useSimRunner";
import { VillageMap } from "../../sim/render/VillageMap";
import { Assumptions, AssumptionsButton, Controls, Counters, Legend, Summary, Ticker, Timeline, TruckList } from "../../sim/render/Panels";
import s from "../../sim/render/sim.module.css";

const SEED = 1;

export default function SimView() {
  const r = useSimRunner(SEED);
  const { sim } = r;
  const st = sim.state;
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  // Space = play / pause, unless a control that uses space itself has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const el = e.target as HTMLElement | null;
      if (el && el.closest("button, input, select, textarea, a, dialog, summary")) return;
      e.preventDefault();
      r.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const started = st.minute > 0 || r.playing;
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

  const pane = (id: WorldId) => {
    const w = st.worlds[id];
    const lit = w.houses.filter((h) => h.lightOn).length;
    const trucks = w.trucks.map((tr) => t("sim.truckLine", { n: tr.id + 1, state: t(`sim.truckState.${tr.state}`) })).join(". ");
    return (
      <section className={s.pane} aria-labelledby={`pane-${id}`}>
        <header className={s.paneHead}>
          <h2 id={`pane-${id}`} className={s.paneTitle}>{t(`sim.${id}.title`)}</h2>
          <p className={s.paneSub}>{t(`sim.${id}.sub`)}</p>
        </header>
        <Counters metrics={w.metrics} />
        <div className={s.paneBody}>
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
          <div className={s.side}>
            <TruckList trucks={w.trucks} />
            {id === "imaq" && <Ticker state={st} />}
          </div>
        </div>
      </section>
    );
  };

  return (
    <main className={s.root}>
      <header className={s.top}>
        <h1 className={s.srOnly}>{t("sim.title")}</h1>
        <AssumptionsButton onOpen={() => setAssumptionsOpen(true)} />
        <Controls
          playing={r.playing}
          done={st.done}
          onToggle={r.toggle}
          onRestart={() => r.reset(0, false)}
          speed={r.speed}
          onSpeed={r.setSpeed}
        />
      </header>
      <Timeline state={st} onSeek={r.seek} />
      <div className={s.panes}>
        {pane("today")}
        {pane("imaq")}
        {!started && (
          <div className={s.startOverlay}>
            <Button size="hero" icon={<Play />} onClick={() => r.setPlaying(true)}>
              {t("sim.play")}
            </Button>
            <p>{t("sim.startHint")}</p>
          </div>
        )}
        {st.done && (
          <div className={s.summaryOverlay}>
            <Summary today={st.worlds.today} imaq={st.worlds.imaq} onReplay={() => r.reset(0, true)} onAssumptions={() => setAssumptionsOpen(true)} />
          </div>
        )}
      </div>
      <Legend />
      <p className={s.srOnly} aria-live="polite">{srText}</p>
      <Assumptions open={assumptionsOpen} onClose={() => setAssumptionsOpen(false)} />
    </main>
  );
}
