import { CloudUpload, Smartphone, Ban, CheckCircle2, CircleX } from "lucide-react";
import { Button } from "../../../ui";
import { t } from "../../../i18n";
import s from "../driver.module.css";

export interface DoneItemVm {
  id: string;
  houseLabel: string;
  text: string;
  delivered: boolean;
  synced: boolean;
  voided: boolean;
}

export function DoneView({ items, onVoid }: { items: DoneItemVm[]; onVoid: (id: string) => void }) {
  return (
    <div className={s.stack}>
      <h1 className={s.h1}>{t("driver.done.title")}</h1>
      {items.length === 0 ? <p>{t("driver.done.empty")}</p> : <p className={s.muted}>{t("driver.done.fixHint")}</p>}
      <ul className={s.list}>
        {items.map((d) => (
          <li key={d.id} className={s.noteRow}>
            <span className={s.stack} style={{ gap: 0 }}>
              <span className={s.reqHouse}>{d.houseLabel}</span>
              <span className={s.kind}>{d.delivered ? <CheckCircle2 aria-hidden="true" /> : <CircleX aria-hidden="true" />} {d.text}</span>
              <span className={s.kind}>
                {d.voided ? (
                  <><Ban aria-hidden="true" /> {t("driver.done.voided")}</>
                ) : d.synced ? (
                  <><CloudUpload aria-hidden="true" /> {t("driver.done.uploaded")}</>
                ) : (
                  <><Smartphone aria-hidden="true" /> {t("driver.done.savedOnPhone")}</>
                )}
              </span>
            </span>
            {!d.voided && (
              <Button variant="secondary" aria-label={t("driver.done.voidLabel", { house: d.houseLabel })} onClick={() => onVoid(d.id)}>
                {t("driver.done.void")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
