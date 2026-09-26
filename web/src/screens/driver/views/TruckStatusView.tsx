import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Wrench } from "lucide-react";
import { TRUCK_CATEGORIES, type TruckCategory } from "../../../../../shared/types";
import { Button, Chip } from "../../../ui";
import { t } from "../../../i18n";
import s from "../driver.module.css";

export interface TruckStatusVm {
  truckLabel: string;
  down: boolean;
  statusText: string;
  historyText: string | null;
  reason: TruckCategory | null;
  voiceAttached: boolean;
}

export function TruckStatusView({ vm, recorder, onReason, onDown, onBack, onRecheck }: {
  vm: TruckStatusVm;
  recorder: ReactNode;
  onReason: (r: TruckCategory) => void;
  onDown: () => void;
  onBack: () => void;
  onRecheck: () => void;
}) {
  return (
    <div className={s.stack}>
      <h1 className={s.h1}>{t("driver.truck.title", { truck: vm.truckLabel })}</h1>
      <p className={`${s.kind} ${s.h2}`}>
        {vm.down ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />} {vm.statusText}
      </p>
      {vm.historyText && <p className={s.muted}>{vm.historyText}</p>}
      {vm.down ? (
        <Button size="hero" block icon={<CircleCheck />} onClick={onBack}>{t("driver.truck.markBack", { truck: vm.truckLabel })}</Button>
      ) : (
        <>
          <h2 className={s.h2}>{t("driver.truck.downReason")}</h2>
          <div className={s.chips} role="group" aria-label={t("driver.truck.downReason")}>
            {TRUCK_CATEGORIES.map((c) => (
              <Chip key={c} selected={vm.reason === c} onClick={() => onReason(c)}>{t(`common.category.${c}`)}</Chip>
            ))}
          </div>
          <details>
            <summary className={s.linkBtn}>{vm.voiceAttached ? t("driver.voice.attached") : t("driver.truck.voice")}</summary>
            {recorder}
          </details>
          <Button size="hero" variant="danger" block icon={<CircleAlert />} disabled={!vm.reason} onClick={onDown}>
            {t("driver.truck.markDown", { truck: vm.truckLabel })}
          </Button>
        </>
      )}
      <Button size="driver" variant="secondary" block icon={<Wrench />} onClick={onRecheck}>{t("driver.truck.recheck")}</Button>
    </div>
  );
}
