import { Droplet, Droplets, AlertTriangle, Waves, X, Check, Truck, Lightbulb } from "lucide-react";
import { Button, StatusBadge } from "../../ui";
import { PhoneHeader } from "../shared/SiteHeader";
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

/** Reference order: water soon, out, emergency, sewage. */
const KINDS: RequestKind[] = ["soon", "out", "emergency", "sewage"];

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
        <PhoneHeader role={t("header.resident")} />
        <p className="muted">{t("resident.loading")}</p>
      </main>
    );
  }

  if (status === "unknown") {
    return (
      <main className={s.page}>
        <PhoneHeader role={t("header.resident")} />
        <div className={s.heading}>
          <h1>{t("resident.unknown.title")}</h1>
          <p className="muted">{t("resident.unknown.body")}</p>
        </div>
        <KeepLight />
      </main>
    );
  }

  if (status === "error" || !view) {
    return (
      <main className={s.page}>
        <PhoneHeader role={t("header.resident")} />
        <div className={s.heading}>
          <h1>{t("resident.error.title")}</h1>
        </div>
        <Button size="driver" block onClick={onRetry}>
          {t("resident.error.retry")}
        </Button>
        <KeepLight />
      </main>
    );
  }

  const requestLabel = (k: RequestKind) => t(`common.request.${k}`);
  const trackOf = (k: RequestKind): ResidentTrack => (k === "sewage" ? "sewage" : "water");
  const anyOpen = !!(view.water || view.sewage);
  const closed = view.lastClosed && view.serverTime - view.lastClosed.at < RECENTLY_CLOSED_MS ? view.lastClosed : null;

  return (
    <main className={s.page}>
      <PhoneHeader role={t("header.resident")} />

      <div className={s.heading}>
        <span className="eyebrow">{view.village.name}</span>
        <h1>{view.house.label}</h1>
      </div>

      <div aria-live="polite" className="visually-hidden">
        {sendingTrack ? t("resident.sending") : ""}
        {sendError ? t("resident.sendFailed.title") : ""}
      </div>

      {closed && !anyOpen && (
        <p className={s.closedLine} role="status">
          <span aria-hidden="true">{closed.status === "served" ? <Check /> : <X />}</span>
          <span>
            {closed.status === "served"
              ? t("resident.lastClosed.served", { time: formatTime(closed.at) })
              : t("resident.lastClosed.cancelled", { time: formatTime(closed.at) })}
          </span>
        </p>
      )}

      {view.water && (
        <OpenRequestCard
          req={view.water}
          sending={sendingTrack === "water"}
          error={sendError === "water"}
          onCancel={() => onCancelRequest(view.water!.id, "water")}
        />
      )}
      {view.sewage && (
        <OpenRequestCard
          req={view.sewage}
          sending={sendingTrack === "sewage"}
          error={sendError === "sewage"}
          onCancel={() => onCancelRequest(view.sewage!.id, "sewage")}
        />
      )}

      {(sendError === "water" || sendError === "sewage") && (
        <div role="alert" className={s.failNotice}>
          <strong>{t("resident.sendFailed.title")}</strong>
          <p>{t("resident.sendFailed.body")}</p>
          <Button variant="secondary" size="driver" block onClick={onRetry}>
            {t("resident.retry")}
          </Button>
        </div>
      )}

      <section className={s.stack} aria-labelledby="need-heading">
        <h2 id="need-heading">{anyOpen ? t("resident.changeHeading") : t("resident.heading")}</h2>
        {!anyOpen && <p className="muted">{t("resident.requestHint")}</p>}
        <div className={s.requestButtons}>
          {KINDS.map((k) => {
            const open = k === "sewage" ? view.sewage : view.water;
            const active = open?.kind === k;
            const busy = sendingTrack === trackOf(k);
            return (
              <button
                key={k}
                type="button"
                className={[s.requestAction, k === "emergency" ? s.emergency : "", active ? s.active : ""].join(" ")}
                disabled={active || busy}
                aria-describedby={`hint-${k}`}
                onClick={() => onRequestKind(k)}
              >
                <span className={s.requestIcon} aria-hidden="true">
                  {KIND_ICON[k]}
                </span>
                <span className={s.requestText}>
                  <strong>{requestLabel(k)}</strong>
                  <small id={`hint-${k}`}>
                    {active ? (
                      <span className={s.requested}>
                        <Check aria-hidden="true" /> {t("resident.alreadyRequested")}
                      </span>
                    ) : (
                      t(`resident.hint.${k}`)
                    )}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={s.phoneStatus}>
        <div className={s.statusLine}>
          <Truck aria-hidden="true" />
          <strong>{t("resident.trucks.water", { up: view.trucksRunning.water.up, total: view.trucksRunning.water.total })}</strong>
        </div>
        <p>
          {view.lastDelivery.water != null
            ? t("resident.lastDelivery.water", { when: `${formatDay(view.lastDelivery.water)} ${formatTime(view.lastDelivery.water)}` })
            : t("resident.noDelivery.water")}
        </p>
        <div className={s.statusLine}>
          <Waves aria-hidden="true" />
          <strong>{t("resident.trucks.sewage", { up: view.trucksRunning.sewage.up, total: view.trucksRunning.sewage.total })}</strong>
        </div>
        <p>
          {view.lastDelivery.sewage != null
            ? t("resident.lastDelivery.sewage", { when: `${formatDay(view.lastDelivery.sewage)} ${formatTime(view.lastDelivery.sewage)}` })
            : t("resident.noDelivery.sewage")}
        </p>
      </section>

      <KeepLight />

      <details className={s.details}>
        <summary>{t("resident.contact.summary")}</summary>
        <p>{view.village.emergencyContact}</p>
      </details>

      {showAddHome && (
        <div role="note" className={s.panel}>
          <strong>{t("resident.addHome.title")}</strong>
          <p>{t("resident.addHome.body")}</p>
          <Button variant="secondary" size="driver" block onClick={onDismissAddHome}>
            {t("resident.addHome.dismiss")}
          </Button>
        </div>
      )}

      {pending && (
        <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className={s.dialogCard}>
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
          </div>
        </div>
      )}
    </main>
  );
}

/** The door-light fallback: every resident failure path ends with this. */
function KeepLight() {
  return (
    <div className={s.keepLight}>
      <div className={s.statusLine}>
        <Lightbulb aria-hidden="true" />
        <strong>{t("resident.keepLight.title")}</strong>
      </div>
      <p className="muted">{t("resident.keepLight.body")}</p>
    </div>
  );
}

function OpenRequestCard({
  req,
  sending,
  error,
  onCancel,
}: {
  req: NonNullable<ResidentViewModel["water"]>;
  sending: boolean;
  error: boolean;
  onCancel: () => void;
}) {
  return (
    <section className={s.received} role="status">
      <div className={s.receivedHead}>
        <Check aria-hidden="true" />
        <h2>{t("resident.receivedTitle")}</h2>
      </div>
      <span>
        <StatusBadge tone={req.kind === "emergency" ? "emergency" : "info"} icon={KIND_ICON[req.kind]}>
          {t(`common.request.${req.kind}`)}
        </StatusBadge>
      </span>
      <p>{t("resident.receivedAt", { time: formatTime(req.createdAt) })}</p>
      {req.lastAttempt && (
        <p>{t("resident.lastAttempt", { time: formatTime(req.lastAttempt.at), reason: t(`common.reason.${req.lastAttempt.reason}`) })}</p>
      )}
      <strong>{aheadPhrase(req.aheadCount)}</strong>
      <Button variant="secondary" size="driver" block onClick={onCancel} disabled={sending}>
        {sending ? t("resident.cancelling") : t("resident.cancelRequest")}
      </Button>
      {error && <p role="alert">{t("resident.sendFailed.title")}</p>}
    </section>
  );
}
