import { useEffect, useState } from "react";
import { useParams } from "react-router";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { api } from "../../data/api";
import { Button } from "../../ui";
import { t } from "../../i18n";
import { SiteHeader } from "../shared/SiteHeader";
import s from "./Qr.module.css";

interface QrHouse {
  houseId: string;
  label: string;
  token: string;
}

function QrCard({ house }: { house: QrHouse }) {
  const [svg, setSvg] = useState("");
  const url = `${window.location.origin}/h/${house.token}`;
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 240 }).then((out) => {
      if (!cancelled) setSvg(out);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <article className={s.sticker}>
      <h2>{house.label}</h2>
      <div className={s.code} role="img" aria-label={`${t("qr.instruction")}: ${house.label}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <p className={s.instruction}>{t("qr.instruction")}</p>
      <small>{t("qr.doorLight")}</small>
      <a href={`/h/${house.token}`} className={s.url}>
        {url}
      </a>
    </article>
  );
}

export default function QrScreen() {
  const { villageId = "demo" } = useParams();
  const [houses, setHouses] = useState<QrHouse[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<QrHouse[]>(`/v/${villageId}/qr`)
      .then(setHouses)
      .catch(() => setError(true));
  }, [villageId]);

  return (
    <>
      <div className={s.noPrint}>
        <SiteHeader />
      </div>
      <main className={s.page}>
        <div className={`${s.heading} ${s.noPrint}`}>
          <div>
            <span className="eyebrow">{t("qr.eyebrow")}</span>
            <h1>{t("qr.headline")}</h1>
            <p className="muted">{t("qr.intro")}</p>
          </div>
          <Button icon={<Printer />} onClick={() => window.print()}>
            {t("qr.print")}
          </Button>
        </div>
        {error && <p role="alert">{t("qr.error")}</p>}
        {!houses && !error && <p aria-busy="true">{t("qr.loading")}</p>}
        {houses && (
          <div className={s.grid}>
            {houses.map((h) => (
              <QrCard key={h.houseId} house={h} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
