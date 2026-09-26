import { CheckCircle2, CloudOff, RefreshCw, Clock, ToggleRight, CloudDownload } from "lucide-react";
import type { SyncTone, SyncVm } from "../model";
import s from "../driver.module.css";

const ICON: Record<SyncTone, typeof CheckCircle2> = {
  ok: CheckCircle2,
  offline: CloudOff,
  busy: RefreshCw,
  retry: Clock,
  forced: ToggleRight,
  never: CloudDownload,
};
const CLS: Partial<Record<SyncTone, string>> = { ok: s.syncOk, offline: s.syncOffline, forced: s.syncOffline, retry: s.syncInfo };

/** The sync bar on every driver screen. Words + icon; tap opens the details. */
export function SyncStatusView({ vm, onOpen }: { vm: SyncVm; onOpen: () => void }) {
  const Icon = ICON[vm.tone];
  return (
    <button type="button" className={`${s.syncBar} ${CLS[vm.tone] ?? ""}`} onClick={onOpen} aria-haspopup="dialog" data-testid="sync-status">
      <Icon aria-hidden="true" />
      <span>{vm.text}</span>
    </button>
  );
}
