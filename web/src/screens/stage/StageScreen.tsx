import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api } from "../../data/api";
import { t } from "../../i18n";
import s from "./Stage.module.css";

const OFFLINE_KEY = "imaq.forceOffline";

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

  return (
    <main className={s.page}>
      <div className={s.phones}>
        <div className={s.phoneFrame}>
          <div className={s.phoneLabel}>{t("stage.resident")}</div>
          {token && <iframe title={t("stage.resident")} src={`/h/${token}`} />}
        </div>
        <div className={s.phoneFrame}>
          <div className={s.phoneLabel}>{t("stage.driver")}</div>
          <iframe title={t("stage.driver")} src={`/v/${villageId}/driver`} />
          <div className={s.switchRow}>
            <label>
              <input type="checkbox" checked={offline} onChange={toggleOffline} /> {t("stage.offlineSwitch")}
            </label>
          </div>
        </div>
      </div>
      <div className={s.officeFrame}>
        <div className={s.phoneLabel}>{t("stage.office")}</div>
        <iframe title={t("stage.office")} src={`/v/${villageId}/office`} />
      </div>
    </main>
  );
}
