import { useCallback, useEffect, useRef, useState } from "react";
import { createSim, type Sim } from "../engine";

/**
 * Real-time driver for the engine. Fixed 1-minute engine steps; the number of steps per frame
 * comes from the speed. `frac` (0..1) is how far we are into the next step, for interpolation.
 *
 * Runner states: paused ⇄ playing; playing → finished when the week ends (auto-pauses);
 * restart/replay → paused at minute 0 (or playing for Replay). Seek = rebuild + fast-forward.
 */
export type SpeedId = "half" | "one" | "two" | "four" | "pitch";
/** Simulated minutes per real second. 1× = 25 s per day; Pitch = whole week in ~60 s. */
export const SPEEDS: Record<SpeedId, number> = {
  half: 1440 / 50,
  one: 1440 / 25,
  two: 1440 / 12.5,
  pitch: (7 * 1440) / 60,
  four: 1440 / 6.25,
};
export const SPEED_ORDER: SpeedId[] = ["half", "one", "two", "pitch", "four"];

const HOUSE_REFRESH_MS = 200; // house levels ~5×/s

export function useSimRunner(seed: number) {
  const simRef = useRef<Sim>(createSim({}, seed));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<SpeedId>("pitch");
  const [, setFrame] = useState(0);
  const [houseVersion, setHouseVersion] = useState(0);
  const [runId, setRunId] = useState(0);
  const acc = useRef(0);
  const lastHouse = useRef(0);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  playingRef.current = playing;
  speedRef.current = speed;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); // clamp: a background tab must not jump days
      last = now;
      const sim = simRef.current;
      if (playingRef.current && !sim.state.done) {
        acc.current += dt * SPEEDS[speedRef.current];
        const n = Math.floor(acc.current);
        acc.current -= n;
        if (n > 0) sim.step(n);
        if (sim.state.done) {
          acc.current = 0;
          setPlaying(false);
        }
        setFrame((f) => (f + 1) % 1_000_000);
        if (now - lastHouse.current >= HOUSE_REFRESH_MS || sim.state.done) {
          lastHouse.current = now;
          setHouseVersion((v) => v + 1);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reset = useCallback(
    (toMinute = 0, play = false) => {
      const sim = createSim({}, seed);
      if (toMinute > 0) sim.step(toMinute);
      simRef.current = sim;
      acc.current = 0;
      setRunId((r) => r + 1);
      setHouseVersion((v) => v + 1);
      setFrame((f) => f + 1);
      setPlaying(play);
    },
    [seed],
  );

  const seek = useCallback(
    (minute: number) => {
      const sim = simRef.current;
      const target = Math.max(0, Math.min(sim.state.totalMinutes - 1, minute));
      if (target >= sim.state.minute) {
        sim.step(target - sim.state.minute);
        acc.current = 0;
        setHouseVersion((v) => v + 1);
        setFrame((f) => f + 1);
      } else reset(target, playingRef.current);
    },
    [reset],
  );

  return {
    sim: simRef.current,
    frac: playing ? acc.current : 0,
    playing,
    setPlaying,
    toggle: () => setPlaying((p) => (simRef.current.state.done ? p : !p)),
    speed,
    setSpeed,
    houseVersion,
    runId,
    reset,
    seek,
  };
}
