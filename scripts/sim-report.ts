/** Per-day metrics for both worlds, seeds 1..5. Used for calibration. `npm run sim:report` */
import { createSim } from "../web/src/sim/engine";

const pad = (s: string | number, n: number) => String(s).padStart(n);
for (let seed = 1; seed <= 5; seed++) {
  const sim = createSim({}, seed);
  sim.step(sim.state.totalMinutes);
  const { today, imaq } = sim.state.worlds;
  console.log(`\nseed ${seed}`);
  console.log("day | maxDry Today Imaq | hh-dry Today   Imaq | deliveries Today Imaq | km Today  Imaq");
  for (let d = 0; d < today.daily.length; d++) {
    const a = today.daily[d];
    const b = imaq.daily[d];
    console.log(
      `${pad(d + 1, 3)} | ${pad(a.maxDry, 12)} ${pad(b.maxDry, 4)} | ${pad(a.householdHoursDry.toFixed(0), 12)} ${pad(b.householdHoursDry.toFixed(0), 6)} | ${pad(a.deliveries, 16)} ${pad(b.deliveries, 4)} | ${pad(a.km.toFixed(0), 8)} ${pad(b.km.toFixed(0), 5)}`,
    );
  }
  const T = today.metrics.householdHoursDry;
  const I = imaq.metrics.householdHoursDry;
  console.log(`final household-hours dry: Today ${T.toFixed(0)}, Imaq ${I.toFixed(0)}, reduction ${T > 0 ? (((T - I) / T) * 100).toFixed(0) : 0}%`);
}
