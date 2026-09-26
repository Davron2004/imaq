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

describe("householdHoursDryOutsideBlizzard", () => {
  const worlds = ["today", "imaq"] as const;

  it("is at most the total in both worlds, seeds 1..20", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { worlds: w } = runWeek(seed).state;
      for (const wid of worlds) {
        const m = w[wid].metrics;
        expect(m.householdHoursDryOutsideBlizzard, `seed ${seed} ${wid}`).toBeGreaterThanOrEqual(0);
        expect(m.householdHoursDryOutsideBlizzard, `seed ${seed} ${wid}`).toBeLessThanOrEqual(m.householdHoursDry);
      }
    }
  });

  it("equals the total minus dry minutes counted independently during the blizzard, seeds 1..5", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const sim = createSim({}, seed);
      const st = sim.state;
      const blizzardDryMin = { today: 0, imaq: 0 };
      const allDryMin = { today: 0, imaq: 0 };
      let blizzardSteps = 0;
      while (!st.done) {
        sim.step(1);
        // Scripted events run before the worlds step, so after step(1) `st.blizzard`
        // is the flag that was in effect for the minute just simulated.
        if (st.blizzard) blizzardSteps++;
        for (const wid of worlds) {
          const dry = st.worlds[wid].houses.filter((h) => h.dry).length;
          allDryMin[wid] += dry;
          if (st.blizzard) blizzardDryMin[wid] += dry;
        }
      }
      // The scripted blizzard covers exactly one full day of the week.
      expect(blizzardSteps).toBe(MIN_PER_DAY);
      for (const wid of worlds) {
        const m = st.worlds[wid].metrics;
        expect(m.householdHoursDry).toBeCloseTo(allDryMin[wid] / 60, 9);
        expect(m.householdHoursDryOutsideBlizzard, `seed ${seed} ${wid}`).toBeCloseTo((allDryMin[wid] - blizzardDryMin[wid]) / 60, 9);
        expect(m.householdHoursDry - m.householdHoursDryOutsideBlizzard).toBeCloseTo(blizzardDryMin[wid] / 60, 9);
      }
    }
  });

  it("equals the total when the run ends before the blizzard (days: 4)", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const sim = createSim({ days: 4 }, seed);
      let sawBlizzard = false;
      while (!sim.state.done) {
        sim.step(1);
        if (sim.state.blizzard) sawBlizzard = true;
      }
      expect(sawBlizzard).toBe(false);
      for (const wid of worlds) {
        const m = sim.state.worlds[wid].metrics;
        expect(m.householdHoursDry).toBeGreaterThan(0);
        expect(m.householdHoursDryOutsideBlizzard).toBe(m.householdHoursDry);
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = runWeek(3).state;
    const b = runWeek(3).state;
    for (const wid of worlds) {
      expect(a.worlds[wid].metrics.householdHoursDryOutsideBlizzard).toBe(b.worlds[wid].metrics.householdHoursDryOutsideBlizzard);
    }
    expect(hashState(a)).toBe(hashState(b));
  });
});
