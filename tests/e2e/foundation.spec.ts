import { expect, test } from "@playwright/test";

test("public foundation renders with security headers", async ({ page }) => {
  const response = await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Emlak Platformu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Ana navigasyon" }),
  ).toBeVisible();
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
});

test("unauthenticated admin navigation fails closed", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Emlak Platformu" }),
  ).toBeVisible();
});

test("unauthenticated property administration fails closed", async ({
  page,
}) => {
  await page.goto("/admin/properties");
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Emlak Platformu" }),
  ).toBeVisible();
});

test("health endpoint returns the readiness envelope", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({
    status: "ok",
    checks: { application: "ready" },
  });
});

test("public listing filter is server-rendered with noindex", async ({ page }) => {
  const response = await page.goto("/satilik?city=ankara&page=2");
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
});
