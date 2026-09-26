import type { ReactNode } from "react";
import { AlertTriangle, Droplet, DropletOff, Siren, Toilet, History, ChevronRight } from "lucide-react";
import type { RequestKind } from "../../../../../shared/types";
import { t } from "../../../i18n";
import type { ListVm } from "../model";
import s from "../driver.module.css";

export function KindIcon({ kind }: { kind: RequestKind }) {
  const I = kind === "emergency" ? Siren : kind === "out" ? DropletOff : kind === "sewage" ? Toilet : Droplet;
  return <I aria-hidden="true" />;
}

/** Today's list: heading + truck link, the load summary (most prominent), tools, then the delivery queue. */
export function ListView({ vm, onOpenStop, tools, truckLink }: { vm: ListVm; onOpenStop: (requestId: string) => void; tools?: ReactNode; truckLink?: ReactNode }) {
  return (
    <>
      <div className={s.row} style={{ justifyContent: "space-between" }}>
        <h1 className={s.h1}>{t("driver.list.heading")}</h1>
        {truckLink}
      </div>
      {vm.truckDown && (
        <p className={s.banner}><AlertTriangle aria-hidden="true" /> {t("driver.list.truckDown", { truck: vm.truckLabel })}</p>
      )}
      <section className={s.loadSummary} aria-label={t("driver.list.title", { truck: vm.truckLabel })} data-testid="summary">
        <span className="eyebrow">{t("driver.list.loadFirst")}</span>
        <div className={s.loadBig}>
          <strong>{vm.litresNumber}</strong>
          <span>{t("driver.list.litresNeeded")}</span>
        </div>
        <p>
          {vm.loadsLongText} · {vm.stopsText}
        </p>
      </section>
      {tools}
      <section className={s.stack} aria-labelledby="queue-h">
        <div className={s.queueHead}>
          <h2 id="queue-h" className={s.h2}>{t("driver.list.queue")}</h2>
          <p>{t("driver.list.priority")}</p>
          <div className={s.chips}>
            {vm.counts
              .filter((c) => c.count > 0)
              .map((c) => (
                <span key={c.kind} className={`${s.tag} ${c.kind === "emergency" ? s.tagEmergency : ""}`}>
                  <KindIcon kind={c.kind} /> {c.count} · {c.text}
                </span>
              ))}
          </div>
        </div>
        {vm.rows.length === 0 ? (
          <p className={s.emptyBox}>{t("driver.list.empty")}</p>
        ) : (
          <ol className={s.list} data-testid="stop-list">
            {vm.rows.map((r) => (
              <li key={r.id}>
                <button type="button" className={`${s.reqBtn} ${r.kind === "emergency" ? s.reqUrgent : ""}`} onClick={() => onOpenStop(r.id)} aria-haspopup="dialog" data-request-id={r.id}>
                  <span className={s.reqHouse}>{r.houseLabel}</span>
                  <span className={s.reqLitres}>
                    {r.litresText} <ChevronRight aria-hidden="true" size="1em" style={{ verticalAlign: "-0.125em" }} />
                  </span>
                  <span className={s.reqMeta}>
                    <span className={`${s.tag} ${r.kind === "emergency" ? s.tagEmergency : ""}`}><KindIcon kind={r.kind} /> {r.kindText}</span>
                    <span>{r.waitingText}</span>
                    <span>{r.sourceText}</span>
                  </span>
                  {r.attemptsText.map((a, i) => (
                    <span key={i} className={s.attempt}><History aria-hidden="true" size="1em" /> {a}</span>
                  ))}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
