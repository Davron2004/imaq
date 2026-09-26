/** Data + actions for the resident screen. No UI logic here — the View only renders. */
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, postJson, newId, ApiError } from "./api";
import type { ResidentView, RequestKind } from "../../../shared/types";

const TOKEN_KEY = "imaq.residentToken";

export function rememberResidentToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
}

export function getRememberedResidentToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export type ResidentTrack = "water" | "sewage";
const trackOf = (k: RequestKind): ResidentTrack => (k === "sewage" ? "sewage" : "water");

/** What the confirm dialog on screen is asking about, if anything. */
export type PendingConfirm = { kind: RequestKind; mode: "emergency" | "change" } | null;

export function useResident(token: string) {
  const qc = useQueryClient();
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const query = useQuery<ResidentView, ApiError>({
    queryKey: ["resident", token],
    queryFn: () => api<ResidentView>(`/h/${token}`),
    refetchInterval: visible ? 10000 : false,
    refetchIntervalInBackground: false,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const [sendingTrack, setSendingTrack] = useState<ResidentTrack | null>(null);
  const [sendError, setSendError] = useState<ResidentTrack | null>(null);
  const [pending, setPending] = useState<PendingConfirm>(null);

  useEffect(() => {
    if (query.data) rememberResidentToken(token);
  }, [query.data, token]);

  const doSubmit = useCallback(
    async (kind: RequestKind) => {
      const track = trackOf(kind);
      setSendError(null);
      setSendingTrack(track);
      try {
        const next = await postJson<ResidentView>(`/h/${token}/requests`, { id: newId(), kind });
        qc.setQueryData(["resident", token], next);
      } catch {
        setSendError(track);
      } finally {
        setSendingTrack(null);
      }
    },
    [token, qc],
  );

  /** Called when a request button is tapped. Opens a confirm step for Emergency, or for changing an open water level. */
  const requestKind = useCallback(
    (kind: RequestKind) => {
      const view = query.data;
      if (kind === "emergency" && view?.water?.kind !== "emergency") {
        setPending({ kind, mode: "emergency" });
        return;
      }
      if (kind !== "sewage" && kind !== "emergency" && view?.water && view.water.kind !== kind) {
        setPending({ kind, mode: "change" });
        return;
      }
      void doSubmit(kind);
    },
    [query.data, doSubmit],
  );

  const confirmPending = useCallback(() => {
    if (pending) void doSubmit(pending.kind);
    setPending(null);
  }, [pending, doSubmit]);

  const cancelPendingConfirm = useCallback(() => setPending(null), []);

  const cancelRequest = useCallback(
    async (id: string, track: ResidentTrack) => {
      setSendError(null);
      try {
        const next = await postJson<ResidentView>(`/h/${token}/requests/${id}/cancel`, {});
        qc.setQueryData(["resident", token], next);
      } catch {
        setSendError(track);
      }
    },
    [token, qc],
  );

  const status: "loading" | "unknown" | "error" | "ready" = query.isLoading
    ? "loading"
    : query.error instanceof ApiError && query.error.status === 404
      ? "unknown"
      : query.isError
        ? "error"
        : "ready";

  return {
    status,
    view: query.data ?? null,
    sendingTrack,
    sendError,
    pending,
    requestKind,
    confirmPending,
    cancelPendingConfirm,
    cancelRequest,
    retry: () => query.refetch(),
  } as const;
}
