import { describe, expect, it } from "vitest";
import {
  downHistory,
  formatLocal,
  houseRepairs,
  loadsNeeded,
  orderQueue,
  placeInLine,
  queueFor,
  recurringTruckProblems,
  snowClearing,
  startOfLocalDay,
  startOfLocalWeek,
  waitingTooLong,
  weekly,
  type FailedStopLite,
} from "./rules";
import { DEFAULT_CONFIG, type LogEntry, type RequestKind } from "./types";

const H = 3_600_000;
const D = 86_400_000;
const TZ = "America/Toronto";
const NOW = Date.UTC(2026, 8, 26, 18, 30); // Sat 26 Sep 2026 14:30 EDT

const entry = (id: string, over: Partial<LogEntry>): LogEntry => ({
  id,
  aboutTruckId: null,
  aboutHouseId: null,
  type: "other",
  category: null,
  severity: null,
  summary: "",
  source: "voice",
  voiceNoteId: id,
  transcript: null,
  language: null,
  occurredAt: NOW,
  confirmedAt: NOW,
  ...over,
});
const heater = (id: string, daysAgo: number, truck = "t2") =>
  entry(id, { type: "truck_problem", aboutTruckId: truck, category: "heater", occurredAt: NOW - daysAgo * D, confirmedAt: NOW - daysAgo * D });
const TRUCKS = [{ id: "t2", label: "Truck 2" }, { id: "t1", label: "Truck 1" }];
const HOUSES = [{ id: "h7", label: "House 7" }, { id: "h22", label: "House 22" }];
const r = (id: string, kind: RequestKind, createdAt: number) => ({ id, kind, createdAt });

describe("orderQueue / queueFor / placeInLine / loadsNeeded", () => {
  it("emergency → out → soon, oldest first within each", () => {
    const q = orderQueue([r("a", "soon", 1), r("b", "out", 5), r("c", "emergency", 9), r("d", "out", 2), r("e", "sewage", 0), r("f", "soon", 0)]);
    expect(q.map((x) => x.id)).toEqual(["c", "d", "b", "f", "a", "e"]);
  });
  it("sewage has its own queue", () => {
    const all = [r("a", "soon", 1), r("s1", "sewage", 5), r("s2", "sewage", 2), r("b", "emergency", 9)];
    expect(queueFor(all, "water").map((x) => x.id)).toEqual(["b", "a"]);
    expect(queueFor(all, "sewage").map((x) => x.id)).toEqual(["s2", "s1"]);
    expect(placeInLine(all, "a")).toBe(1);
    expect(placeInLine(all, "s1")).toBe(1);
    expect(placeInLine(all, "b")).toBe(0);
    expect(placeInLine(all, "missing")).toBe(-1);
  });
  it("loadsNeeded rounds up", () => {
    expect(loadsNeeded(0, 13600)).toBe(0);
    expect(loadsNeeded(13600, 13600)).toBe(1);
    expect(loadsNeeded(13601, 13600)).toBe(2);
  });
});

describe("waitingTooLong", () => {
  it("only Out of water, strictly longer than the threshold", () => {
    const open = [r("a", "out", NOW - 25 * H), r("b", "out", NOW - 24 * H), r("c", "emergency", NOW - 40 * H), r("d", "soon", NOW - 30 * H), r("e", "out", NOW - 30 * H)];
    expect(waitingTooLong(open, DEFAULT_CONFIG, NOW)).toEqual(["e", "a"]);
  });
});

describe("recurringTruckProblems (3 within 7 days)", () => {
  it("2 reports: no flag", () => {
    expect(recurringTruckProblems([heater("a", 4), heater("b", 2)], TRUCKS, DEFAULT_CONFIG, NOW)).toEqual([]);
  });
  it("3 reports within 7 days: flag, with those entries as the explanation", () => {
    const flags = recurringTruckProblems([heater("a", 4), heater("b", 2), heater("c", 0)], TRUCKS, DEFAULT_CONFIG, NOW);
    expect(flags).toEqual([
      { id: "mechanic:t2:heater", kind: "mechanic", truckId: "t2", houseId: null, category: "heater", subject: "Truck 2 · Heater", entryIds: ["a", "b", "c"], raisedAt: NOW },
    ]);
  });
  it("3 reports spread over 8 days: no flag", () => {
    expect(recurringTruckProblems([heater("a", 8), heater("b", 4), heater("c", 0)], TRUCKS, DEFAULT_CONFIG, NOW)).toEqual([]);
  });
  it("different trucks or categories don't add up", () => {
    const es = [heater("a", 1), heater("b", 1, "t1"), entry("c", { type: "truck_problem", aboutTruckId: "t2", category: "pump", occurredAt: NOW })];
    expect(recurringTruckProblems(es, TRUCKS, DEFAULT_CONFIG, NOW)).toEqual([]);
  });
});

describe("snowClearing", () => {
  it("road-blocked entries confirmed today (village time), plus today's road-blocked failed stops", () => {
    const today = startOfLocalDay(NOW, TZ);
    const es = [
      entry("y", { type: "road_blocked", aboutHouseId: "h7", confirmedAt: today - 60_000 }),
      entry("t", { type: "road_blocked", aboutHouseId: "h7", confirmedAt: today + H }),
      entry("n", { type: "road_blocked", summary: "Drift on West road", confirmedAt: today + 2 * H }),
    ];
    const stops: FailedStopLite[] = [{ id: "s1", houseId: "h22", reason: "road_blocked", occurredAt: today + 3 * H, voided: false, outcome: "failed" }];
    const flags = snowClearing(es, stops, HOUSES, TZ, NOW);
    expect(flags.map((f) => [f.id, f.subject, f.entryIds, f.stopIds])).toEqual([
      ["snow:h22", "House 22", [], ["s1"]],
      ["snow:entry:n", "Drift on West road", ["n"], []],
      ["snow:h7", "House 7", ["t"], []],
    ]);
  });
});

