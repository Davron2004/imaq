import { useEffect, useState } from "react";
import { Link } from "react-router";
import QRCode from "qrcode";
import { Button, Card } from "../../ui";
import { t } from "../../i18n";
import s from "./Hub.module.css";
import type { VillageState } from "../../data/hub";

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
  return <div className={s.qrCard} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export interface HubViewProps {
  villageId: string;
  state: VillageState;
  onReset: () => void;
  qrHouses: { houseId: string; label: string; token: string }[];
  myHouseToken: string | null;
}

export default function HubView({ villageId, state, onReset, qrHouses, myHouseToken }: HubViewProps) {
  const demoHouse = qrHouses[0];
  return (
    <main className={s.page}>
      <h1>{t("hub.title")}</h1>
      <div className={s.intro}>
        <p>{t("hub.intro1")}</p>
        <p>{t("hub.intro2")}</p>
      </div>

      <Card className={s.villageCard} role="status">
        <div>
          {state === "creating" && <p>{t("hub.village.creating")}</p>}
          {state === "failed" && <p>{t("hub.village.failed")}</p>}
          {(state === "ready" || state === "resetting") && <p>{t("hub.village.ready", { name: villageId })}</p>}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {myHouseToken && (
            <Link to={`/h/${myHouseToken}`}>
              <Button variant="secondary">{t("hub.goToMyHouse")}</Button>
            </Link>
          )}
          <Button variant="secondary" onClick={onReset} disabled={state === "resetting" || state === "creating"}>
            {state === "resetting" ? t("hub.village.resetting") : t("hub.village.reset")}
          </Button>
          <a href="/?village=demo">{t("hub.presenterLink")}</a>
        </div>
      </Card>

      <h2>{t("hub.roles.heading")}</h2>
      <div className={s.roles}>
        <Card className={s.roleCard}>
          <h3>{t("hub.role.resident.title")}</h3>
          <p>{t("hub.role.resident.body")}</p>
          {demoHouse && (
            <Link to={`/h/${demoHouse.token}`}>
              <Button block>{t("hub.role.resident.cta")}</Button>
            </Link>
          )}
        </Card>
        <Card className={s.roleCard}>
          <h3>{t("hub.role.driver.title")}</h3>
          <p>{t("hub.role.driver.body")}</p>
          <Link to="/driver">
            <Button block>{t("hub.role.driver.cta")}</Button>
          </Link>
        </Card>
        <Card className={s.roleCard}>
          <h3>{t("hub.role.office.title")}</h3>
          <p>{t("hub.role.office.body")}</p>
          <Link to="/office">
            <Button block>{t("hub.role.office.cta")}</Button>
          </Link>
        </Card>
        <Card className={s.roleCard}>
          <h3>{t("hub.role.sim.title")}</h3>
          <p>{t("hub.role.sim.body")}</p>
          <Link to="/sim">
            <Button block>{t("hub.role.sim.cta")}</Button>
          </Link>
        </Card>
      </div>

      <h2>{t("hub.qrHeading")}</h2>
      <div className={s.qrGrid}>
        {qrHouses.slice(0, 6).map((h) => (
          <InlineQr key={h.houseId} text={`${window.location.origin}/h/${h.token}`} label={`${t("qr.instruction")}: ${h.label}`} />
        ))}
      </div>
      <p>
        <Link to={`/v/${villageId}/qr`}>{t("hub.qrSheetLink")}</Link>
      </p>

      <footer className={s.footer}>
        <span>{t("hub.footer.license")}</span>
        <span>{t("hub.footer.cost")}</span>
        <span>{t("hub.footer.fictional")}</span>
        <a href="https://github.com/Davron2004/imaq">{t("hub.footer.repo")}</a>
      </footer>
    </main>
  );
}
