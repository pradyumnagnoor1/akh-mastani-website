import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

async function login(
  context: BrowserContext,
  request: APIRequestContext,
  role = "admin",
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
async function pull(page: Page, distance: number, cancel = false) {
  await page.evaluate(
    ({ distance, cancel }) => {
      const target = document.querySelector("h1")!;
      const touch = (y: number) =>
        new Touch({ identifier: 1, target, clientX: 100, clientY: y });
      target.dispatchEvent(
        new TouchEvent("touchstart", { bubbles: true, touches: [touch(100)] }),
      );
      target.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          touches: [touch(100 + distance)],
        }),
      );
      if (!cancel) return;
      target.dispatchEvent(
        new TouchEvent("touchcancel", { bubbles: true, touches: [] }),
      );
    },
    { distance, cancel },
  );
}

test("refresh: automatic updates show another dancer's changes without reloading", async ({
  page,
  context,
  request,
  browser,
}) => {
  await login(context, request);
  await page.goto("/announcements/new");
  const title = `Refresh test ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Details", { exact: true }).fill("Original details");
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.clock.install();
  await dancer.goto(page.url());
  await page
    .getByRole("link", { name: "Edit announcement", exact: true })
    .click();
  await page
    .getByLabel("Details", { exact: true })
    .fill("Updated details from admin");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Updated details from admin", { exact: true }),
  ).toBeVisible();
  await dancer.bringToFront();
  await dancer.clock.runFor(30_100);
  await expect(
    dancer.getByText("Updated details from admin", { exact: true }),
  ).toBeVisible();
  await dancerContext.close();
});

test("refresh: unsaved changes pause polling and pull, including after blur", async ({
  page,
  context,
  request,
}) => {
  await login(context, request);
  await page.clock.install();
  await page.goto("/todos/new");
  await page.getByLabel("Title", { exact: true }).fill("Keep my draft");
  await page.getByRole("heading", { level: 1 }).click();
  let refreshes = 0;
  page.on("request", (request) => {
    if (request.url().includes("_rsc=")) refreshes++;
  });
  await page.clock.runFor(30_100);
  expect(refreshes).toBe(0);
  await pull(page, 160);
  await page.evaluate(() =>
    document
      .querySelector("h1")!
      .dispatchEvent(
        new TouchEvent("touchend", { bubbles: true, touches: [] }),
      ),
  );
  await expect(
    page.getByText("Finish or reset your changes before refreshing."),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep my draft",
  );
  expect(refreshes).toBe(0);
});

test("refresh: pull circle, cancellation and completed refresh", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request);
  await page.goto("/home");
  await page
    .getByRole("heading", { name: "Notifications", exact: true })
    .waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await pull(page, 40);
  await expect(
    page.getByRole("status", { name: "Pull to refresh" }),
  ).toBeVisible();
  await page.evaluate(() =>
    document
      .querySelector("h1")!
      .dispatchEvent(
        new TouchEvent("touchcancel", { bubbles: true, touches: [] }),
      ),
  );
  await expect(page.locator(".page-refresh-indicator")).toHaveCount(0);
  await pull(page, 160);
  await expect(
    page.getByRole("status", { name: "Release to refresh" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("pull-refresh.png") });
  const response = page.waitForResponse(
    (response) =>
      response.url().includes("_rsc=") && response.url().includes("/home"),
  );
  await page.evaluate(() =>
    document
      .querySelector("h1")!
      .dispatchEvent(
        new TouchEvent("touchend", { bubbles: true, touches: [] }),
      ),
  );
  expect((await response).ok()).toBe(true);
  await expect(page.locator(".page-refresh-indicator")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
});

test("refresh: roster search and validation-disabled forms remain refreshable", async ({
  page,
  context,
  request,
}) => {
  await login(context, request);
  await page.clock.install();
  await page.goto("/roster");
  await page.getByRole("textbox", { name: "Search roster" }).fill("Anika");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=Anika/);
  await page.getByRole("heading", { name: "Roster", exact: true }).click();
  await expect
    .poll(async () => {
      await pull(page, 40);
      return page.locator(".page-refresh-indicator").count();
    })
    .toBe(1);
  await page.evaluate(() =>
    document
      .querySelector("h1")!
      .dispatchEvent(
        new TouchEvent("touchcancel", { bubbles: true, touches: [] }),
      ),
  );
  const response = page.waitForResponse(
    (r) => r.url().includes("_rsc=") && r.url().includes("/roster"),
  );
  await page.clock.runFor(30_100);
  expect((await response).ok()).toBe(true);
  await expect(page.locator(".page-refresh-indicator")).toHaveCount(0);
  await pull(page, 160);
  const pulled = page.waitForResponse(
    (r) => r.url().includes("_rsc=") && r.url().includes("/roster"),
  );
  await page.evaluate(() =>
    document
      .querySelector("h1")!
      .dispatchEvent(
        new TouchEvent("touchend", { bubbles: true, touches: [] }),
      ),
  );
  expect((await pulled).ok()).toBe(true);
  await page.goto("/payments/new");
  const payment = page.waitForResponse(
    (r) => r.url().includes("_rsc=") && r.url().includes("/payments/new"),
  );
  await page.clock.runFor(30_100);
  expect((await payment).ok()).toBe(true);
});

test("refresh: pauses offline and hidden, resumes online, and avoids overlapping requests", async ({
  page,
  context,
  request,
}) => {
  await login(context, request);
  await page.clock.install();
  await page.goto("/home");
  await page
    .getByRole("heading", { name: "Notifications", exact: true })
    .waitFor();
  let refreshes = 0;
  page.on("request", (r) => {
    if (r.url().includes("_rsc=")) refreshes++;
  });
  await context.setOffline(true);
  await page.clock.runFor(30_100);
  expect(refreshes).toBe(0);
  const onlineResponse = page.waitForResponse((r) => r.url().includes("_rsc="));
  await context.setOffline(false);
  expect((await onlineResponse).ok()).toBe(true);
  await expect(page.locator(".page-refresh-indicator")).toHaveCount(0);
  await page.evaluate(() =>
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    }),
  );
  const previous = refreshes;
  await page.clock.runFor(30_100);
  expect(refreshes).toBe(previous);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*_rsc=*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("status", { name: "Refreshing page" }),
  ).toBeVisible();
  expect(refreshes).toBe(previous + 1);
  await page.clock.runFor(60_100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(refreshes).toBe(previous + 1);
  release();
  await expect(page.locator(".page-refresh-indicator")).toHaveCount(0);
});
