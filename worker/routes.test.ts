import { describe, expect, it } from "vitest";
import { SqliteD1 } from "./test/d1-sqlite";
import { app } from "./index";
import type { ResidentView, Snapshot } from "../shared/types";

const env = (d: SqliteD1, extra: Record<string, unknown> = {}) => ({ DB: d.asD1(), PRESENTER_VILLAGE_ID: "demo", ...extra }) as unknown as Env;
const json = { "content-type": "application/json" };

describe("routes (Hono app over SQLite)", () => {
  it("auto-seeds the presenter village and serves resident + snapshot", async () => {
    const d = new SqliteD1();
    const e = env(d);
    const view = (await (await app.request("/api/h/demo-h14", {}, e)).json()) as ResidentView;
    expect(view.house.label).toBe("House 14");
    const post = await app.request("/api/h/demo-h14/requests", { method: "POST", headers: json, body: JSON.stringify({ id: "req-route-0001", kind: "out" }) }, e);
    expect(((await post.json()) as ResidentView).water).toMatchObject({ id: "req-route-0001", kind: "out", aheadCount: 4 });
    const snap = (await (await app.request("/api/v/demo/snapshot", {}, e)).json()) as Snapshot;
    expect(snap.houses).toHaveLength(48);
    expect(snap.openRequests.some((r) => r.id === "req-route-0001")).toBe(true);
    expect((await app.request("/api/h/unknown-token", {}, e)).status).toBe(404);
    expect((await app.request("/api/v/nope-village/snapshot", {}, e)).status).toBe(404);
    const bad = await app.request("/api/v/demo/sync", { method: "POST", headers: json, body: JSON.stringify({ deviceId: "d", events: [{ id: "short" }] }) }, e);
    expect(bad.status).toBe(400);
  });

  it("presenter reset needs x-presenter-key when PRESENTER_KEY is set; sandboxes are open", async () => {
    const d = new SqliteD1();
    const e = env(d, { PRESENTER_KEY: "s3cret" });
    await app.request("/api/v/demo/snapshot", {}, e);
    expect((await app.request("/api/v/demo/reset", { method: "POST" }, e)).status).toBe(403);
    expect((await app.request("/api/v/demo/reset", { method: "POST", headers: { "x-presenter-key": "wrong" } }, e)).status).toBe(403);
    expect((await app.request("/api/v/demo/reset", { method: "POST", headers: { "x-presenter-key": "s3cret" } }, e)).status).toBe(200);
    const { villageId } = (await (await app.request("/api/demo/villages", { method: "POST" }, e)).json()) as { villageId: string };
    expect((await app.request(`/api/v/${villageId}/reset`, { method: "POST" }, e)).status).toBe(200);
    const csv = await app.request(`/api/v/${villageId}/deliveries?from=0&to=${Date.now()}&format=csv`, {}, e);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect((await csv.text()).split("\r\n")[0]).toBe("house,delivered_at_local,truck,litres");
  });
});
