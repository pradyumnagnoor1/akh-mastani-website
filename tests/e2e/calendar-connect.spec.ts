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
test("calendar-connect: admin OAuth start, cancellation, replay and disconnect", async ({
  page,
  context,
  request,
}, info) => {
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=fresh");
  await login(context, request, "dancer");
  await page.goto("/admin/calendar");
  await expect(page).toHaveURL(/\/home$/);
  const denied = await context.request.post("/api/calendar/oauth/start", {
    headers: { Origin: "http://127.0.0.1:3102" },
    form: { calendar_id: "fixture-calendar" },
    maxRedirects: 0,
  });
  expect([303, 307]).toContain(denied.status());
  expect(
    new URL(denied.headers()["location"], "http://127.0.0.1:3102").pathname,
  ).toBe("/home");
  await login(context, request, "admin");
  await page.goto("/admin/calendar");
  await expect(
    page.getByRole("button", {
      name: "Reconnect Google Calendar",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Team calendar ID", { exact: true }),
  ).toHaveValue("fixture-calendar");
  expect(await page.content()).not.toContain("fixture-refresh");
  await page.screenshot({
    path: info.outputPath("calendar-connect.png"),
    fullPage: true,
  });
  const response = await context.request.post("/api/calendar/oauth/start", {
    headers: { Origin: "http://127.0.0.1:3102" },
    form: { calendar_id: "fixture-calendar" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  const authorization = new URL(response.headers()["location"]);
  expect(authorization.origin).toBe("https://accounts.google.com");
  expect(authorization.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:3102/api/calendar/oauth/callback",
  );
  expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
  const cookie = (await context.cookies()).find(
    (c) => c.name === "akh-calendar-oauth",
  );
  expect(cookie?.httpOnly).toBe(true);
  const state = authorization.searchParams.get("state");
  await page.goto(
    `/api/calendar/oauth/callback?state=${state}&error=access_denied`,
  );
  await expect(
    page.getByText(
      "Google authorization was cancelled. Your existing connection is unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    (await context.cookies()).some((c) => c.name === "akh-calendar-oauth"),
  ).toBe(false);
  await page.goto(`/api/calendar/oauth/callback?state=${state}&code=replayed`);
  await expect(
    page.getByText(/Couldn’t complete the connection/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Disconnect calendar", exact: true })
    .click();
  await expect(
    page.getByText(
      "Calendar disconnected. The saved schedule has been cleared.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", {
      name: "Calendar connection coming soon",
      exact: true,
    }),
  ).toBeVisible();
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=fresh");
});
