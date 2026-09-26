/** Data + actions for the demo hub. No UI logic here — the View only renders. */
import { useCallback, useEffect, useState } from "react";
import { api, postJson } from "./api";
import { currentVillageId, setCurrentVillageId, PRESENTER_VILLAGE_ID } from "./village";
import { getRememberedResidentToken } from "./resident";

export type VillageState = "creating" | "ready" | "resetting" | "failed";

export function useHub() {
  const params = new URLSearchParams(window.location.search);
  const forcePresenter = params.get("village") === PRESENTER_VILLAGE_ID;

  const [villageId, setVillageId] = useState<string>(() => (forcePresenter ? PRESENTER_VILLAGE_ID : currentVillageId()));
  const [state, setState] = useState<VillageState>("creating");

  useEffect(() => {
    if (forcePresenter) {
      setCurrentVillageId(PRESENTER_VILLAGE_ID);
      setVillageId(PRESENTER_VILLAGE_ID);
      setState("ready");
      return;
    }
    const existing = currentVillageId();
    if (existing && existing !== PRESENTER_VILLAGE_ID) {
      setVillageId(existing);
      setState("ready");
      return;
    }
    let cancelled = false;
    setState("creating");
    postJson<{ villageId: string }>("/demo/villages", {})
      .then((res) => {
        if (cancelled) return;
        setCurrentVillageId(res.villageId);
        setVillageId(res.villageId);
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentVillageId(PRESENTER_VILLAGE_ID);
        setVillageId(PRESENTER_VILLAGE_ID);
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcePresenter]);

  const reset = useCallback(async () => {
    setState("resetting");
    try {
      await postJson(`/v/${villageId}/reset`, {});
    } finally {
      setState("ready");
    }
  }, [villageId]);

  const [qrHouses, setQrHouses] = useState<{ houseId: string; label: string; token: string }[]>([]);
  useEffect(() => {
    if (state !== "ready") return;
    api<{ houseId: string; label: string; token: string }[]>(`/v/${villageId}/qr`)
      .then(setQrHouses)
      .catch(() => setQrHouses([]));
  }, [villageId, state]);

  return {
    villageId,
    state,
    reset,
    qrHouses,
    myHouseToken: getRememberedResidentToken(),
  } as const;
}
