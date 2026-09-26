import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { api } from "../../data/api";
import { t } from "../../i18n";
import { SiteHeader } from "../shared/SiteHeader";
import s from "./Stage.module.css";

const OFFLINE_KEY = "imaq.forceOffline";

function Panel({ title, to, src, children, wide }: { title: string; to: string | null; src: string | null; children?: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`${s.panel} ${wide ? s.wide : ""}`} aria-label={title}>
      <header className={s.panelHead}>
        <h2>{title}</h2>
        {to && (
          <Link to={to} className={s.openFull}>
            {t("stage.openFull")}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        )}
      </header>
      {src ? <iframe title={title} src={src} allow="microphone" /> : <div className={s.placeholder}>{t("stage.loading")}</div>}
      {children}
    </section>
  );
}

export default function StageScreen() {
  const { villageId = "demo" } = useParams();
  const [token, setToken] = useState<string | null>(null);
  const [offline, setOffline] = useState(() => {
    try {
      return localStorage.getItem(OFFLINE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    api<{ houseId: string; label: string; token: string }[]>(`/v/${villageId}/qr`)
      .then((houses) => {
        const house14 = houses.find((h) => h.label === "House 14") ?? houses[0];
        setToken(house14?.token ?? null);
      })
      .catch(() => setToken(null));
  }, [villageId]);

  const toggleOffline = () => {
    const next = !offline;
    setOffline(next);
    try {
      if (next) localStorage.setItem(OFFLINE_KEY, "1");
      else localStorage.removeItem(OFFLINE_KEY);
    } catch {
      /* ignore */
    }
  };

  const residentPath = token ? `/h/${token}` : null;
  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <div className={s.heading}>
          <span className="eyebrow">{t("stage.eyebrow")}</span>
          <h1>{t("stage.headline")}</h1>
          <p className="muted">{t("stage.subtitle")}</p>
        </div>
        <div className={s.grid}>
          <Panel title={t("stage.resident")} to={residentPath} src={residentPath} />
          <Panel title={t("stage.driver")} to={`/v/${villageId}/driver`} src={`/v/${villageId}/driver`}>
            <label className={s.switchRow}>
              <input type="checkbox" checked={offline} onChange={toggleOffline} />
              <span>{t("stage.offlineSwitch")}</span>
            </label>
          </Panel>
          <Panel title={t("stage.office")} to={`/v/${villageId}/office`} src={`/v/${villageId}/office?embed=1`} wide />
        </div>
      </main>
    </>
  );
}
