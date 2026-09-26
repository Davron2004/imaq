/** Per-day metrics for both worlds, seeds 1..5. Used for calibration. `npm run sim:report` */
import { createSim, MIN_PER_DAY } from "../web/src/sim/engine";

const pad = (s: string | number, n: number) => String(s).padStart(n);
const reduction = (t: number, i: number) => (t > 0 ? (((t - i) / t) * 100).toFixed(0) : 0);
for (let seed = 1; seed <= 5; seed++) {
  const sim = createSim({}, seed);
  // Step minute by minute so we can snapshot the outside-blizzard counter at each day end
  // (same moment `daily` is recorded) and flag the days the blizzard was in effect.
  const outside: { today: number; imaq: number }[] = [];
  const blizzardDay: boolean[] = [];
  let sawBlizzard = false;
  while (!sim.state.done) {
    sim.step(1);
    if (sim.state.blizzard) sawBlizzard = true;
    if (sim.state.minute % MIN_PER_DAY === 0) {
      const w = sim.state.worlds;
      outside.push({ today: w.today.metrics.householdHoursDryOutsideBlizzard, imaq: w.imaq.metrics.householdHoursDryOutsideBlizzard });
      blizzardDay.push(sawBlizzard);
      sawBlizzard = false;
    }
  }
  const { today, imaq } = sim.state.worlds;
  console.log(`\nseed ${seed}`);
  console.log("day | maxDry Today Imaq | hh-dry Today   Imaq | hh-dry-outside-blizzard Today   Imaq | deliveries Today Imaq | km Today  Imaq");
  for (let d = 0; d < today.daily.length; d++) {
    const a = today.daily[d];
    const b = imaq.daily[d];
    const o = outside[d];
    const day = `${d + 1}${blizzardDay[d] ? "*" : " "}`;
    console.log(
      `${pad(day, 3)} | ${pad(a.maxDry, 12)} ${pad(b.maxDry, 4)} | ${pad(a.householdHoursDry.toFixed(0), 12)} ${pad(b.householdHoursDry.toFixed(0), 6)} | ${pad(o.today.toFixed(0), 29)} ${pad(o.imaq.toFixed(0), 6)} | ${pad(a.deliveries, 16)} ${pad(b.deliveries, 4)} | ${pad(a.km.toFixed(0), 8)} ${pad(b.km.toFixed(0), 5)}`,
    );
  }
  console.log("(hh-dry columns are cumulative at day end; * = blizzard in effect that day)");
  const T = today.metrics.householdHoursDry;
  const I = imaq.metrics.householdHoursDry;
  console.log(`final household-hours dry: Today ${T.toFixed(0)}, Imaq ${I.toFixed(0)}, reduction ${reduction(T, I)}%`);
  const TO = today.metrics.householdHoursDryOutsideBlizzard;
  const IO = imaq.metrics.householdHoursDryOutsideBlizzard;
  console.log(`household-hours dry outside the blizzard: Today ${TO.toFixed(0)}, Imaq ${IO.toFixed(0)}, reduction ${reduction(TO, IO)}%`);
}
