import { describe, expect, it } from "vitest";
import { createSim, hashState, MIN_PER_DAY } from ".";

const runWeek = (seed: number) => {
  const sim = createSim({}, seed);
  sim.step(sim.state.totalMinutes);
  return sim;
};

describe("sim determinism", () => {
  it("same seed gives the same final state", () => {
    expect(hashState(runWeek(1).state)).toBe(hashState(runWeek(1).state));
  });
  it("different seeds differ", () => {
    expect(hashState(runWeek(1).state)).not.toBe(hashState(runWeek(2).state));
  });
});

describe("sim robustness, seeds 1..20", () => {
  for (let seed = 1; seed <= 20; seed++) {
    it(`seed ${seed}: full week, sane numbers, no stuck trucks`, () => {
      const sim = createSim({}, seed);
      const st = sim.state;
      const p = st.params;
      // Per world/truck: minute the truck last moved, while it had work.
      const lastMoved: Record<string, number> = {};
      const lastPos: Record<string, string> = {};
      while (!st.done) {
        sim.step(1);
        const m = st.minute - 1;
        const tod = m % MIN_PER_DAY;
        const inService = tod >= p.serviceStartMin && tod < p.serviceEndMin;
        for (const w of Object.values(st.worlds)) {
          for (const h of w.houses) {
            if (!Number.isFinite(h.levelL) || h.levelL < 0) throw new Error(`bad tank level ${h.levelL} on minute ${m}`);
          }
          for (const k of Object.values(w.metrics)) if (!Number.isFinite(k)) throw new Error(`bad metric on minute ${m}`);
          const workExists = w.houses.some((h) => h.lightOn);
          for (const tr of w.trucks) {
            if (!Number.isFinite(tr.pos.x) || !Number.isFinite(tr.pos.y) || !(tr.waterL >= 0)) throw new Error(`bad truck ${tr.id} on minute ${m}`);
            const key = `${w.id}-${tr.id}`;
            const pos = `${tr.pos.x.toFixed(1)},${tr.pos.y.toFixed(1)}`;
            const excused = !inService || tr.state === "down" || tr.state === "held" || !workExists;
            if (excused || pos !== lastPos[key]) lastMoved[key] = m;
            lastPos[key] = pos;
            if (m - lastMoved[key] > 180) throw new Error(`${key} stuck at ${pos} (${tr.state}) on minute ${m}`);
          }
        }
      }
      expect(st.worlds.today.daily).toHaveLength(p.days);
      expect(st.worlds.imaq.daily).toHaveLength(p.days);
    });
  }
});
