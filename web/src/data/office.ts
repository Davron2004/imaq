/** Data + actions for the water office screen. No UI logic here — the View only renders. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, postJson, newId } from "./api";
import type { DeliveryRow, LogFields, RequestKind, Snapshot, WeeklyRow } from "../../../shared/types";

function useVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return visible;
}

/** Most recent Tuesday 00:00, village-naive (browser local time is close enough for the demo). */
export function mostRecentTuesday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun … 2 = Tue
  const diff = (day - 2 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function useOffice(villageId: string) {
  const qc = useQueryClient();
  const visible = useVisible();
  const query = useQuery<Snapshot>({
    queryKey: ["office", villageId],
    queryFn: () => api<Snapshot>(`/v/${villageId}/snapshot`),
    refetchInterval: visible ? 3000 : false,
    refetchIntervalInBackground: false,
  });

  const seenFlagIds = useRef<Set<string> | null>(null);
  const [newFlagIds, setNewFlagIds] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!query.data) return;
    const ids = query.data.flags.map((f) => f.id);
    if (seenFlagIds.current === null) {
      seenFlagIds.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seenFlagIds.current!.has(id));
    if (fresh.length > 0) {
      setNewFlagIds((prev) => new Set([...prev, ...fresh]));
      const flag = query.data!.flags.find((f) => f.id === fresh[0]);
      if (flag) setAnnouncement(`New flag: ${flag.subject}`);
      for (const id of ids) seenFlagIds.current!.add(id);
    }
  }, [query.data]);

  const invalidate = useCallback((next: Snapshot) => qc.setQueryData(["office", villageId], next), [qc, villageId]);

  const addRequest = useCallback(
    async (houseId: string, kind: RequestKind) => {
      const next = await postJson<Snapshot>(`/v/${villageId}/requests`, { id: newId(), houseId, kind });
      invalidate(next);
    },
    [villageId, invalidate],
  );

  const cancelRequest = useCallback(
    async (id: string) => {
      const next = await postJson<Snapshot>(`/v/${villageId}/requests/${id}/cancel`, {});
      invalidate(next);
    },
    [villageId, invalidate],
  );

  const confirmLog = useCallback(
    async (voiceNoteId: string | null, fields: LogFields) => {
      const next = await postJson<Snapshot>(`/v/${villageId}/log-entries`, { id: newId(), voiceNoteId, fields });
      invalidate(next);
    },
    [villageId, invalidate],
  );

  const [resetting, setResetting] = useState(false);
  const reset = useCallback(async () => {
    setResetting(true);
    try {
      await postJson(`/v/${villageId}/reset`, {});
      await query.refetch();
    } finally {
      setResetting(false);
    }
  }, [villageId, query]);

  return {
    status: query.isLoading ? "loading" : query.isError ? "error" : ("ready" as const),
    snapshot: query.data ?? null,
    newFlagIds,
    announcement,
    addRequest,
    cancelRequest,
    confirmLog,
    reset,
    resetting,
    retry: () => query.refetch(),
  } as const;
}

export function useDeliveryLookup(villageId: string) {
  const [from, setFrom] = useState<number>(() => mostRecentTuesday(Date.now()));
  const [to, setTo] = useState<number>(() => Date.now());
  const [rows, setRows] = useState<DeliveryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const run = useCallback(async (f = from, t2 = to) => {
    setLoading(true);
    setError(false);
    try {
      const data = await api<DeliveryRow[]>(`/v/${villageId}/deliveries?from=${f}&to=${t2}`);
      setRows(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [villageId, from, to]);

  const homeCount = useMemo(() => (rows ? new Set(rows.map((r) => r.houseId)).size : 0), [rows]);

  const csvUrl = `/api/v/${villageId}/deliveries?from=${from}&to=${to}&format=csv`;

  const copyList = useCallback(async () => {
    if (!rows) return;
    const text = rows.map((r) => r.houseLabel).join("\n");
    await navigator.clipboard.writeText(text);
  }, [rows]);

  return { from, to, setFrom, setTo, rows, loading, error, run, homeCount, csvUrl, copyList } as const;
}

export function useWeekly(villageId: string) {
  const query = useQuery<WeeklyRow[]>({
    queryKey: ["office-weekly", villageId],
    queryFn: () => api<WeeklyRow[]>(`/v/${villageId}/weekly`),
  });
  return { rows: query.data ?? [], csvUrl: `/api/v/${villageId}/weekly?format=csv` } as const;
}
