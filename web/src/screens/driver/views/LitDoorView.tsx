import { Delete, Lightbulb } from "lucide-react";
import { Button } from "../../../ui";
import { t } from "../../../i18n";
import s from "../driver.module.css";

export interface LitDoorVm {
  digits: string;
  matchLabel: string | null;
  duplicate: boolean;
  kindText: string;
}

/** House picker without a keyboard: a big number pad. "14" + Add = three taps. */
export function LitDoorView({ vm, onDigit, onDelete, onClear, onAdd }: {
  vm: LitDoorVm;
  onDigit: (d: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onAdd: () => void;
}) {
  const msg = !vm.digits ? t("driver.lit.help") : !vm.matchLabel ? t("driver.lit.noHouse") : vm.duplicate ? t("driver.lit.duplicate", { house: vm.matchLabel }) : "";
  return (
    <div className={s.stack}>
      <h1 className={s.h1}>{t("driver.lit.title")}</h1>
      <p>{t("driver.lit.typeFollowsTruck", { kind: vm.kindText })}</p>
      <output className={s.display} aria-label={t("driver.lit.number")} aria-live="polite" data-testid="lit-display">
        {vm.digits || " "}
      </output>
      <p role="status" className={vm.duplicate ? s.banner : undefined}>{msg}</p>
      <div className={s.pad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={s.padBtn} onClick={() => onDigit(d)}>{d}</button>
        ))}
        <button type="button" className={s.padBtn} onClick={onClear} style={{ fontSize: "var(--fs-lg)" }}>{t("driver.lit.clear")}</button>
        <button type="button" className={s.padBtn} onClick={() => onDigit("0")}>0</button>
        <button type="button" className={s.padBtn} onClick={onDelete} aria-label={t("driver.lit.delete")}><Delete aria-hidden="true" /></button>
      </div>
      <Button size="hero" block icon={<Lightbulb />} disabled={!vm.matchLabel || vm.duplicate} onClick={onAdd}>
        {vm.matchLabel ? t("driver.lit.add", { house: vm.matchLabel }) : t("driver.lit.title")}
      </Button>
    </div>
  );
}
