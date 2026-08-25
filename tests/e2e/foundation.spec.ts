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
  const policy = response?.headers()["content-security-policy"] ?? "";
  const scriptSource = policy
    .split("; ")
    .find((directive) => directive.startsWith("script-src"));
  expect(scriptSource).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=_-]+'/);
  expect(scriptSource).not.toContain("unsafe-inline");
  expect(scriptSource).not.toContain("unsafe-eval");
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

test("health endpoint returns the minimal liveness envelope", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  const body = await response.json();
  expect(body).toEqual({
    status: "ok",
    environment: expect.stringMatching(/^(local|test|preview|production)$/),
    release: expect.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
  });
  expect(body).not.toHaveProperty("checks");
});

test("public listing filter is server-rendered with noindex", async ({
  page,
}) => {
  const response = await page.goto("/satilik?city=ankara&page=2");
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
});

test("robots keeps public routes crawlable and excludes private boundaries", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  const body = await response.text();

  expect(response.ok()).toBe(true);
  expect(body).toContain("Disallow: /admin/");
  expect(body).toContain("Disallow: /customer-requests/");
  expect(body).not.toMatch(/^Disallow: \/$/m);
});
