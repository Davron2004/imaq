import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import QRCode from "qrcode";
import { ArrowRight, Building2, CheckCircle2, Home, Loader2, Play, RotateCcw, Truck, Columns2, AlertTriangle } from "lucide-react";
import { Button, StatusBadge } from "../../ui";
import { SiteHeader } from "../shared/SiteHeader";
import { VillageMap } from "../shared/VillageMap";
import { t, formatAge } from "../../i18n";
import s from "./Hub.module.css";
import type { VillageState } from "../../data/hub";
import type { Snapshot } from "../../../../shared/types";

function InlineQr({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(text, { type: "svg", margin: 1 }).then((s2) => {
      if (!cancelled) setSvg(s2);
    });
    return () => {
      cancelled = true;
    };
  }, [text]);
  return <div className={s.qrCode} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export interface HubViewProps {
  villageId: string;
  state: VillageState;
  onReset: () => void;
  qrHouses: { houseId: string; label: string; token: string }[];
  myHouseToken: string | null;
  /** Live snapshot of the visitor's village, once it exists (hero map and stat strip). */
  snapshot: Snapshot | null;
}

function VillageBadge({ state }: { state: VillageState }) {
  if (state === "failed")
    return (
      <StatusBadge tone="warn" icon={<AlertTriangle />}>
        {t("hub.badge.shared")}
      </StatusBadge>
    );
  if (state === "ready")
    return (
      <StatusBadge tone="ok" icon={<CheckCircle2 />}>
        {t("hub.badge.ready")}
      </StatusBadge>
    );
  return (
    <StatusBadge tone="info" icon={<Loader2 />}>
      {state === "resetting" ? t("hub.village.resetting") : t("hub.badge.creating")}
    </StatusBadge>
  );
}

