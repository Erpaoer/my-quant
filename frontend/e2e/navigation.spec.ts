import { expect, test } from "@playwright/test";

test.use({ channel: "msedge" });

test("restores the active static module after refresh", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("refreshToken", "test-refresh-token");
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: "test-user",
        username: "test-user",
        email: "test@example.com",
        role: "user",
      }),
    );
  });
  await page.route(/^http:\/\/localhost:3001\/api\//, async (route) => {
    if (route.request().url().endsWith("/auth/me")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: "test-user",
            username: "test-user",
            email: "test@example.com",
            role: "user",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.goto("http://localhost:3001/");
  await expect(page.locator(".v3-layout")).toBeVisible();
  const strategyItem = page.locator(".nav-content .nav-item").nth(1);
  await expect(strategyItem).toBeVisible();
  await strategyItem.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("quant-dashboard-tabs") || "null"),
      ),
    )
    .toMatchObject({ activeTabId: "strategies" });

  await page.reload();

  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("quant-dashboard-tabs") || "null"),
      ),
    )
    .toMatchObject({ activeTabId: "strategies" });
  await expect(page.locator(".tab-item.active")).toHaveCount(1);
});
