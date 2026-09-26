import { AlertTriangle, Droplet, DropletOff, Siren, Toilet, History } from "lucide-react";
import type { RequestKind } from "../../../../../shared/types";
import { t } from "../../../i18n";
import type { ListVm } from "../model";
import s from "../driver.module.css";

export function KindIcon({ kind }: { kind: RequestKind }) {
  const I = kind === "emergency" ? Siren : kind === "out" ? DropletOff : kind === "sewage" ? Toilet : Droplet;
  return <I aria-hidden="true" />;
}

export function ListView({ vm, onOpenStop }: { vm: ListVm; onOpenStop: (requestId: string) => void }) {
  return (
    <div className={s.stack}>
      <h1 className={s.srOnly}>{t("driver.list.title", { truck: vm.truckLabel })}</h1>
      <section className={s.summary} aria-label={t("driver.list.title", { truck: vm.truckLabel })} data-testid="summary">
        <p className={s.muted}>{t("driver.list.title", { truck: vm.truckLabel })}</p>
        <p className={s.summaryBig}>
          {vm.summaryText} · {vm.loadsText}
        </p>
        <div className={s.summaryCounts}>
          <span>{vm.stopsText}</span>
          {vm.counts.map((c) => (
            <span key={c.kind} className={`${s.kind} ${c.kind === "emergency" ? s.kindEmergency : ""}`}>
              <KindIcon kind={c.kind} /> {c.count} {c.text}
            </span>
          ))}
        </div>
      </section>
      {vm.truckDown && (
        <p className={s.banner}><AlertTriangle aria-hidden="true" /> {t("driver.list.truckDown", { truck: vm.truckLabel })}</p>
      )}
      {vm.rows.length === 0 ? (
        <p className={s.h2}>{t("driver.list.empty")}</p>
      ) : (
        <ol className={s.list} data-testid="stop-list">
          {vm.rows.map((r) => (
            <li key={r.id}>
              <button type="button" className={s.reqBtn} onClick={() => onOpenStop(r.id)} aria-haspopup="dialog" data-request-id={r.id}>
                <span className={s.reqHouse}>{r.houseLabel}</span>
                <span className={s.reqLitres}>{r.litresText}</span>
                <span className={s.reqMeta}>
                  <span className={`${s.kind} ${r.kind === "emergency" ? s.kindEmergency : ""}`}><KindIcon kind={r.kind} /> {r.kindText}</span>
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
    </div>
  );
}