export default function HubView({ villageId, state, onReset, qrHouses, myHouseToken, snapshot }: HubViewProps) {
  const demoHouse = qrHouses[0];
  const residentPath = myHouseToken ? `/h/${myHouseToken}` : demoHouse ? `/h/${demoHouse.token}` : "/resident";
  const roles: { icon: ReactNode; title: string; body: string; to: string }[] = [
    { icon: <Home />, title: t("hub.role.resident.title"), body: t("hub.role.resident.desc"), to: residentPath },
    { icon: <Truck />, title: t("hub.role.driver.title"), body: t("hub.role.driver.desc"), to: `/v/${villageId}/driver` },
    { icon: <Building2 />, title: t("hub.role.office.title"), body: t("hub.role.office.desc"), to: `/v/${villageId}/office` },
    { icon: <Columns2 />, title: t("hub.role.sim.title"), body: t("hub.role.sim.desc"), to: "/sim" },
  ];
  const water = snapshot?.trucks.filter((tr) => tr.kind === "water") ?? [];

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <section className={s.hero}>
          <div>
            <span className="eyebrow">{t("hub.hero.kicker")}</span>
            <h1>{t("hub.hero.title")}</h1>
            <p className={s.heroText}>{t("hub.hero.intro")}</p>
            <div className={s.heroActions}>
              <Link to="/sim" className={`${s.linkButton} ${s.primary}`}>
                <Play aria-hidden="true" />
                {t("hub.hero.seeDifference")}
              </Link>
              <Link to={`/v/${villageId}/driver`} className={s.linkButton}>
                {t("hub.hero.enterVillage")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className={s.heroArt}>
            <div className={s.heroArtHead}>
              <strong>{t("hub.hero.dayOverview")}</strong>
              <VillageBadge state={state} />
            </div>
            {snapshot ? (
              <VillageMap
                houses={snapshot.houses}
                openRequests={snapshot.openRequests}
                waitingTooLong={snapshot.counts.waitingTooLong}
                geometry={snapshot.village.geometry}
              />
            ) : (
              <div className={s.mapPlaceholder} aria-busy="true">
                {t("hub.village.creating")}
              </div>
            )}
            <ol className={s.steps}>
              {[t("hub.step.one"), t("hub.step.two"), t("hub.step.three")].map((label, i) => (
                <li key={i}>
                  <span className={s.stepNumber} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{label}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {snapshot && (
          <div className={s.stats}>
            <div className={s.stat}>
              <strong>
                {water.filter((tr) => tr.status === "up").length} / {water.length}
              </strong>
              <span>{t("office.stat.waterRunning")}</span>
            </div>
            <div className={s.stat}>
              <strong>{snapshot.openRequests.length}</strong>
              <span>{t("office.stat.open")}</span>
            </div>
            <div className={s.stat}>
              <strong>{snapshot.counts.oldestOpenAt != null ? formatAge(snapshot.serverTime - snapshot.counts.oldestOpenAt) : "0"}</strong>
              <span>{t("hub.stat.longestWait")}</span>
            </div>
          </div>
        )}

        <section aria-labelledby="hub-roles-h">
          <div className={s.sectionHead}>
            <h2 id="hub-roles-h">{t("hub.roles.title")}</h2>
            <p className="muted">{t("hub.roles.subtitle")}</p>
          </div>
          <ul className={s.roles}>
            {roles.map((r, i) => (
              <li key={r.title}>
                <Link to={r.to} className={s.roleCard}>
                  <span className={s.roleTop}>
                    <span aria-hidden="true" className={s.roleIcon}>
                      {r.icon}
                    </span>
                    <span className="eyebrow" aria-hidden="true">
                      0{i + 1}
                    </span>
                  </span>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                  <span className={s.arrow}>
                    {t("hub.role.explore")}
                    <ArrowRight aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className={s.bottom}>
          <section className={s.panel} aria-labelledby="hub-village-h">
            <div>
              <h2 id="hub-village-h">{t("hub.private.title")}</h2>
              <p className="muted">{t("hub.private.detail")}</p>
            </div>
            <div className={s.villageRow} role="status">
              <span>
                {state === "failed"
                  ? t("hub.village.failed")
                  : state === "creating"
                    ? t("hub.village.creating")
                    : t("hub.village.ready", { name: snapshot?.village.name ?? villageId })}
              </span>
              <VillageBadge state={state} />
            </div>
            <Button block variant="secondary" icon={<RotateCcw />} onClick={onReset} disabled={state === "resetting" || state === "creating"}>
              {state === "resetting" ? t("hub.village.resetting") : t("hub.village.resetVillage")}
            </Button>
            <div className={s.links}>
              {myHouseToken && <Link to={`/h/${myHouseToken}`}>{t("hub.goToMyHouse")}</Link>}
              <a href="/?village=demo">{t("hub.presenterLink")}</a>
            </div>
          </section>

          <section className={s.panel} aria-labelledby="hub-qr-h">
            <div className={s.qrMini}>
              {demoHouse && <InlineQr text={`${window.location.origin}/h/${demoHouse.token}`} label={`${t("qr.instruction")}: ${demoHouse.label}`} />}
              <div className={s.qrText}>
                <h2 id="hub-qr-h">{demoHouse ? demoHouse.label : t("hub.qrHeading")}</h2>
                <p className="muted">{t("hub.qr.intro")}</p>
                <Link to={`/v/${villageId}/qr`} className={s.textLink}>
                  {t("hub.qr.sheet")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
        </div>

        <section className={s.notice}>
          <strong>{t("hub.keepLight.title")}</strong>
          <p>{t("hub.keepLight.detail")}</p>
        </section>

        <footer className={s.footer}>
          <div className={s.footerCol}>
            <span>
              {t("hub.footer.license")} · {t("hub.footer.cost")}
            </span>
            <a href="https://github.com/Davron2004/imaq">{t("hub.footer.repo")}</a>
          </div>
          <div className={s.footerCol}>
            <span>{t("hub.footer.fictional")}</span>
            <small>{t("hub.footer.provisional")}</small>
          </div>
        </footer>
      </main>
    </>
  );
}
