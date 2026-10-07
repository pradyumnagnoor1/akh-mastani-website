import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
async function login(
  context: BrowserContext,
  request: APIRequestContext,
  role: "admin" | "dancer",
) {
  const session = await (
    await request.get(`http://127.0.0.1:3201/fixture/session?role=${role}`)
  ).json();
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    },
  ]);
}
test("calendar: fresh schedule, stale fallback, Home, private API", async ({
  page,
  context,
  request,
}, info) => {
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=fresh");
  const denied = await request.get("/api/calendar", { maxRedirects: 0 });
  expect([307, 401, 403]).toContain(denied.status());
  await login(context, request, "dancer");
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: "Team practice", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Up to date", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Recurring practice", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/All day/)).toBeVisible();
  const response = await context.request.get("/api/calendar");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await response.json()).events).toHaveLength(2);
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=stale");
  await page.reload();
  await expect(
    page.getByText("Updates delayed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Team practice", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("calendar-stale.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Next practices", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Team practice", { exact: true })).toBeVisible();
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=fresh");
});
