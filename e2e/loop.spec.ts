import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Imaq loop", () => {
  test.beforeEach(async ({ request, baseURL }) => {
    await request.post(`${baseURL}/api/v/demo/reset`);
  });

  test("resident request shows up in the office", async ({ page }) => {
    await page.goto("/h/demo-h14");
    await page.getByRole("button", { name: /out of water/i }).click();

    await page.goto("/v/demo/office");
    const row = page.getByRole("listitem").filter({ hasText: "House 14" });
    await expect(row.first()).toBeVisible();
    await expect(row.first()).toContainText("Out of water");
  });

  test("last 7 days lookup returns a non-empty list", async ({ page }) => {
    await page.goto("/v/demo/office");
    await page.getByRole("button", { name: /last 7 days/i }).click();
    await expect(page.locator("p", { hasText: /got water/i })).toBeVisible();
  });

  test("resident screen has no serious or critical accessibility violations", async ({ page }) => {
    await page.goto("/h/demo-h14");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious).toEqual([]);
  });

  test("office screen has no serious or critical accessibility violations", async ({ page }) => {
    await page.goto("/v/demo/office");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious).toEqual([]);
  });
});
