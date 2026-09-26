import { Droplet, Droplets, AlertTriangle, Waves, X } from "lucide-react";
import { Button, Card, StatusBadge } from "../../ui";
import { t, formatTime, formatDay } from "../../i18n";
import s from "./Resident.module.css";
import type { ResidentView as ResidentViewModel, RequestKind } from "../../../../shared/types";
import type { PendingConfirm, ResidentTrack } from "../../data/resident";

/** "Delivered 14:20" shows for this long; after that the last-delivery line says it with the day. */
const RECENTLY_CLOSED_MS = 6 * 60 * 60 * 1000;

const KIND_ICON: Record<RequestKind, React.ReactNode> = {
  soon: <Droplet />,
  out: <Droplets />,
  emergency: <AlertTriangle />,
  sewage: <Waves />,
};

function aheadPhrase(aheadCount: number): string {
  if (aheadCount <= 0) return t("resident.ahead.front");
  if (aheadCount <= 3) return t("resident.ahead.near");
  return t("resident.ahead.count", { count: aheadCount });
}

export interface ResidentViewProps {
  status: "loading" | "unknown" | "error" | "ready";
  view: ResidentViewModel | null;
  sendingTrack: ResidentTrack | null;
  sendError: ResidentTrack | null;
  pending: PendingConfirm;
  showAddHome: boolean;
  onRequestKind: (kind: RequestKind) => void;
  onConfirmPending: () => void;
  onCancelPendingConfirm: () => void;
  onCancelRequest: (id: string, track: ResidentTrack) => void;
  onRetry: () => void;
  onDismissAddHome: () => void;
}

