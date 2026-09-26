import { RefreshCw } from "lucide-react";
import { Button } from "../../../ui";
import { t } from "../../../i18n";
import s from "../driver.module.css";

export interface SyncDetailsVm {
  statusText: string;
  waiting: { id: string; label: string }[];
  notesWaiting: number;
  rejected: { id: string; label: string; error: string }[];
  forcedOffline: boolean;
  syncing: boolean;
}

export function SyncDetailsView({ vm, onSyncNow, onToggleForced, onDismiss }: {
  vm: SyncDetailsVm;
  onSyncNow: () => void;
  onToggleForced: (on: boolean) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className={s.stack}>
      <p className={s.h2}>{vm.statusText}</p>
      <Button size="driver" block icon={<RefreshCw />} onClick={onSyncNow} disabled={vm.syncing || vm.forcedOffline}>
        {t("driver.sync.syncNow")}
      </Button>
      <h3 className={s.h2}>{t("driver.sync.waitingList")}</h3>
      {vm.waiting.length === 0 && vm.notesWaiting === 0 ? (
        <p>{t("driver.sync.nothingWaiting")}</p>
      ) : (
        <ul>
          {vm.waiting.map((w) => <li key={w.id}>{w.label}</li>)}
          {vm.notesWaiting > 0 && <li>{t("driver.sync.notesWaiting", { count: vm.notesWaiting })}</li>}
        </ul>
      )}
      {vm.rejected.length > 0 && (
        <section className={s.stack} aria-labelledby="rej-h">
          <h3 id="rej-h" className={s.h2}>{t("driver.sync.rejectedTitle")}</h3>
          <p className={s.muted}>{t("driver.sync.rejectedHelp")}</p>
          <ul className={s.list}>
            {vm.rejected.map((r) => (
              <li key={r.id} className={s.noteRow}>
                <span>{r.label}<br /><span className={s.muted}>{r.error}</span></span>
                <Button variant="secondary" onClick={() => onDismiss(r.id)}>{t("driver.sync.dismiss")}</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <label className={s.toggle}>
        <input type="checkbox" checked={vm.forcedOffline} onChange={(e) => onToggleForced(e.target.checked)} />
        {t("driver.sync.forceToggle")}
      </label>
      <p className={s.muted}>{t("driver.sync.forceHelp")}</p>
    </div>
  );
}
