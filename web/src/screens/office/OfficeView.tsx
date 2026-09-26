import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Play } from "lucide-react";
import { Button, Card, Stat, StatusBadge, Chip } from "../../ui";
import { VillageMap } from "../shared/VillageMap";
import { t, formatTime, formatDate, formatAge } from "../../i18n";
import s from "./Office.module.css";
import {
  LOG_TYPES,
  TRUCK_CATEGORIES,
  SEVERITIES,
  REQUEST_KINDS,
  type Snapshot,
  type RequestKind,
  type LogFields,
  type VoiceNoteInfo,
  type FeedItem,
  type Flag,
} from "../../../../shared/types";
import type { useDeliveryLookup, useWeekly } from "../../data/office";

export interface OfficeViewProps {
  status: "loading" | "error" | "ready";
  snapshot: Snapshot | null;
  newFlagIds: Set<string>;
  announcement: string;
  villageId: string;
  onAddRequest: (houseId: string, kind: RequestKind) => Promise<void>;
  onCancelRequest: (id: string) => Promise<void>;
  onConfirmLog: (voiceNoteId: string | null, fields: LogFields) => Promise<void>;
  onReset: () => void;
  resetting: boolean;
  onRetry: () => void;
  lookup: ReturnType<typeof useDeliveryLookup>;
  weekly: ReturnType<typeof useWeekly>;
}