export default function ResidentView(props: ResidentViewProps) {
  const { status, view, sendingTrack, sendError, pending, showAddHome, onRequestKind, onConfirmPending, onCancelPendingConfirm, onCancelRequest, onRetry, onDismissAddHome } = props;

  if (status === "loading") {
    return (
      <main className={s.page} aria-busy="true">
        <p>{t("resident.loading")}</p>
      </main>
    );
  }

  if (status === "unknown") {
    return (
      <main className={s.page}>
        <h1>{t("resident.unknown.title")}</h1>
        <p>{t("resident.unknown.body")}</p>
      </main>
    );
  }

  if (status === "error" || !view) {
    return (
      <main className={s.page}>
        <h1>{t("resident.error.title")}</h1>
        <Button onClick={onRetry}>{t("resident.error.retry")}</Button>
      </main>
    );
  }

  const requestLabel = (k: RequestKind) => t(`common.request.${k}`);

  return (
    <main className={s.page}>
      <header className={s.header}>
        <h1>{view.house.label}</h1>
        <p className={s.village}>{view.village.name}</p>
      </header>

      <div aria-live="polite" className="visually-hidden">
        {sendingTrack ? t("resident.sending") : ""}
        {sendError ? t("resident.sendFailed.title") : ""}
      </div>

      {view.lastClosed && view.serverTime - view.lastClosed.at < RECENTLY_CLOSED_MS && (
        <Card className={s.openCard} role="status">
          {view.lastClosed.status === "served"
            ? t("resident.lastClosed.served", { time: formatTime(view.lastClosed.at) })
            : t("resident.lastClosed.cancelled", { time: formatTime(view.lastClosed.at) })}
        </Card>
      )}

      <section className={s.section} aria-labelledby="water-heading">
        <h2 id="water-heading">{t("resident.waterHeading")}</h2>
        {view.water ? (
          <OpenRequestCard
            req={view.water}
            track="water"
            sending={sendingTrack === "water"}
            error={sendError === "water"}
            onCancel={() => onCancelRequest(view.water!.id, "water")}
          />
        ) : (
          <div className={s.grid}>
            {(["soon", "out", "emergency"] as RequestKind[]).map((k) => (
              <Button
                key={k}
                size="hero"
                block
                className={`${s.tile} ${k === "emergency" ? s.emergency : ""}`}
                icon={KIND_ICON[k]}
                variant={k === "emergency" ? "danger" : "primary"}
                onClick={() => onRequestKind(k)}
              >
                {requestLabel(k)}
              </Button>
            ))}
          </div>
        )}
        <p>{t("resident.trucks.water", { up: view.trucksRunning.water.up, total: view.trucksRunning.water.total })}</p>
        {view.lastDelivery.water != null && (
          <p>{t("resident.lastDelivery.water", { when: `${formatDay(view.lastDelivery.water)} ${formatTime(view.lastDelivery.water)}` })}</p>
        )}
      </section>

      <section className={s.section} aria-labelledby="sewage-heading">
        <h2 id="sewage-heading">{t("resident.sewageHeading")}</h2>
        {view.sewage ? (
          <OpenRequestCard
            req={view.sewage}
            track="sewage"
            sending={sendingTrack === "sewage"}
            error={sendError === "sewage"}
            onCancel={() => onCancelRequest(view.sewage!.id, "sewage")}
          />
        ) : (
          <div className={s.grid}>
            <Button size="hero" block icon={KIND_ICON.sewage} variant="primary" className={s.tile} onClick={() => onRequestKind("sewage")}>
              {requestLabel("sewage")}
            </Button>
          </div>
        )}
        <p>{t("resident.trucks.sewage", { up: view.trucksRunning.sewage.up, total: view.trucksRunning.sewage.total })}</p>
        {view.lastDelivery.sewage != null && (
          <p>{t("resident.lastDelivery.sewage", { when: `${formatDay(view.lastDelivery.sewage)} ${formatTime(view.lastDelivery.sewage)}` })}</p>
        )}
      </section>

      {(sendError === "water" || sendError === "sewage") && (
        <Card role="alert" className={s.emergencyBanner}>
          <p>{t("resident.sendFailed.title")}</p>
          <p>{t("resident.sendFailed.body")}</p>
          <Button variant="secondary" onClick={onRetry}>
            {t("resident.retry")}
          </Button>
        </Card>
      )}

      <Card>
        <h2>{t("resident.emergencyContact.heading")}</h2>
        <p>{view.village.emergencyContact}</p>
      </Card>

      {showAddHome && (
        <Card role="note" style={{ marginTop: "1rem" }}>
          <p>
            <strong>{t("resident.addHome.title")}</strong>
          </p>
          <p>{t("resident.addHome.body")}</p>
          <Button variant="secondary" onClick={onDismissAddHome}>
            {t("resident.addHome.dismiss")}
          </Button>
        </Card>
      )}

      {pending && (
        <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <Card className={s.dialogCard}>
            <h2 id="confirm-title">
              {pending.mode === "emergency"
                ? t("resident.emergency.confirmTitle")
                : t("resident.change.title", { label: requestLabel(pending.kind) })}
            </h2>
            {pending.mode === "emergency" && <p>{t("resident.emergency.confirmBody")}</p>}
            <div className={s.dialogActions}>
              <Button variant="danger" size="driver" onClick={onConfirmPending}>
                {pending.mode === "emergency" ? t("resident.emergency.confirmYes") : t("resident.change.yes")}
              </Button>
              <Button variant="secondary" size="driver" icon={<X />} onClick={onCancelPendingConfirm}>
                {t("resident.confirm.cancel")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

function OpenRequestCard({
  req,
  track,
  sending,
  error,
  onCancel,
}: {
  req: NonNullable<ResidentViewModel["water"]>;
  track: ResidentTrack;
  sending: boolean;
  error: boolean;
  onCancel: () => void;
}) {
  return (
    <Card className="resident-open-card" role="status">
      <StatusBadge tone={req.kind === "emergency" ? "emergency" : "info"} icon={KIND_ICON[req.kind]}>
        {t(`common.request.${req.kind}`)}
      </StatusBadge>
      <p>{t("resident.received", { time: formatTime(req.createdAt), label: t(`common.request.${req.kind}`) })}</p>
      <p>{aheadPhrase(req.aheadCount)}</p>
      {req.lastAttempt && (
        <p>{t("resident.lastAttempt", { time: formatTime(req.lastAttempt.at), reason: t(`common.reason.${req.lastAttempt.reason}`) })}</p>
      )}
      <Button variant="secondary" onClick={onCancel} disabled={sending}>
        {sending ? t("resident.cancelling") : t("resident.cancelRequest")}
      </Button>
      {error && <p role="alert">{t("resident.sendFailed.title")}</p>}
    </Card>
  );
}
