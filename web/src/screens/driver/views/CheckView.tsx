import { Check, X, CheckCheck } from "lucide-react";
import type { CheckItem } from "../../../../../shared/types";
import { Button } from "../../../ui";
import { t } from "../../../i18n";
import s from "../driver.module.css";
import type { ReactNode } from "react";

export interface CheckVm {
  truckLabel: string;
  items: { item: CheckItem; ok: boolean }[];
  anyProblem: boolean;
  confirming: boolean;
}

export function CheckView({ vm, recorder, onAllOk, onToggle, onSave, onConfirmDown, onCancelConfirm, onLater }: {
  vm: CheckVm;
  recorder: ReactNode;
  onAllOk: () => void;
  onToggle: (item: CheckItem, ok: boolean) => void;
  onSave: () => void;
  onConfirmDown: () => void;
  onCancelConfirm: () => void;
  onLater: () => void;
}) {
  if (vm.confirming) {
    return (
      <div className={s.stack} role="alertdialog" aria-labelledby="confirm-down">
        <h1 id="confirm-down" className={s.h1}>{t("driver.check.confirmDown", { truck: vm.truckLabel })}</h1>
        <ul>
          {vm.items.filter((i) => !i.ok).map((i) => (
            <li key={i.item}>{t(`driver.check.item.${i.item}`)} · {t("driver.check.problem")}</li>
          ))}
        </ul>
        <Button size="hero" variant="danger" block onClick={onConfirmDown} autoFocus>
          {t("driver.check.confirmDownYes", { truck: vm.truckLabel })}
        </Button>
        <Button size="driver" variant="secondary" block onClick={onCancelConfirm}>{t("driver.back")}</Button>
      </div>
    );
  }
  return (
    <div className={s.stack}>
      <div className={s.heading}>
        <span className="eyebrow">{vm.truckLabel}</span>
        <h1 className={s.h1}>{t("driver.check.heading")}</h1>
      </div>
      <Button size="hero" block icon={<CheckCheck />} onClick={onAllOk} disabled={vm.anyProblem}>{t("driver.check.allOk")}</Button>
      <p>{t("driver.check.orMark")}</p>
      <ul className={s.checkList}>
        {vm.items.map(({ item, ok }) => (
          <li key={item} className={s.checkItem}>
            <span className={s.checkName}>{t(`driver.check.item.${item}`)}</span>
            <span className={s.chips} role="group" aria-label={t(`driver.check.item.${item}`)}>
              <Button variant="secondary" className={ok ? s.pickedOk : ""} aria-pressed={ok} icon={<Check />} onClick={() => onToggle(item, true)}>{t("driver.check.ok")}</Button>
              <Button variant="secondary" className={!ok ? s.pickedProblem : ""} aria-pressed={!ok} icon={<X />} onClick={() => onToggle(item, false)}>{t("driver.check.problem")}</Button>
            </span>
          </li>
        ))}
      </ul>
      <details>
        <summary className={s.linkBtn}>{t("driver.check.voice")}</summary>
        {recorder}
      </details>
      {vm.anyProblem && <Button size="driver" variant="danger" block onClick={onSave}>{t("driver.check.save")}</Button>}
      <button type="button" className={s.linkBtn} onClick={onLater}>{t("driver.check.later")}</button>
    </div>
  );
}
