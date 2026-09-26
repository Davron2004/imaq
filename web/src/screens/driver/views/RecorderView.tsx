import { Mic, Square, FileAudio } from "lucide-react";
import { Button } from "../../../ui";
import { t } from "../../../i18n";
import type { BlockedWhy, RecorderPhase, SampleId } from "../../../data/driver/recorder";
import s from "../driver.module.css";

export interface RecorderVm {
  phase: RecorderPhase;
  why: BlockedWhy;
  elapsedS: number;
  maxS: number;
  level: number;
  savedText: string | null;
  samples: SampleId[];
  /** Demo villages always offer samples; elsewhere only when the mic is blocked. */
  showSamples: boolean;
}

export function RecorderView({ vm, handlers, onCancel, onSample }: {
  vm: RecorderVm;
  handlers: { onPointerDown: () => void; onPointerUp: () => void; onClick: () => void };
  onCancel: () => void;
  onSample: (id: SampleId) => void;
}) {
  const recording = vm.phase === "recording";
  const label =
    vm.phase === "starting" ? t("driver.voice.starting") : vm.phase === "saving" ? t("driver.voice.saving") : recording ? t("driver.voice.tapToStop") : t("driver.voice.hold");
  return (
    <div className={s.stack}>
      <button
        type="button"
        className={`${s.recBtn} ${recording ? s.recOn : ""}`}
        aria-pressed={recording}
        disabled={vm.phase === "saving"}
        onPointerDown={handlers.onPointerDown}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerUp}
        onClick={handlers.onClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        {recording ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
        <span>{label}</span>
      </button>
      {recording && (
        <>
          <p aria-live="off">{t("driver.voice.elapsed", { sec: Math.floor(vm.elapsedS), max: vm.maxS })}</p>
          <meter className={s.meter} min={0} max={1} value={vm.level} aria-label={t("driver.voice.level")} />
          <Button variant="secondary" onClick={onCancel}>{t("driver.voice.cancel")}</Button>
        </>
      )}
      {vm.phase === "blocked" && (
        <p className={s.banner} role="alert">
          {vm.why === "denied" ? t("driver.voice.denied") : vm.why === "sampleFailed" ? t("driver.voice.sampleFailed") : t("driver.voice.unavailable")}
        </p>
      )}
      {vm.savedText && <p role="status" className={s.kind}>{vm.savedText}</p>}
      {(vm.showSamples || vm.phase === "blocked") && (
        <section className={s.stack} aria-label={t("driver.voice.useSample")}>
          <h3 className={s.h2}>{t("driver.voice.useSample")}</h3>
          {vm.samples.map((id) => (
            <Button key={id} variant="secondary" size="driver" block icon={<FileAudio />} disabled={vm.phase === "saving" || recording} onClick={() => onSample(id)}>
              {t(`driver.voice.sample.${id}`)}
            </Button>
          ))}
        </section>
      )}
    </div>
  );
}
