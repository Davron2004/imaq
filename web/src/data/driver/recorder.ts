/**
 * Voice recorder state machine:
 *
 *   idle ──start──▶ starting ──granted──▶ recording ──stop / 90 s──▶ saving ──▶ idle (lastSavedId set)
 *                     │                      └──cancel──▶ idle (discarded)
 *                     └──denied / no mic──▶ blocked  (explain + offer samples; start again allowed)
 *   any ──useSample──▶ saving ──▶ idle
 *
 * Input: hold to record (release after ≥ 0.6 s stops) and tap to start / tap to stop, from the same button.
 * Keyboard and switch users get the tap behaviour through the click event.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceContext } from "../../../../shared/types";
import { saveNote } from "./actions";

export const MAX_SECONDS = 90;
const HOLD_MS = 600;
const SAMPLE_CACHE = "imaq-demo-audio";

export const SAMPLES = [
  { sampleId: "heater-truck2", file: "/demo-audio/heater-truck2.m4a" },
  { sampleId: "road-blocked-22", file: "/demo-audio/road-blocked-22.m4a" },
  { sampleId: "unclear", file: "/demo-audio/unclear.m4a" },
] as const;
export type SampleId = (typeof SAMPLES)[number]["sampleId"];

/** Keep the three demo samples on the phone so "Use a sample" works offline too. */
export async function warmSamples() {
  try {
    if (!("caches" in window)) return;
    const cache = await caches.open(SAMPLE_CACHE);
    for (const s of SAMPLES) if (!(await cache.match(s.file))) await cache.add(s.file);
  } catch {
    /* offline or no Cache API: samples will be fetched when used */
  }
}

async function loadSample(file: string): Promise<Blob> {
  try {
    if ("caches" in window) {
      const hit = await (await caches.open(SAMPLE_CACHE)).match(file);
      if (hit) return await hit.blob();
    }
  } catch {
    /* fall through */
  }
  const res = await fetch(file);
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
}

function durationOf(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) && d > 0 ? d : 10);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(10);
    setTimeout(() => done(10), 3000);
    a.src = url;
  });
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

export type RecorderPhase = "idle" | "starting" | "recording" | "saving" | "blocked";
export type BlockedWhy = "denied" | "unavailable" | "sampleFailed" | null;

export interface RecorderTarget {
  villageId: string;
  context: VoiceContext;
  truckId: string | null;
  houseId: string | null;
}

export function useRecorder(target: RecorderTarget, onSaved?: (noteId: string) => void) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [why, setWhy] = useState<BlockedWhy>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const discard = useRef(false);
  const ticker = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const press = useRef({ startedByPress: false, downAt: 0, suppressClick: false });
  const targetRef = useRef(target);
  targetRef.current = target;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const cleanup = useCallback(() => {
    if (ticker.current) window.clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => {
    discard.current = true;
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    cleanup();
  }, [cleanup]);

  const persist = useCallback(async (blob: Blob, mime: string, durationS: number, sampleId: string | null) => {
    setPhase("saving");
    const t = targetRef.current;
    const id = await saveNote(t.villageId, { blob, mime, durationS, context: t.context, truckId: t.truckId, houseId: t.houseId, sampleId });
    setLastSavedId(id);
    setPhase("idle");
    onSavedRef.current?.(id);
  }, []);

  const stop = useCallback(() => {
    if (rec.current && rec.current.state === "recording") rec.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setWhy("unavailable");
      setPhase("blocked");
      return;
    }
    setPhase("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mime = pickMime();
      const r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
      rec.current = r;
      chunks.current = [];
      discard.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        const durationS = Math.min(MAX_SECONDS, (Date.now() - startedAt.current) / 1000);
        const type = r.mimeType || mime || "audio/webm";
        cleanup();
        if (discard.current || chunks.current.length === 0) {
          setPhase("idle");
          return;
        }
        void persist(new Blob(chunks.current, { type }), type, durationS, null);
      };
      try {
        const ctx = new AudioContext();
        audioCtx.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const read = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          return Math.min(1, Math.sqrt(sum / buf.length) * 4);
        };
        (ctx as AudioContext & { _read?: () => number })._read = read;
      } catch {
        /* no level meter; recording still works */
      }
      startedAt.current = Date.now();
      setElapsed(0);
      r.start(1000);
      setPhase("recording");
      ticker.current = window.setInterval(() => {
        const sec = (Date.now() - startedAt.current) / 1000;
        setElapsed(sec);
        const read = (audioCtx.current as (AudioContext & { _read?: () => number }) | null)?._read;
        if (read) setLevel(read());
        if (sec >= MAX_SECONDS) stop();
      }, 100);
    } catch (err) {
      cleanup();
      const name = (err as { name?: string })?.name;
      setWhy(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      setPhase("blocked");
    }
  }, [cleanup, persist, stop]);

  const cancel = useCallback(() => {
    discard.current = true;
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    else setPhase("idle");
  }, []);

  const useSample = useCallback(
    async (sampleId: SampleId) => {
      const s = SAMPLES.find((x) => x.sampleId === sampleId)!;
      setPhase("saving");
      try {
        const blob = await loadSample(s.file);
        const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type : "audio/mp4";
        await persist(blob, mime, await durationOf(blob), sampleId);
      } catch {
        setWhy("sampleFailed");
        setPhase("blocked");
      }
    },
    [persist],
  );

  /** Button handlers: hold to record, or tap to start and tap to stop. */
  const buttonHandlers = {
    onPointerDown: () => {
      press.current.suppressClick = false;
      if (phase === "idle" || phase === "blocked") {
        press.current = { startedByPress: true, downAt: Date.now(), suppressClick: false };
        void start();
      } else press.current.startedByPress = false;
    },
    onPointerUp: () => {
      if (press.current.startedByPress && Date.now() - press.current.downAt >= HOLD_MS) {
        press.current.suppressClick = true;
        press.current.startedByPress = false;
        stop();
      }
    },
    onClick: () => {
      if (press.current.suppressClick) {
        press.current.suppressClick = false;
        return;
      }
      if (press.current.startedByPress) {
        press.current.startedByPress = false; // a quick tap started it: keep recording until the next tap
        return;
      }
      if (phase === "recording") stop();
      else if (phase === "idle" || phase === "blocked") void start();
    },
  };

  return { phase, why, elapsed, level, lastSavedId, start, stop, cancel, useSample, buttonHandlers, clearSaved: () => setLastSavedId(null) };
}
