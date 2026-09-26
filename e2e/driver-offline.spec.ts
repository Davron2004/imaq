/**
 * Driver app, offline end to end.
 *
 * Each test works in a fresh sandbox copy of the demo village (POST /api/demo/villages) so the phone and
 * desktop projects can run at the same time without fighting over the same houses. If sandbox creation
 * isn't available it falls back to the presenter village "demo".
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Snapshot } from "../shared/types";

async function villageFor(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/demo/villages").catch(() => null);
  if (res && res.ok()) {
    const body = (await res.json()) as { villageId?: string };
    if (body.villageId) return body.villageId;
  }
  return "demo";
}

async function snapshot(request: APIRequestContext, villageId: string): Promise<Snapshot> {
  const res = await request.get(`/api/v/${villageId}/snapshot`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Snapshot;
}

const syncStatus = (page: Page) => page.getByTestId("sync-status");

async function startShift(page: Page, villageId: string) {
  await page.goto(`/v/${villageId}/driver`);
  await expect(page.getByRole("heading", { name: "Choose your truck" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Truck 1/ }).first().click();
  await page.getByRole("button", { name: "All OK" }).click();
  await expect(page.getByTestId("summary")).toBeVisible();
}

async function syncNow(page: Page) {
  await syncStatus(page).click();
  const btn = page.getByRole("button", { name: "Sync now" });
  if (await btn.isEnabled()) await btn.click();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
}

test("every driver action works offline and syncs exactly once", async ({ page, context, request }) => {
  const villageId = await villageFor(request);
  const before = await snapshot(request, villageId);
  const truck = before.trucks.find((t) => t.label === "Truck 1")!;
  expect(truck, "demo village has a Truck 1").toBeTruthy();
  const waterQueue = before.openRequests.filter((r) => r.kind !== "sewage");
  expect(waterQueue.length, "need two open water requests to deliver and fail").toBeGreaterThanOrEqual(2);
  const busy = new Set(waterQueue.map((r) => r.houseId));
  const litHouse = before.houses.find((h) => !busy.has(h.id) && /\d+/.test(h.label))!;
  const startedAt = Date.now() - 1000;

  await startShift(page, villageId);

  // If an earlier run left Truck 1 down, bring it back while online so "down" below is a fresh event.
  if (truck.status === "down") {
    await page.getByRole("link", { name: "Truck status", exact: true }).click();
    await page.getByRole("button", { name: /is back/ }).click();
    await page.getByRole("link", { name: /Today.s list/ }).first().click();
  }

  await context.setOffline(true);

  // Deliver the first stop.
  const rows = page.getByTestId("stop-list").getByRole("button");
  const deliveredHouse = waterQueue[0].houseLabel;
  await rows.first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Delivered/ }).click();
  await expect(page.getByTestId("announcer")).toHaveText(`Delivered · ${deliveredHouse}`);
  await expect(page.getByTestId("stop-list").getByText(deliveredHouse, { exact: true })).toHaveCount(0);

  // Fail the next one.
  const failedHouse = waterQueue[1].houseLabel;
  await page.getByTestId("stop-list").getByRole("button", { name: new RegExp(`^${failedHouse}\\b`) }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Road blocked" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Couldn't deliver/ }).click();
  await expect(page.getByTestId("stop-list").getByText(/Tried .* Road blocked/).first()).toBeVisible();

  // Lit door with the number pad.
  await page.getByRole("link", { name: "Lit door", exact: true }).click();
  for (const d of litHouse.label.match(/\d+/)![0]) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: `Add ${litHouse.label}` }).click();
  await expect(page.getByTestId("stop-list").getByText(litHouse.label, { exact: true })).toBeVisible();

  // Truck down.
  await page.getByRole("link", { name: "Truck status", exact: true }).click();
  await page.getByRole("button", { name: "Heater" }).click();
  await page.getByRole("button", { name: "Mark Truck 1 down" }).click();
  await expect(page.getByText("Truck 1 is down since")).toBeVisible();

  // A sample voice note (no microphone needed).
  await page.getByRole("link", { name: "Voice note", exact: true }).click();
  await page.getByRole("button", { name: "Sample: heater on Truck 2" }).click();
  await expect(page.getByTestId("note-state").first()).toHaveText("Saved on phone");

  await expect(syncStatus(page)).toContainText("saved on phone");

  // Back online.
  await context.setOffline(false);
  await syncNow(page);
  await expect(syncStatus(page)).toContainText("All synced", { timeout: 30_000 });

  // Sync again: nothing may be applied twice.
  await syncNow(page);
  await expect(syncStatus(page)).toContainText("All synced", { timeout: 30_000 });

  const after = await snapshot(request, villageId);
  const newStops = after.feed.flatMap((f) => (f.kind === "stop" && f.stop.occurredAt >= startedAt ? [f.stop] : []));
  expect(newStops.filter((s) => s.houseLabel === deliveredHouse && s.outcome === "delivered")).toHaveLength(1);
  expect(newStops.filter((s) => s.houseLabel === failedHouse && s.outcome === "failed")).toHaveLength(1);
  expect(newStops).toHaveLength(2);
  expect(after.openRequests.filter((r) => r.houseId === litHouse.id && r.kind !== "sewage")).toHaveLength(1);
  expect(after.openRequests.some((r) => r.houseLabel === deliveredHouse && r.id === waterQueue[0].id)).toBe(false);
  expect(after.trucks.find((t) => t.id === truck.id)!.status).toBe("down");

  // The voice note reaches a draft once online.
  await expect(page.getByTestId("note-state").first()).toHaveText(/Ready to confirm|Needs a human/, { timeout: 30_000 });
});

test("a reload while offline keeps the app and the pending count", async ({ page, context, request }) => {
  const villageId = await villageFor(request);
  await startShift(page, villageId);

  // Cold start offline needs the service worker (production build / preview). The dev server has none.
  const controlled = await page
    .waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!controlled, "No service worker on this server (vite dev). Run against `vite preview` or the deployed app.");

  await context.setOffline(true);
  await page.getByTestId("stop-list").getByRole("button").first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Delivered/ }).click();
  await expect(syncStatus(page)).toContainText("1 saved on phone");

  await page.reload();
  await expect(syncStatus(page)).toContainText("1 saved on phone", { timeout: 15_000 });
  await expect(page.getByTestId("summary")).toBeVisible();

  await context.setOffline(false);
  await syncNow(page);
  await expect(syncStatus(page)).toContainText("All synced", { timeout: 30_000 });
});