export default function OfficeView(props: OfficeViewProps) {
  const { status, snapshot, newFlagIds, announcement, villageId, onAddRequest, onCancelRequest, onConfirmLog, onReset, resetting, onRetry, lookup, weekly } = props;

  if (status === "error" && !snapshot) {
    return (
      <main className={s.page}>
        <p>{t("office.error")}</p>
        <Button onClick={onRetry}>{t("office.retry")}</Button>
      </main>
    );
  }
  if (status === "loading" || !snapshot) {
    return (
      <main className={s.page} aria-busy="true">
        <p>{t("office.loading")}</p>
      </main>
    );
  }

  const tooLongCount = snapshot.counts.waitingTooLong.length;

  return (
    <main className={s.page}>
      <div aria-live="assertive" className="visually-hidden">
        {announcement}
      </div>
      <header className={s.header}>
        <div>
          <h1>{t("office.title")} · {snapshot.village.name}</h1>
          <p>{formatDate(snapshot.serverTime)} · {t("office.updated", { time: formatTime(snapshot.serverTime) })}</p>
        </div>
        <div className={s.headerLinks}>
          <a href={`/api/v/${villageId}/deliveries?from=0&to=${snapshot.serverTime}&format=csv`}>{t("office.exportDeliveries")}</a>
          <a href={weekly.csvUrl}>{t("office.exportWeekly")}</a>
          <Button variant="secondary" onClick={onReset} disabled={resetting}>
            {resetting ? t("office.resetting") : t("office.reset")}
          </Button>
        </div>
      </header>

      <div className={s.grid}>
        <Card>
          <h2>{t("office.trucksHeading")}</h2>
          {snapshot.trucks.map((truck) => (
            <div key={truck.id} className={s.truckRow}>
              <div>
                <strong>{truck.label}</strong> · {t(`common.truck.${truck.kind}`)}
                <div>
                  <StatusBadge tone={truck.status === "up" ? "ok" : "danger"} icon={truck.status === "up" ? <CheckCircle2 /> : <XCircle />}>
                    {t(`common.truck.${truck.status}`)}
                  </StatusBadge>
                </div>
                {truck.status === "down" && truck.downSince != null && (
                  <p>
                    {t("office.truck.downSince", { when: `${formatDate(truck.downSince)} ${formatTime(truck.downSince)}` })}
                    {truck.downReason && <> · {t("office.truck.reason", { reason: truck.downReason })}</>}
                  </p>
                )}
                <p>
                  {truck.lastCheck ? t("office.truck.lastCheck", { time: formatTime(truck.lastCheck.at) }) : t("office.truck.noCheck")}
                </p>
                <p>
                  {truck.downHistoryDays.length > 0
                    ? t("office.truck.history", { list: truck.downHistoryDays.join(", ") })
                    : t("office.truck.historyNone")}
                </p>
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <h2>{t("office.glanceHeading")}</h2>
          {tooLongCount > 0 && (
            <p className={s.callout} role="status">
              {t("office.glance.waitingTooLong", { count: tooLongCount })}
            </p>
          )}
          <div className={s.statRow}>
            {REQUEST_KINDS.map((k) => (
              <Stat key={k} value={snapshot.counts.open[k]} label={t(`common.request.${k}`)} />
            ))}
          </div>
          <p>
            {snapshot.counts.oldestOpenAt != null
              ? t("office.glance.oldest", { age: formatAge(snapshot.serverTime - snapshot.counts.oldestOpenAt) })
              : t("office.glance.none")}
          </p>
        </Card>

        <Card className={s.wide}>
          <h2>{t("office.openHeading")}</h2>
          <AddRequestForm houses={snapshot.houses} onAdd={onAddRequest} />
          {snapshot.openRequests.length === 0 ? (
            <p>{t("office.open.empty")}</p>
          ) : (
            <ul className={s.openList}>
              {snapshot.openRequests.map((r) => (
                <li key={r.id} className={s.openRow}>
                  <strong>{r.houseLabel}</strong>
                  <StatusBadge tone={r.kind === "emergency" ? "emergency" : "info"} icon={<AlertTriangle />}>
                    {t(`common.request.${r.kind}`)}
                  </StatusBadge>
                  <span>{t("office.open.age", { age: formatAge(snapshot.serverTime - r.createdAt) })}</span>
                  <span>{t(`common.source.${r.source}`)}</span>
                  {r.attempts.length > 0 && (
                    <span>
                      {t("office.open.attempts", {
                        time: formatTime(r.attempts[r.attempts.length - 1].at),
                        reason: t(`common.reason.${r.attempts[r.attempts.length - 1].reason}`),
                      })}
                    </span>
                  )}
                  <Button variant="secondary" onClick={() => onCancelRequest(r.id)}>
                    {t("office.open.cancel")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className={s.wide}>
          <h2>{t("office.mapHeading")}</h2>
          <VillageMap
            houses={snapshot.houses}
            openRequests={snapshot.openRequests}
            waitingTooLong={snapshot.counts.waitingTooLong}
            geometry={snapshot.village.geometry}
          />
        </Card>

        <Card>
          <h2>{t("office.flagsHeading")}</h2>
          {snapshot.flags.length === 0 ? (
            <p>{t("office.flags.empty")}</p>
          ) : (
            snapshot.flags.map((flag) => <FlagCard key={flag.id} flag={flag} isNew={newFlagIds.has(flag.id)} />)
          )}
        </Card>

        <Card>
          <h2>{t("office.humanHeading")}</h2>
          {snapshot.needsHuman.length === 0 ? (
            <p>{t("office.human.empty")}</p>
          ) : (
            snapshot.needsHuman.map((note) => (
              <NeedsHumanCard key={note.id} note={note} villageId={villageId} houses={snapshot.houses} trucks={snapshot.trucks} onConfirm={onConfirmLog} />
            ))
          )}
        </Card>

        <Card className={s.wide}>
          <h2>{t("office.feedHeading")}</h2>
          {snapshot.feed.length === 0 ? (
            <p>{t("office.feed.empty")}</p>
          ) : (
            <ul className={s.feedList}>
              {snapshot.feed.map((item) => (
                <li key={item.id} className={s.feedRow}>
                  <FeedRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className={s.wide}>
          <h2>{t("office.lookupHeading")}</h2>
          <LookupPanel lookup={lookup} />
        </Card>

        <Card className={s.wide}>
          <h2>{t("office.weeklyHeading")}</h2>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{t("office.weekly.week")}</th>
                <th scope="col">{t("office.weekly.deliveries")}</th>
                <th scope="col">{t("office.weekly.couldntDeliver")}</th>
                <th scope="col">{t("office.weekly.waited24")}</th>
                <th scope="col">{t("office.weekly.truckDownDays")}</th>
              </tr>
            </thead>
            <tbody>
              {weekly.rows.map((row) => (
                <tr key={row.weekStart}>
                  <td>{formatDate(row.weekStart)}</td>
                  <td>{row.deliveries}</td>
                  <td>{row.couldntDeliver}</td>
                  <td>{row.homesWaitedOver24h}</td>
                  <td>{row.truckDownDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </main>
  );
}

function FlagCard({ flag, isNew }: { flag: Flag; isNew: boolean }) {
  return (
    <div className={`${s.flagCard} ${isNew ? s.flagNew : ""}`} role={isNew ? "status" : undefined}>
      <StatusBadge tone={isNew ? "danger" : "warn"} icon={<AlertTriangle />}>
        {t(`common.flag.${flag.kind}`)} {isNew && `· ${t("office.flags.new")}`}
      </StatusBadge>
      <p>
        <strong>{flag.subject}</strong>
      </p>
      <p>{t("office.flags.entries", { count: flag.entryIds.length })}</p>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === "stop") {
    return (
      <span>
        {formatTime(item.at)} · {item.stop.houseLabel} · {t(`common.outcome.${item.stop.outcome === "delivered" ? "delivered" : "failed"}`)}
      </span>
    );
  }
  if (item.kind === "log") {
    return (
      <span>
        {formatTime(item.at)} · {t(`common.logType.${item.entry.type}`)} · {item.entry.summary}
      </span>
    );
  }
  if (item.kind === "request") {
    return (
      <span>
        {formatTime(item.at)} · {item.request.houseLabel} · {t(`common.request.${item.request.kind}`)}
      </span>
    );
  }
  return (
    <span>
      {formatTime(item.at)} · {item.truckId} · {item.kind === "truck_down" ? t("common.truck.down") : t("common.truck.up")}
    </span>
  );
}

function AddRequestForm({ houses, onAdd }: { houses: Snapshot["houses"]; onAdd: (houseId: string, kind: RequestKind) => Promise<void> }) {
  const [houseId, setHouseId] = useState(houses[0]?.id ?? "");
  const [kind, setKind] = useState<RequestKind>("soon");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={s.lookupForm}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!houseId) return;
        setBusy(true);
        try {
          await onAdd(houseId, kind);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className={s.field}>
        <label htmlFor="add-house">{t("office.addRequest.house")}</label>
        <select id="add-house" value={houseId} onChange={(e) => setHouseId(e.target.value)}>
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
        </select>
      </div>
      <div className={s.field}>
        <label htmlFor="add-kind">{t("office.addRequest.type")}</label>
        <select id="add-kind" value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>
          {REQUEST_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`common.request.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={busy}>
        {t("office.addRequest.submit")} · {t("office.open.addCall")}
      </Button>
    </form>
  );
}

function NeedsHumanCard({
  note,
  villageId,
  houses,
  trucks,
  onConfirm,
}: {
  note: VoiceNoteInfo;
  villageId: string;
  houses: Snapshot["houses"];
  trucks: Snapshot["trucks"];
  onConfirm: (voiceNoteId: string | null, fields: LogFields) => Promise<void>;
}) {
  const draft = note.draft;
  const [type, setType] = useState(draft?.type ?? "other");
  const [category, setCategory] = useState(draft?.category ?? null);
  const [severity, setSeverity] = useState(draft?.severity ?? null);
  const [summary, setSummary] = useState(draft?.summary ?? "");
  const [aboutTruckId, setAboutTruckId] = useState(draft?.aboutTruckId ?? null);
  const [aboutHouseId, setAboutHouseId] = useState(draft?.aboutHouseId ?? null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className={s.humanCard}>
      <audio controls src={`/api/v/${villageId}/voice-notes/${note.id}/audio`} aria-label={t("office.human.playAudio")} />
      {draft ? (
        <p>{draft.needsHuman ? t("office.human.notSure") : draft.summary}</p>
      ) : (
        <p>{t("office.human.notSure")}</p>
      )}
      {draft?.transcript && (
        <>
          <Button variant="ghost" icon={<Play />} onClick={() => setShowTranscript((v) => !v)}>
            {t("office.human.transcript")}
          </Button>
          {showTranscript && <p>{draft.transcript}</p>}
        </>
      )}
      <div className={s.lookupForm}>
        <div className={s.field}>
          <label htmlFor={`type-${note.id}`}>{t("office.addRequest.type")}</label>
          <select id={`type-${note.id}`} value={type} onChange={(e) => setType(e.target.value as LogFields["type"])}>
            {LOG_TYPES.map((lt) => (
              <option key={lt} value={lt}>
                {t(`common.logType.${lt}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor={`sev-${note.id}`}>{t("common.severity.fine").split(" ")[0]}</label>
          <select id={`sev-${note.id}`} value={severity ?? ""} onChange={(e) => setSeverity((e.target.value || null) as LogFields["severity"])}>
            <option value="">—</option>
            {SEVERITIES.map((sv) => (
              <option key={sv} value={sv}>
                {t(`common.severity.${sv}`)}
              </option>
            ))}
          </select>
        </div>
        {type === "truck_problem" && (
          <div className={s.field}>
            <label htmlFor={`cat-${note.id}`}>{t("office.addRequest.type")}</label>
            <select id={`cat-${note.id}`} value={category ?? ""} onChange={(e) => setCategory((e.target.value || null) as LogFields["category"])}>
              <option value="">—</option>
              {TRUCK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`common.category.${c}`)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={s.field}>
          <label htmlFor={`truck-${note.id}`}>Truck</label>
          <select id={`truck-${note.id}`} value={aboutTruckId ?? ""} onChange={(e) => setAboutTruckId(e.target.value || null)}>
            <option value="">—</option>
            {trucks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.label}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor={`house-${note.id}`}>{t("office.addRequest.house")}</label>
          <select id={`house-${note.id}`} value={aboutHouseId ?? ""} onChange={(e) => setAboutHouseId(e.target.value || null)}>
            <option value="">—</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field} style={{ flex: "1 1 12rem" }}>
          <label htmlFor={`summary-${note.id}`}>Summary</label>
          <input id={`summary-${note.id}`} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
      </div>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm(note.id, {
              aboutTruckId,
              aboutHouseId,
              type,
              category,
              severity,
              summary,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("office.human.confirm")}
      </Button>
    </div>
  );
}

function LookupPanel({ lookup }: { lookup: ReturnType<typeof useDeliveryLookup> }) {
  const { from, to, setFrom, setTo, rows, loading, error, run, homeCount, csvUrl, copyList } = lookup;
  const [copied, setCopied] = useState(false);
  const toInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const fromInput = (s: string) => new Date(s).getTime();

  const sinceTuesday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() - ((day - 2 + 7) % 7));
    setFrom(d.getTime());
    setTo(Date.now());
    run(d.getTime(), Date.now());
  };
  const last7 = () => {
    const t2 = Date.now();
    const f = t2 - 7 * 24 * 60 * 60 * 1000;
    setFrom(f);
    setTo(t2);
    run(f, t2);
  };

  return (
    <div>
      <div className={s.lookupForm}>
        <Button variant="secondary" onClick={sinceTuesday}>
          {t("office.lookup.sinceTuesday")}
        </Button>
        <Button variant="secondary" onClick={last7}>
          {t("office.lookup.last7")}
        </Button>
        <div className={s.field}>
          <label htmlFor="lookup-from">{t("office.lookup.from")}</label>
          <input id="lookup-from" type="datetime-local" value={toInput(from)} onChange={(e) => setFrom(fromInput(e.target.value))} />
        </div>
        <div className={s.field}>
          <label htmlFor="lookup-to">{t("office.lookup.to")}</label>
          <input id="lookup-to" type="datetime-local" value={toInput(to)} onChange={(e) => setTo(fromInput(e.target.value))} />
        </div>
        <Button onClick={() => run()} disabled={loading}>
          {t("office.lookup.run")}
        </Button>
      </div>
      {error && <p role="alert">{t("office.error")}</p>}
      {rows && (
        <div>
          <p>{t("office.lookup.count", { count: homeCount })}</p>
          {rows.length === 0 ? (
            <p>{t("office.lookup.empty")}</p>
          ) : (
            <>
              <ul>
                {rows.map((r) => (
                  <li key={r.stopId}>
                    {r.houseLabel} · {formatTime(r.at)} · {r.truckLabel} · {r.litres} L
                  </li>
                ))}
              </ul>
              <div className={s.headerLinks}>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await copyList();
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? t("office.lookup.copied") : t("office.lookup.copy")}
                </Button>
                <a href={csvUrl}>{t("office.lookup.exportCsv")}</a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
