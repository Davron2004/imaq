import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Play, Plus, RotateCcw, Truck, Flag as FlagIcon, Mic, Clock, Droplet, Droplets, Trash2 } from "lucide-react";
import { Button, StatusBadge, type Tone } from "../../ui";
import { SiteHeader } from "../shared/SiteHeader";
import { VillageMap, VillageMapLegend } from "../shared/VillageMap";
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
  /** Shown inside the live demo stage: no site header. */
  embedded?: boolean;
}

/** Badge look per request kind: status is never colour alone, so each kind has its own icon and word. */
const KIND_BADGE: Record<RequestKind, { tone: Tone; icon: ReactNode }> = {
  emergency: { tone: "emergency", icon: <AlertTriangle /> },
  out: { tone: "danger", icon: <Droplet /> },
  soon: { tone: "info", icon: <Droplets /> },
  sewage: { tone: "warn", icon: <Trash2 /> },
};

function KindBadge({ kind }: { kind: RequestKind }) {
  const b = KIND_BADGE[kind];
  return (
    <StatusBadge tone={b.tone} icon={b.icon}>
      {t(`common.request.${kind}`)}
    </StatusBadge>
  );
}

export default function OfficeView(props: OfficeViewProps) {
  const { status, snapshot, newFlagIds, announcement, villageId, onAddRequest, onCancelRequest, onConfirmLog, onReset, resetting, onRetry, lookup, weekly, embedded } = props;
  // "Add an office call" panel: closed -> open (button) -> closed (added or cancelled).
  const [adding, setAdding] = useState(false);

  if (status === "error" && !snapshot) {
    return (
      <>
        {!embedded && <SiteHeader />}
        <main className={s.page}>
          <p>{t("office.error")}</p>
          <Button onClick={onRetry}>{t("office.retry")}</Button>
        </main>
      </>
    );
  }
  if (status === "loading" || !snapshot) {
    return (
      <>
        {!embedded && <SiteHeader />}
        <main className={s.page} aria-busy="true">
          <p>{t("office.loading")}</p>
        </main>
      </>
    );
  }

  const tooLong = new Set(snapshot.counts.waitingTooLong);
  const tooLongRequests = snapshot.openRequests.filter((r) => tooLong.has(r.id));
  const waterTrucks = snapshot.trucks.filter((tr) => tr.kind === "water");
  const waterUp = waterTrucks.filter((tr) => tr.status === "up").length;
  const openCount = snapshot.openRequests.length;
  const latestWeek = weekly.rows[0];

  return (
    <>
      {!embedded && <SiteHeader />}
      <main className={s.page}>
        <div aria-live="assertive" className="visually-hidden">
          {announcement}
        </div>

        <div className={s.heading}>
          <div>
            <span className="eyebrow">
              {t("office.eyebrow")} / {snapshot.village.name}
            </span>
            <h1>{t("office.headline")}</h1>
            <p className="muted">
              {formatDate(snapshot.serverTime)} · {t("office.updated", { time: formatTime(snapshot.serverTime) })}
            </p>
          </div>
          <div className={s.actions}>
            <Button icon={<Plus />} onClick={() => setAdding(true)} aria-expanded={adding} aria-controls="office-add-call">
              {t("office.addCall")}
            </Button>
            <Button variant="ghost" icon={<RotateCcw />} onClick={onReset} disabled={resetting}>
              {resetting ? t("office.resetting") : t("office.resetVillage")}
            </Button>
          </div>
        </div>

        {adding && (
          <section id="office-add-call" className={`${s.panel} ${s.addPanel}`} aria-labelledby="office-add-call-h">
            <h2 id="office-add-call-h">{t("office.addCall")}</h2>
            <AddRequestForm houses={snapshot.houses} onAdd={onAddRequest} onDone={() => setAdding(false)} />
          </section>
        )}

        <div className={s.stats}>
          <div className={s.stat}>
            <strong>
              {waterUp}
              <span className="muted"> / {waterTrucks.length}</span>
            </strong>
            <span>{t("office.stat.waterRunning")}</span>
          </div>
          <div className={s.stat}>
            <strong>{openCount}</strong>
            <span>{t("office.stat.open")}</span>
          </div>
          <div className={s.stat}>
            <strong>{snapshot.counts.oldestOpenAt != null ? formatAge(snapshot.serverTime - snapshot.counts.oldestOpenAt) : "0"}</strong>
            <span>{t("office.stat.oldest")}</span>
          </div>
          <div className={`${s.stat} ${tooLongRequests.length > 0 ? s.statAlert : ""}`}>
            <strong>
              {tooLongRequests.length > 0 && <AlertTriangle aria-hidden="true" className={s.statIcon} />}
              {tooLongRequests.length}
            </strong>
            <span>{t("office.stat.overdue")}</span>
          </div>
        </div>

        <div className={s.layout}>
          <div className={s.column}>
            <section className={s.panel} aria-labelledby="office-open-h">
              <div className={s.sectionHead}>
                <h2 id="office-open-h">{t("office.openHeading")}</h2>
                <small>{t("office.open.priority")}</small>
              </div>
              {tooLongRequests.length > 0 && (
                <div className={s.noticeError} role="status">
                  <strong>
                    <AlertTriangle aria-hidden="true" className={s.inlineIcon} />
                    {t("office.open.attention", { count: tooLongRequests.length })}
                  </strong>
                  <p>{tooLongRequests.map((r) => r.houseLabel).join(" · ")}</p>
                </div>
              )}
              {openCount === 0 ? (
                <p className={s.empty}>{t("office.open.empty")}</p>
              ) : (
                <ul className={s.list}>
                  {snapshot.openRequests.map((r) => {
                    const last = r.attempts[r.attempts.length - 1];
                    return (
                      <li key={r.id} className={s.request}>
                        <div className={s.field}>
                          <strong className={s.house}>{r.houseLabel}</strong>
                          <small>{t(`common.source.${r.source}`)}</small>
                        </div>
                        <div className={s.field}>
                          <KindBadge kind={r.kind} />
                          {last && <small>{t("office.open.attempts", { time: formatTime(last.at), reason: t(`common.reason.${last.reason}`) })}</small>}
                        </div>
                        <div className={s.field}>
                          <span>{t("office.open.age", { age: formatAge(snapshot.serverTime - r.createdAt) })}</span>
                        </div>
                        <Button variant="ghost" className={s.cancel} onClick={() => onCancelRequest(r.id)}>
                          {t("office.open.cancel")}
                          <span className="visually-hidden"> · {r.houseLabel}</span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={s.panel} aria-labelledby="office-map-h">
              <div className={s.sectionHead}>
                <h2 id="office-map-h">{t("office.mapHeading")}</h2>
                <small>{t("office.map.caption", { count: snapshot.houses.length })}</small>
              </div>
              <VillageMap
                houses={snapshot.houses}
                openRequests={snapshot.openRequests}
                waitingTooLong={snapshot.counts.waitingTooLong}
                geometry={snapshot.village.geometry}
              />
              <VillageMapLegend />
            </section>
          </div>

          <aside className={s.column} aria-label={t("office.sideLabel")}>
            <section className={s.panel} aria-labelledby="office-fleet-h">
              <div className={s.sectionHead}>
                <h2 id="office-fleet-h">{t("office.fleetHeading")}</h2>
                <Truck aria-hidden="true" className={s.headIcon} />
              </div>
              <div className={s.fleet}>
                {snapshot.trucks.map((truck) => (
                  <article key={truck.id} className={s.truck}>
                    <h3>{truck.label}</h3>
                    <small>{t(`common.truck.${truck.kind}`)}</small>
                    <StatusBadge tone={truck.status === "up" ? "ok" : "danger"} icon={truck.status === "up" ? <CheckCircle2 /> : <XCircle />}>
                      {t(`common.truck.${truck.status}`)}
                    </StatusBadge>
                    <small>{truck.lastCheck ? t("office.truck.lastCheck", { time: formatTime(truck.lastCheck.at) }) : t("office.truck.noCheck")}</small>
                    {truck.status === "down" && truck.downSince != null && (
                      <p className={s.truckDown}>
                        {t("office.truck.downSince", { when: `${formatDate(truck.downSince)} ${formatTime(truck.downSince)}` })}
                      </p>
                    )}
                    {truck.status === "down" && truck.downReason && <strong>{truck.downReason}</strong>}
                    {truck.downHistoryDays.length > 0 ? (
                      <div className={s.history}>
                        <small>{t("office.truck.historyLabel", { count: truck.downHistoryDays.length })}</small>
                        <ul className={s.chips}>
                          {truck.downHistoryDays.map((d, i) => (
                            <li key={i}>{t("office.truck.days", { count: d })}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <small>{t("office.truck.historyNone")}</small>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className={s.panel} aria-labelledby="office-flags-h">
              <div className={s.sectionHead}>
                <h2 id="office-flags-h">{t("office.attentionHeading")}</h2>
                <FlagIcon aria-hidden="true" className={s.headIcon} />
              </div>
              {snapshot.flags.length === 0 ? (
                <p className={s.empty}>{t("office.flags.empty")}</p>
              ) : (
                <div className={s.stack}>
                  {snapshot.flags.map((flag) => (
                    <FlagCard key={flag.id} flag={flag} isNew={newFlagIds.has(flag.id)} />
                  ))}
                </div>
              )}
            </section>

            <section className={s.panel} aria-labelledby="office-human-h">
              <div className={s.sectionHead}>
                <h2 id="office-human-h">{t("office.humanHeading")}</h2>
                <StatusBadge tone="info" icon={<Mic />}>
                  {snapshot.needsHuman.length}
                </StatusBadge>
              </div>
              {snapshot.needsHuman.length === 0 ? (
                <p className={s.empty}>{t("office.human.empty")}</p>
              ) : (
                <div className={s.stack}>
                  {snapshot.needsHuman.map((note) => (
                    <NeedsHumanCard key={note.id} note={note} villageId={villageId} houses={snapshot.houses} trucks={snapshot.trucks} onConfirm={onConfirmLog} />
                  ))}
                </div>
              )}
            </section>

            <section className={s.panel} aria-labelledby="office-feed-h">
              <div className={s.sectionHead}>
                <h2 id="office-feed-h">{t("office.activityHeading")}</h2>
                <Clock aria-hidden="true" className={s.headIcon} />
              </div>
              {snapshot.feed.length === 0 ? (
                <p className={s.empty}>{t("office.feed.empty")}</p>
              ) : (
                <ul className={s.list}>
                  {snapshot.feed.slice(0, 8).map((item) => (
                    <li key={item.id} className={s.activity}>
                      <time dateTime={new Date(item.at).toISOString()}>{formatTime(item.at)}</time>
                      <p>
                        <FeedRow item={item} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>

        <section className={`${s.panel} ${s.lookup}`} aria-labelledby="office-lookup-h">
          <div className={s.sectionHead}>
            <div className={s.field}>
              <h2 id="office-lookup-h">{t("office.lookup.heading")}</h2>
              <span className="muted">{t("office.lookup.question")}</span>
            </div>
            <Droplet aria-hidden="true" className={s.headIcon} />
          </div>
          <LookupPanel lookup={lookup} />
          <a className={s.textLink} href={`/api/v/${villageId}/deliveries?from=0&to=${snapshot.serverTime}&format=csv`}>
            {t("office.exportDeliveries")}
          </a>
        </section>

        <section className={`${s.panel} ${s.weekly}`} aria-labelledby="office-weekly-h">
          <div className={s.sectionHead}>
            <h2 id="office-weekly-h">{t("office.weeklyHeading")}</h2>
            <a className={s.buttonLink} href={weekly.csvUrl}>
              {t("office.exportWeekly")}
            </a>
          </div>
          {latestWeek && (
            <div className={s.weeklyGrid}>
              <div className={s.stat}>
                <strong>{latestWeek.deliveries}</strong>
                <span>{t("office.weekly.deliveries")}</span>
              </div>
              <div className={s.stat}>
                <strong>{latestWeek.couldntDeliver}</strong>
                <span>{t("office.weekly.couldntDeliver")}</span>
              </div>
              <div className={s.stat}>
                <strong>{latestWeek.homesWaitedOver24h}</strong>
                <span>{t("office.weekly.waited24")}</span>
              </div>
              <div className={s.stat}>
                <strong>{latestWeek.truckDownDays}</strong>
                <span>{t("office.weekly.truckDownDays")}</span>
              </div>
            </div>
          )}
          <div className={s.tableScroll}>
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
          </div>
        </section>
      </main>
    </>
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
        {item.stop.houseLabel} · {t(`common.outcome.${item.stop.outcome === "delivered" ? "delivered" : "failed"}`)}
      </span>
    );
  }
  if (item.kind === "log") {
    return (
      <span>
        {t(`common.logType.${item.entry.type}`)} · {item.entry.summary}
      </span>
    );
  }
  if (item.kind === "request") {
    return (
      <span>
        {item.request.houseLabel} · {t(`common.request.${item.request.kind}`)}
      </span>
    );
  }
  return (
    <span>
      {item.truckId} · {item.kind === "truck_down" ? t("common.truck.down") : t("common.truck.up")}
    </span>
  );
}

function AddRequestForm({ houses, onAdd, onDone }: { houses: Snapshot["houses"]; onAdd: (houseId: string, kind: RequestKind) => Promise<void>; onDone: () => void }) {
  const [houseId, setHouseId] = useState(houses[0]?.id ?? "");
  const [kind, setKind] = useState<RequestKind>("soon");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <form
      className={s.formRow}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!houseId || busy) return;
        setBusy(true);
        setFailed(false);
        try {
          await onAdd(houseId, kind);
          onDone();
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className={s.field}>
        <label htmlFor="add-house">{t("office.addRequest.house")}</label>
        <select id="add-house" ref={first} value={houseId} onChange={(e) => setHouseId(e.target.value)}>
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
        {t("office.addRequest.submit")}
      </Button>
      <Button variant="ghost" onClick={onDone} disabled={busy}>
        {t("office.addRequest.cancel")}
      </Button>
      {failed && (
        <p role="alert" className={s.formError}>
          {t("office.addRequest.failed")}
        </p>
      )}
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
        <div className={s.results}>
          <div className={s.sectionHead}>
            <p className={s.resultCount}>{t("office.lookup.count", { count: homeCount })}</p>
            {rows.length > 0 && (
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
                <a className={s.buttonLink} href={csvUrl}>
                  {t("office.lookup.exportCsv")}
                </a>
              </div>
            )}
          </div>
          {rows.length === 0 ? (
            <p className={s.empty}>{t("office.lookup.empty")}</p>
          ) : (
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">{t("office.addRequest.house")}</th>
                    <th scope="col">{t("office.lookup.col.time")}</th>
                    <th scope="col">{t("office.lookup.col.truck")}</th>
                    <th scope="col">{t("office.lookup.col.litres")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.stopId}>
                      <td>{r.houseLabel}</td>
                      <td>
                        {formatDate(r.at)} {formatTime(r.at)}
                      </td>
                      <td>{r.truckLabel}</td>
                      <td>{t("office.lookup.litres", { count: r.litres })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
