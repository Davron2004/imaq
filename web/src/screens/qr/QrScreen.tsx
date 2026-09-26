import { useEffect, useState } from "react";
import { useParams } from "react-router";
import QRCode from "qrcode";
import { api } from "../../data/api";
import { Button } from "../../ui";
import { t } from "../../i18n";
import s from "./Qr.module.css";

interface QrHouse {
  houseId: string;
  label: string;
  token: string;
}

function QrCard({ house }: { house: QrHouse }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(`${window.location.origin}/h/${house.token}`, { type: "svg", margin: 1, width: 320 }).then((out) => {
      if (!cancelled) setSvg(out);
    });
    return () => {
      cancelled = true;
    };
  }, [house.token]);
  return (
    <div className={s.card}>
      <div role="img" aria-label={`${t("qr.instruction")}: ${house.label}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <p className={s.label}>{house.label}</p>
      <p className={s.instruction}>{t("qr.instruction")}</p>
      <p className={s.instruction}>{t("qr.doorLight")}</p>
    </div>
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
    <main className={s.page}>
      <Button className={s.printBtn} onClick={() => window.print()}>
        {t("qr.print")}
      </Button>
      {error && <p>{t("qr.error")}</p>}
      {!houses && !error && <p>{t("qr.loading")}</p>}
      {houses && (
        <div className={s.grid}>
          {houses.map((h) => (
            <QrCard key={h.houseId} house={h} />
          ))}
        </div>
      )}
    </main>
  );
}
