import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
async function login(
  context: BrowserContext,
  request: APIRequestContext,
  role = "dancer",
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
test("choreo: protected desktop/mobile navigation, video search/playback and live removal", async ({
  page,
  context,
  request,
}, info) => {
  await request.get("http://127.0.0.1:3201/fixture/choreo?state=populated");
  await page.goto("/choreo");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await login(context, request);
  await page.goto("/home");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "More pages" }).click();
  await page.getByRole("link", { name: "Choreo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choreo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("3 videos", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Finale rehearsal", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("choreo-gallery.png"),
    fullPage: true,
    animations: "disabled",
    style: "nextjs-portal { display: none; }",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Find a video", { exact: true }).fill("Finale");
  await expect(page.locator(".choreo-card")).toHaveCount(1);
  await page.route("https://drive.google.com/file/d/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Fixture Google video player</body></html>",
    }),
  );
  await page
    .getByRole("button", { name: "Watch Finale rehearsal", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    "https://drive.google.com/file/d/finale_fixture_123/preview",
  );
  await page.getByLabel("Find a video", { exact: true }).fill("");
  await request.get("http://127.0.0.1:3201/fixture/choreo?state=empty");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No choreo videos yet", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await expect(
    page.getByRole("heading", { name: "Choreo", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("choreo-empty.png"),
    fullPage: true,
    animations: "disabled",
    style: "nextjs-portal { display: none; }",
  });
  await request.get("http://127.0.0.1:3201/fixture/choreo?state=populated");
});

test("communication: empty announcements use announcement wording and have no deleted view", async ({
  page,
  context,
  request,
}) => {
  await request.get("http://127.0.0.1:3201/fixture/empty-announcements");
  await login(context, request, "admin");
  await page.goto("/announcements");
  await expect(
    page.getByRole("heading", { name: "No announcements", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No open to-dos", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Deleted", exact: true }),
  ).toHaveCount(0);
});
