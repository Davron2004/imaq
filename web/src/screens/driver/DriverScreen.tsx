/**
 * Driver app. Containers here turn useDriverApp() data into view models for the *View components.
 *
 * Navigation state machine (URL under /v/:villageId/driver):
 *   (no snapshot on phone)  → "connect once" message; the sync bar still works
 *   index  → no truck chosen          ⇒ redirect pick
 *          → truck not checked today  ⇒ redirect check (unless skipped this session)
 *          → today's list (home base; stop sheet opens over it)
 *   pick   → choose truck ⇒ index
 *   check  → All OK ⇒ index | mark problems → Save → confirm "marks Truck N down" ⇒ index | Back ⇒ edit | Skip ⇒ index
 *   lit, voice, truck, done, inbox, inbox/:noteId → Back link ⇒ index
 * Sync details is a sheet available from every screen. Undo lives in the shell so it survives navigation.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Lightbulb, ListChecks, Mic, Truck as TruckIcon, ClipboardList, Inbox } from "lucide-react";
import { CHECK_ITEMS, truckKindFor, type CheckItem, type FailReason, type LogFields, type OpenRequest, type TruckCategory } from "../../../../shared/types";
import { formatDay, formatTime, t } from "../../i18n";
import { useNow } from "../../data/driver/hooks";
import { todayKey } from "../../data/driver/actions";
import { MAX_SECONDS, SAMPLES, useRecorder } from "../../data/driver/recorder";
import type { VoiceContext } from "../../../../shared/types";
import { DriverCtx, useDriver, useDriverApp } from "./useDriverApp";
import { eventLabel, inboxNotes, listVm, noteState, noteStateText, todaysDone } from "./model";
import { SyncStatusView } from "./views/SyncStatusView";
import { SyncDetailsView } from "./views/SyncDetailsView";
import { SheetView } from "./views/SheetView";
import { TruckPickerView } from "./views/TruckPickerView";
import { CheckView } from "./views/CheckView";
import { ListView } from "./views/ListView";
import { StopSheetView } from "./views/StopSheetView";
import { UndoBarView } from "./views/UndoBarView";
import { DoneView } from "./views/DoneView";
import { LitDoorView } from "./views/LitDoorView";
import { TruckStatusView } from "./views/TruckStatusView";
import { RecorderView } from "./views/RecorderView";
import { VoiceCardView } from "./views/VoiceCardView";
import { NotesView } from "./views/NotesView";
import s from "./driver.module.css";

const skippedCheck = new Set<string>();
const nf = new Intl.NumberFormat("en-CA");

export default function DriverScreen() {
  const { villageId = "demo" } = useParams();
  const app = useDriverApp(villageId);
  const [syncOpen, setSyncOpen] = useState(false);
  const { data } = app;
  const { pathname } = useLocation();

  return (
    <DriverCtx.Provider value={app}>
      <div className={s.shell}>
        <SyncStatusView vm={app.sync} onOpen={() => setSyncOpen(true)} />
        <div className={s.srOnly} aria-live="polite" role="status" data-testid="announcer">{app.announcement}</div>
        <div className={s.srOnly} aria-live="polite" data-testid="announcer-sync">{app.syncAnnouncement}</div>
        <main className={s.main}>
          {!data.loaded ? (
            <p>{t("driver.loading")}</p>
          ) : !data.snapshot ? (
            <p className={s.h2}>{t("driver.firstSyncNeeded")}</p>
          ) : (
            <Routes>
              <Route index element={<Home />} />
              <Route path="pick" element={<Pick />} />
              <Route path="check" element={<Check />} />
              <Route path="lit" element={<Sub><LitDoor /></Sub>} />
              <Route path="truck" element={<Sub><TruckStatus /></Sub>} />
              <Route path="voice" element={<Sub><FreeVoice /></Sub>} />
              <Route path="done" element={<Sub><Done /></Sub>} />
              <Route path="inbox" element={<Sub><InboxPage /></Sub>} />
              <Route path="inbox/:noteId" element={<Sub><Card /></Sub>} />
              <Route path="*" element={<Navigate to="." replace />} />
            </Routes>
          )}
        </main>
        {data.snapshot && app.truck && !/\/(pick|check)$/.test(pathname) && <Dock />}
        {app.undo && <UndoBarView text={app.undo.text} onUndo={app.doUndo} />}
        <SheetView open={syncOpen} title={t("driver.sync.detailsTitle")} onClose={() => setSyncOpen(false)}>
          <SyncDetails />
        </SheetView>
      </div>
    </DriverCtx.Provider>
  );
}

function useBase() {
  const { villageId } = useDriver();
  return `/v/${encodeURIComponent(villageId)}/driver`;
}

function Sub({ children }: { children: ReactNode }) {
  const base = useBase();
  const { truck } = useDriver();
  if (!truck) return <Navigate to={`${base}/pick`} replace />;
  return (
    <>
      <Link to={base} className={s.linkBtn}><ArrowLeft aria-hidden="true" /> {t("driver.back")}</Link>
      {children}
    </>
  );
}

function Dock() {
  const base = useBase();
  return (
    <nav className={s.dock} aria-label={t("driver.title")}>
      <Link to={base}><ListChecks aria-hidden="true" />{t("driver.nav.today")}</Link>
      <Link to={`${base}/lit`}><Lightbulb aria-hidden="true" />{t("driver.nav.litDoor")}</Link>
      <Link to={`${base}/voice`}><Mic aria-hidden="true" />{t("driver.nav.voice")}</Link>
      <Link to={`${base}/truck`}><TruckIcon aria-hidden="true" />{t("driver.nav.truck")}</Link>
      <Link to={`${base}/done`}><ClipboardList aria-hidden="true" />{t("driver.nav.done")}</Link>
    </nav>
  );
}

// sync ---------------------------------------------------------------------------

function SyncDetails() {
  const app = useDriver();
  const { data } = app;
  return (
    <SyncDetailsView
      vm={{
        statusText: app.sync.text,
        waiting: data.pending.map((r) => ({ id: r.id, label: eventLabel(r, data.snapshot) })),
        notesWaiting: app.notesWaiting,
        rejected: data.rejected.map((r) => ({ id: r.id, label: eventLabel(r, data.snapshot), error: r.error ?? "" })),
        forcedOffline: data.engine.forcedOffline,
        syncing: data.engine.syncing,
      }}
      onSyncNow={() => void app.actions.getEngine(app.villageId).sync()}
      onToggleForced={(on) => app.actions.setForcedOffline(on)}
      onDismiss={(id) => void app.actions.dismissRejected(id)}
    />
  );
}

// pick / check ------------------------------------------------------------------------

function Pick() {
  const app = useDriver();
  const navigate = useNavigate();
  const base = useBase();
  const snap = app.data.snapshot!;
  return (
    <TruckPickerView
      trucks={snap.trucks.map((tr) => ({
        id: tr.id,
        label: tr.label,
        kindText: t(`common.truck.${tr.kind}`),
        up: tr.status === "up",
        statusText: tr.status === "up" ? t("common.truck.up") : tr.downSince ? t("driver.pick.downSince", { day: formatDay(tr.downSince) }) : t("common.truck.down"),
        selected: tr.id === app.session?.truckId,
      }))}
      initials={app.session?.initials ?? ""}
      onInitials={app.setInitials}
      onPick={(id) => {
        app.chooseTruck(id);
        navigate(base);
      }}
    />
  );
}

function Home() {
  const app = useDriver();
  const s0 = app.session;
  if (!s0?.truckId || !app.truck) return <Navigate to="pick" replace />;
  const checked = s0.checkedDay === todayKey() && s0.checkedTruckId === app.truck.id;
  if (!checked && !skippedCheck.has(app.truck.id)) return <Navigate to="check" replace />;
  return <TodayList />;
}

function Check() {
  const app = useDriver();
  const navigate = useNavigate();
  const base = useBase();
  const [items, setItems] = useState<Record<CheckItem, boolean>>({ starts: true, heater: true, pump: true, hoses: true, other: true });
  const [confirming, setConfirming] = useState(false);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const truck = app.truck;
  if (!truck) return <Navigate to={`${base}/pick`} replace />;
  const submit = (vals: Record<CheckItem, boolean>) => {
    app.truckCheck(truck.id, vals, voiceId);
    if (Object.values(vals).some((v) => !v)) app.announce(t("driver.announce.truckDown", { truck: truck.label }));
    navigate(base);
  };
  return (
    <CheckView
      vm={{ truckLabel: truck.label, items: CHECK_ITEMS.map((i) => ({ item: i, ok: items[i] })), anyProblem: Object.values(items).some((v) => !v), confirming }}
      recorder={<RecorderBox context="check" houseId={null} onSaved={setVoiceId} />}
      onAllOk={() => submit({ starts: true, heater: true, pump: true, hoses: true, other: true })}
      onToggle={(i, ok) => setItems((p) => ({ ...p, [i]: ok }))}
      onSave={() => setConfirming(true)}
      onConfirmDown={() => submit(items)}
      onCancelConfirm={() => setConfirming(false)}
      onLater={() => {
        skippedCheck.add(truck.id);
        navigate(base);
      }}
    />
  );
}

// today's list + stop sheet -----------------------------------------------------------------------

interface StopDraft {
  request: OpenRequest;
  litres: number;
  reason: FailReason | null;
  voiceNoteId: string | null;
}

function TodayList() {
  const app = useDriver();
  const now = useNow();
  const base = useBase();
  const snap = app.data.snapshot!;
  const truck = app.truck!;
  const vm = useMemo(() => listVm(snap, truck, now), [snap, truck, now]);
  const [stop, setStop] = useState<StopDraft | null>(null);
  const inbox = inboxNotes(app.data.notes, app.data.engine).length;
  const fullTank = (r: OpenRequest) => snap.houses.find((h) => h.id === r.houseId)?.tankLitres || snap.village.config.defaultTankLitres;

  const finish = async (outcome: "delivered" | "failed") => {
    if (!stop) return;
    const d = stop;
    setStop(null);
    const id = await app.actions.recordStop(app.villageId, {
      request: d.request,
      truckId: truck.id,
      initials: app.session?.initials ?? null,
      outcome,
      litres: d.litres,
      reason: d.reason,
      voiceNoteId: d.voiceNoteId,
    });
    const text = outcome === "delivered" ? t("driver.undo.delivered", { house: d.request.houseLabel }) : t("driver.undo.failed", { house: d.request.houseLabel });
    app.announce(text);
    app.showUndo({ stopId: id, text, houseLabel: d.request.houseLabel });
  };

  return (
    <>
      {inbox > 0 && (
        <Link to={`${base}/inbox`} className={s.banner}><Inbox aria-hidden="true" /> {t("driver.nav.inbox", { count: inbox })}</Link>
      )}
      <ListView
        vm={vm}
        onOpenStop={(id) => {
          const r = snap.openRequests.find((x) => x.id === id);
          if (r) setStop({ request: r, litres: r.litres, reason: null, voiceNoteId: null });
        }}
      />
      <Link to={`${base}/pick`} className={s.linkBtn}><TruckIcon aria-hidden="true" /> {t("driver.nav.changeTruck")}</Link>
      <SheetView open={!!stop} title={stop ? t("driver.stop.title", { house: stop.request.houseLabel }) : ""} onClose={() => setStop(null)}>
        {stop && (
          <StopSheetView
            vm={{ litres: stop.litres, fullTankLitres: fullTank(stop.request), reason: stop.reason, voiceAttached: !!stop.voiceNoteId }}
            recorder={<RecorderBox context="stop" houseId={stop.request.houseId} onSaved={(id) => setStop((p) => (p ? { ...p, voiceNoteId: id } : p))} />}
            onLitres={(l) => setStop((p) => (p ? { ...p, litres: l } : p))}
            onReason={(r) => setStop((p) => (p ? { ...p, reason: r } : p))}
            onDelivered={() => void finish("delivered")}
            onFailed={() => void finish("failed")}
          />
        )}
      </SheetView>
    </>
  );
}

// done today -----------------------------------------------------------------------------

function Done() {
  const app = useDriver();
  const now = useNow();
  const pendingIds = new Set(app.data.pending.map((p) => p.id));
  const items = todaysDone(app.data.done, app.truck?.id ?? null, now).map((d) => ({
    id: d.id,
    houseLabel: d.houseLabel,
    delivered: d.outcome === "delivered",
    text:
      d.outcome === "delivered"
        ? `${t("common.outcome.delivered")} · ${nf.format(d.litres)} L · ${formatTime(d.occurredAt)}`
        : `${t("common.outcome.failed")} · ${t(`common.reason.${d.reason ?? "other"}`)} · ${formatTime(d.occurredAt)}`,
    synced: !pendingIds.has(d.id),
    voided: d.voided,
  }));
  return <DoneView items={items} onVoid={(id) => void app.actions.voidStop(app.villageId, id)} />;
}

// lit door -------------------------------------------------------------------------------

function LitDoor() {
  const app = useDriver();
  const navigate = useNavigate();
  const base = useBase();
  const [digits, setDigits] = useState("");
  const snap = app.data.snapshot!;
  const truck = app.truck!;
  const kind = truck.kind === "sewage" ? "sewage" : "out";
  const house = digits ? snap.houses.find((h) => (h.label.match(/\d+/)?.[0] ?? "").replace(/^0+/, "") === digits.replace(/^0+/, "")) : undefined;
  const duplicate = !!house && snap.openRequests.some((r) => r.houseId === house.id && truckKindFor(r.kind) === truck.kind);
  return (
    <LitDoorView
      vm={{ digits, matchLabel: house?.label ?? null, duplicate, kindText: t(`common.request.${kind}`) }}
      onDigit={(d) => setDigits((p) => (p + d).slice(0, 4))}
      onDelete={() => setDigits((p) => p.slice(0, -1))}
      onClear={() => setDigits("")}
      onAdd={async () => {
        if (!house || duplicate) return;
        await app.actions.litDoor(app.villageId, house.id, kind, truck.id);
        app.announce(t("driver.lit.added", { house: house.label }));
        navigate(base);
      }}
    />
  );
}

// truck status -------------------------------------------------------------------------------

function TruckStatus() {
  const app = useDriver();
  const navigate = useNavigate();
  const base = useBase();
  const truck = app.truck!;
  const [reason, setReason] = useState<TruckCategory | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const down = truck.status === "down";
  return (
    <TruckStatusView
      vm={{
        truckLabel: truck.label,
        down,
        statusText: down
          ? t("driver.truck.isDown", { truck: truck.label, time: truck.downSince ? `${formatDay(truck.downSince)} ${formatTime(truck.downSince)}` : "—" })
          : t("driver.truck.isUp", { truck: truck.label }),
        historyText: truck.downHistoryDays.length ? t("driver.truck.history", { days: truck.downHistoryDays.slice(0, 3).join(", ") }) : null,
        reason,
        voiceAttached: !!voiceId,
      }}
      recorder={<RecorderBox context="down" houseId={null} onSaved={setVoiceId} />}
      onReason={setReason}
      onDown={async () => {
        if (!reason) return;
        await app.actions.truckDown(app.villageId, truck.id, reason, voiceId);
        app.announce(t("driver.announce.truckDown", { truck: truck.label }));
        setReason(null);
        setVoiceId(null);
      }}
      onBack={async () => {
        await app.actions.truckBack(app.villageId, truck.id);
        app.announce(t("driver.announce.truckBack", { truck: truck.label }));
      }}
      onRecheck={() => navigate(`${base}/check`)}
    />
  );
}

// voice -------------------------------------------------------------------------------------

function RecorderBox({ context, houseId, onSaved }: { context: VoiceContext; houseId: string | null; onSaved?: (id: string) => void }) {
  const app = useDriver();
  const rec = useRecorder({ villageId: app.villageId, context, truckId: app.truck?.id ?? null, houseId }, (id) => {
    app.announce(t("driver.voice.saved"));
    onSaved?.(id);
  });
  return (
    <RecorderView
      vm={{
        phase: rec.phase,
        why: rec.why,
        elapsedS: rec.elapsed,
        maxS: MAX_SECONDS,
        level: rec.level,
        savedText: rec.lastSavedId ? t("driver.voice.saved") : null,
        samples: SAMPLES.map((x) => x.sampleId),
        showSamples: app.isDemo,
      }}
      handlers={rec.buttonHandlers}
      onCancel={rec.cancel}
      onSample={(id) => void rec.useSample(id)}
    />
  );
}

function noteItems(app: ReturnType<typeof useDriver>, base: string, notes = app.data.notes) {
  return [...notes].reverse().map((n) => {
    const st = noteState(n, app.data.engine);
    return {
      id: n.id,
      title: `${t("driver.voice.title")} · ${formatTime(n.createdAt)}`,
      stateText: noteStateText(st),
      openable: st === "ready" || st === "needs_human" || st === "confirmed" || st === "sentToHuman",
      href: `${base}/inbox/${n.id}`,
    };
  });
}

function FreeVoice() {
  const app = useDriver();
  const base = useBase();
  return (
    <div className={s.stack}>
      <h1 className={s.h1}>{t("driver.voice.title")}</h1>
      <RecorderBox context="free" houseId={null} />
      <NotesView title={t("driver.voice.notes")} items={noteItems(app, base)} emptyText="" />
    </div>
  );
}

function InboxPage() {
  const app = useDriver();
  const base = useBase();
  return (
    <div className={s.stack}>
      <h1 className={s.h1}>{t("driver.inbox.title")}</h1>
      <NotesView title={t("driver.nav.inbox", { count: inboxNotes(app.data.notes, app.data.engine).length })} items={noteItems(app, base, inboxNotes(app.data.notes, app.data.engine))} emptyText={t("driver.inbox.empty")} />
    </div>
  );
}

const BLANK: LogFields = { aboutTruckId: null, aboutHouseId: null, type: "other", category: null, severity: null, summary: "" };

function Card() {
  const app = useDriver();
  const { noteId = "" } = useParams();
  const note = app.data.notes.find((n) => n.id === noteId);
  const draft = note?.info?.draft ?? null;
  const [fields, setFields] = useState<LogFields | null>(null);
  const [editing, setEditing] = useState<boolean | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!note?.blob) return;
    const url = URL.createObjectURL(note.blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [note?.blob]);
  useEffect(() => {
    document.getElementById("card-h")?.focus();
  }, [noteId]);

  if (!note) return <p>{t("driver.inbox.empty")}</p>;
  const st = noteState(note, app.data.engine);
  if (!draft) return <p className={s.h2}>{noteStateText(st)}</p>;
  const snap = app.data.snapshot!;
  const f: LogFields = fields ?? {
    aboutTruckId: draft.aboutTruckId,
    aboutHouseId: draft.aboutHouseId,
    type: draft.type ?? BLANK.type,
    category: draft.category,
    severity: draft.severity,
    summary: draft.summary ?? "",
  };
  const about = f.aboutTruckId
    ? snap.trucks.find((x) => x.id === f.aboutTruckId)?.label
    : f.aboutHouseId
      ? snap.houses.find((h) => h.id === f.aboutHouseId)?.label
      : null;
  const unsure = draft.needsHuman;
  const lang = draft.language ? (new Intl.DisplayNames(["en"], { type: "language" }).of(draft.language) ?? draft.language) : t("driver.card.none");
  return (
    <VoiceCardView
      vm={{
        unsure,
        fallback: draft.source === "fallback",
        editing: editing ?? unsure,
        fields: f,
        aboutText: about ?? t("driver.card.none"),
        languageText: lang,
        transcript: draft.transcript,
        audioUrl,
        trucks: snap.trucks.map((x) => ({ id: x.id, label: x.label })),
        houses: snap.houses.map((h) => ({ id: h.id, label: h.label })),
        resolvedText: st === "confirmed" ? t("driver.card.confirmed") : st === "sentToHuman" ? t("driver.card.sentToHuman") : null,
      }}
      onEdit={setEditing}
      onField={(p) => setFields({ ...f, ...p })}
      onConfirm={() => {
        void app.actions.confirmNote(app.villageId, note.id, { ...f, category: f.type === "truck_problem" ? f.category : null, summary: f.summary.slice(0, 200) });
        app.announce(t("driver.card.confirmed"));
      }}
      onNeedsHuman={() => {
        void app.actions.noteNeedsHuman(app.villageId, note.id);
        app.announce(t("driver.card.sentToHuman"));
      }}
    />
  );
}
