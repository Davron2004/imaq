/** Data + actions for the demo hub. No UI logic here — the View only renders. */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, postJson } from "./api";
import { currentVillageId, setCurrentVillageId, storedVillageId, PRESENTER_VILLAGE_ID } from "./village";
import { getRememberedResidentToken } from "./resident";

export type VillageState = "creating" | "ready" | "resetting" | "failed";

export function useHub() {
  const params = new URLSearchParams(window.location.search);
  const forcePresenter = params.get("village") === PRESENTER_VILLAGE_ID;

  const [villageId, setVillageId] = useState<string>(() => (forcePresenter ? PRESENTER_VILLAGE_ID : currentVillageId()));
  const [state, setState] = useState<VillageState>("creating");

  useEffect(() => {
    let cancelled = false;
    const use = (id: string, next: VillageState) => {
      if (cancelled) return;
      setCurrentVillageId(id);
      setVillageId(id);
      setState(next);
    };
    (async () => {
      if (forcePresenter) return use(PRESENTER_VILLAGE_ID, "ready");
      // Keep whatever village this browser already uses, the presenter village included,
      // unless the server no longer has it (sandboxes are cleaned up after 3 days).
      const stored = storedVillageId();
      if (stored) {
        try {
          await api(`/v/${stored}/snapshot`);
          return use(stored, "ready");
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) return use(stored, "ready");
        }
      }
      setState("creating");
      try {
        const res = await postJson<{ villageId: string }>("/demo/villages", {});
        use(res.villageId, "ready");
      } catch {
        use(PRESENTER_VILLAGE_ID, "failed");
      }
    })();
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