describe("houseRepairs", () => {
  it("house problems and frozen-pipe failed stops in the last 14 days, one flag per house", () => {
    const es = [
      entry("hp", { type: "house_problem", aboutHouseId: "h22", occurredAt: NOW - 3 * D }),
      entry("old", { type: "house_problem", aboutHouseId: "h7", occurredAt: NOW - 15 * D }),
    ];
    const stops: FailedStopLite[] = [
      { id: "s1", houseId: "h22", reason: "frozen_pipe", occurredAt: NOW - 3 * D, voided: false, outcome: "failed" },
      { id: "s2", houseId: "h7", reason: "no_access", occurredAt: NOW - D, voided: false, outcome: "failed" },
      { id: "s3", houseId: "h7", reason: "frozen_pipe", occurredAt: NOW - D, voided: true, outcome: "failed" },
    ];
    const flags = houseRepairs(es, stops, HOUSES, NOW);
    expect(flags).toEqual([
      { id: "repair:h22", kind: "repair", truckId: null, houseId: "h22", category: null, subject: "House 22", entryIds: ["hp"], stopIds: ["s1"], raisedAt: NOW - 3 * D },
    ]);
  });
});

describe("downHistory", () => {
  it("pairs down/back, completed periods only, most recent first, 1 decimal", () => {
    const ev = (id: string, kind: "down" | "back", daysAgo: number, reason: string | null = null) => ({ id, kind, reason, occurredAt: NOW - daysAgo * D });
    const st = downHistory([
      ev("b3", "back", 64), ev("d3", "down", 80, "starting"),
      ev("d2", "down", 40, "pump"), ev("b2", "back", 31),
      ev("d1", "down", 10, "heater"), ev("d1b", "down", 9, "again"), ev("b1", "back", 6), ev("b1b", "back", 5.5),
      ev("d0", "down", 0.55, "tires"),
    ]);
    expect(st.downHistoryDays).toEqual([4, 9, 16]);
    expect(st.downSince).toBe(NOW - 0.55 * D);
    expect(st.downReason).toBe("tires");
    expect(downHistory([ev("x", "down", 1.26), ev("y", "back", 0)]).downHistoryDays).toEqual([1.3]);
    expect(downHistory([])).toMatchObject({ downSince: null, downReason: null, downHistoryDays: [] });
  });
});

describe("village time", () => {
  it("day and Monday-week starts in the village timezone", () => {
    expect(new Date(startOfLocalDay(NOW, TZ)).toISOString()).toBe("2026-09-26T04:00:00.000Z");
    expect(new Date(startOfLocalWeek(NOW, TZ)).toISOString()).toBe("2026-09-21T04:00:00.000Z");
    // 23:30 local on Sunday is still the previous week; 00:30 Monday UTC-wise is Sunday evening locally.
    expect(new Date(startOfLocalWeek(Date.UTC(2026, 8, 28, 3, 30), TZ)).toISOString()).toBe("2026-09-21T04:00:00.000Z");
    // Across the DST change (Nov 1 2026): Monday Nov 2 starts at 05:00Z.
    expect(new Date(startOfLocalWeek(Date.UTC(2026, 10, 4, 12), TZ)).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(formatLocal(NOW, TZ)).toBe("2026-09-26 14:30");
  });
});

describe("weekly", () => {
  it("counts deliveries, couldn't-deliver, homes that waited over 24 h and truck-down days per Monday week", () => {
    const wk = startOfLocalWeek(NOW, TZ); // Mon 21 Sep
    const prev = wk - 7 * D;
    const rows = weekly(
      {
        stops: [
          { houseId: "h1", outcome: "delivered", occurredAt: wk + H, voided: false },
          { houseId: "h1", outcome: "delivered", occurredAt: wk + 2 * H, voided: true },
          { houseId: "h2", outcome: "failed", occurredAt: wk + 3 * H, voided: false },
          { houseId: "h3", outcome: "delivered", occurredAt: prev + H, voided: false },
        ],
        requests: [
          { houseId: "h1", kind: "out", createdAt: wk + H, closedAt: wk + 30 * H }, // waited > 24 h
          { houseId: "h1", kind: "emergency", createdAt: wk + 2 * H, closedAt: null }, // same house, counted once
          { houseId: "h2", kind: "out", createdAt: wk + H, closedAt: wk + 5 * H }, // served in time
          { houseId: "h3", kind: "soon", createdAt: prev, closedAt: prev + 50 * H }, // soon doesn't count
          { houseId: "h4", kind: "out", createdAt: wk - 12 * H, closedAt: null }, // crossed 24 h this week
        ],
        truckEvents: [[
          { id: "d", kind: "down", reason: "heater", occurredAt: wk - D },
          { id: "b", kind: "back", reason: null, occurredAt: wk + 2 * D },
        ]],
      },
      DEFAULT_CONFIG,
      TZ,
      NOW,
    );
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({ weekStart: wk, deliveries: 1, couldntDeliver: 1, homesWaitedOver24h: 2, truckDownDays: 2 });
    expect(rows[1]).toEqual({ weekStart: prev, deliveries: 1, couldntDeliver: 0, homesWaitedOver24h: 0, truckDownDays: 1 });
    expect(rows[5]!.weekStart).toBe(wk - 35 * D);
  });
});
