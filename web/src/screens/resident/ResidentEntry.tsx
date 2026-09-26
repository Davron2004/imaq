/** `/resident`: open House 14 of the current village (the header's "Resident" link). */
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { api } from "../../data/api";
import { currentVillageId } from "../../data/village";
import { t } from "../../i18n";

export default function ResidentEntry() {
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    const v = currentVillageId();
    api<{ label: string; token: string }[]>(`/v/${v}/qr`)
      .then((rows) => setTo(`/h/${(rows.find((r) => r.label === "House 14") ?? rows[0]).token}`))
      .catch(() => setTo("/"));
  }, []);
  return to ? <Navigate to={to} replace /> : <p className="app-loading">{t("header.opening")}</p>;
}
