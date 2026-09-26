import type { ReactNode } from "react";
import { CheckCircle2, Minus, Plus, Ban } from "lucide-react";
import { FAIL_REASONS, type FailReason } from "../../../../../shared/types";
import { Button, Chip } from "../../../ui";
import { t } from "../../../i18n";
import s from "../driver.module.css";

export interface StopVm {
  litres: number;
  fullTankLitres: number;
  reason: FailReason | null;
  voiceAttached: boolean;
}

/** Body of the stop sheet. Two big actions: Delivered (litres pre-filled, steppers, Full tank) and Couldn't deliver (reason chips). */
export function StopSheetView({ vm, recorder, onLitres, onDelivered, onReason, onFailed }: {
  vm: StopVm;
  recorder: ReactNode;
  onLitres: (litres: number) => void;
  onDelivered: () => void;
  onReason: (r: FailReason) => void;
  onFailed: () => void;
}) {
  return (
    <>
      <section className={s.stack} aria-labelledby="stop-litres">
        <h3 id="stop-litres" className={s.h2}>{t("driver.stop.litres")}</h3>
        <div className={s.stepper}>
          <button type="button" className={s.stepBtn} aria-label={t("driver.stop.minus")} onClick={() => onLitres(Math.max(0, vm.litres - 100))}>
            <Minus aria-hidden="true" /> 100
          </button>
          <output className={s.litres} aria-live="polite">{vm.litres.toLocaleString("en-CA")} L</output>
          <button type="button" className={s.stepBtn} aria-label={t("driver.stop.plus")} onClick={() => onLitres(Math.min(20000, vm.litres + 100))}>
            <Plus aria-hidden="true" /> 100
          </button>
        </div>
        <Chip selected={vm.litres === vm.fullTankLitres} onClick={() => onLitres(vm.fullTankLitres)}>
          {t("driver.stop.fullTank", { litres: vm.fullTankLitres.toLocaleString("en-CA") })}
        </Chip>
        <Button size="hero" block icon={<CheckCircle2 />} onClick={onDelivered}>
          {t("driver.stop.delivered", { litres: vm.litres.toLocaleString("en-CA") })}
        </Button>
      </section>
      <section className={s.stack} aria-labelledby="stop-failed">
        <h3 id="stop-failed" className={s.h2}>{t("driver.stop.failedTitle")}</h3>
        <div className={s.chips} role="group" aria-label={t("driver.stop.pickReason")}>
          {FAIL_REASONS.map((r) => (
            <Chip key={r} selected={vm.reason === r} onClick={() => onReason(r)}>{t(`common.reason.${r}`)}</Chip>
          ))}
        </div>
        <details>
          <summary className={s.linkBtn}>{vm.voiceAttached ? t("driver.voice.attached") : t("driver.stop.voice")}</summary>
          {recorder}
        </details>
        <Button size="hero" variant="danger" block icon={<Ban />} onClick={onFailed} disabled={!vm.reason}>
          {vm.reason ? `${t("common.outcome.failed")} · ${t(`common.reason.${vm.reason}`)}` : t("driver.stop.pickReason")}
        </Button>
      </section>
    </>
  );
}
