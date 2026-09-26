import { Truck as TruckIcon, CircleCheck, CircleAlert } from "lucide-react";
import { t } from "../../../i18n";
import s from "../driver.module.css";

export interface TruckCardVm {
  id: string;
  label: string;
  kindText: string;
  up: boolean;
  statusText: string;
  selected: boolean;
}

export function TruckPickerView({ trucks, initials, onPick, onInitials }: {
  trucks: TruckCardVm[];
  initials: string;
  onPick: (id: string) => void;
  onInitials: (v: string) => void;
}) {
  return (
    <div className={s.stack}>
      <div className={s.heading}>
        <h1 className={s.h1}>{t("driver.pick.heading")}</h1>
        <p className={s.muted}>{t("driver.pick.help")}</p>
      </div>
      {trucks.length === 0 && <p>{t("driver.pick.noTrucks")}</p>}
      <ul className={s.list}>
        {trucks.map((tr) => (
          <li key={tr.id}>
            <button type="button" className={`${s.cardBtn} ${tr.selected ? s.cardBtnSelected : ""}`} onClick={() => onPick(tr.id)} aria-current={tr.selected || undefined}>
              <span className={s.cardTitle}><TruckIcon aria-hidden="true" /> {tr.label} · {tr.kindText}</span>
              <span className={`${s.tag} ${tr.up ? s.statusOk : s.statusDown}`}>
                {tr.up ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />} {tr.statusText}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <label className={s.stack}>
        <span>{t("driver.pick.initials")}</span>
        <input className={s.input} value={initials} maxLength={4} autoComplete="off" onChange={(e) => onInitials(e.target.value.toUpperCase())} />
      </label>
    </div>
  );
}
