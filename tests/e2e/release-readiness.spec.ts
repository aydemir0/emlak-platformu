import { expect, test } from "@playwright/test";

test("public discovery remains server-rendered and non-indexable filters stay bounded", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Emlak Platformu" }),
  ).toBeVisible();
  const filtered = await page.goto("/satilik?city=ankara&page=2");
  expect(filtered?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
});

test("CRM, appointment, conversion, and matching screens deny anonymous access", async ({
  page,
}) => {
  for (const path of [
    "/admin/leads",
    "/admin/appointments",
    "/admin/customer-requests/00000000-0000-4000-8000-000000000001",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
  }
});

test("scheduled workers reject browser and unauthenticated invocation", async ({
  request,
}) => {
  const response = await request.post(
    "/api/internal/workers/media-processing",
    { data: {} },
  );
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "unavailable" });
});

test("public media delivery refuses malformed and private-style object paths", async ({
  request,
}) => {
  const malformed = await request.get(
    "/delivery/properties/not-a-property/not-media/1/property-v1/640.svg",
  );
  expect(malformed.status()).toBe(404);
  expect(malformed.headers()["cache-control"]).toBe("no-store");
});
