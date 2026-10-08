import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";

async function login(context: BrowserContext, request: APIRequestContext) {
  const session = await (
    await request.get("http://127.0.0.1:3201/fixture/session?role=dancer")
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

test("pwa: manifest, real worker and private-page offline fallback", async ({
  page,
  context,
  request,
}) => {
  await login(context, request);
  await page.goto("/home");
  const manifestLink = page.locator('link[rel="manifest"]');
  const manifest = await (
    await request.get((await manifestLink.getAttribute("href"))!)
  ).json();
  expect(manifest).toMatchObject({
    name: "AKH Mastani",
    start_url: "/home",
    display: "standalone",
  });
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await page.goto("/payments");
  const cacheState = await page.evaluate(async () => {
    const keys = await caches.keys();
    return Promise.all(
      keys.map(async (key) => ({
        key,
        urls: (await (await caches.open(key)).keys()).map(
          (request) => new URL(request.url).pathname,
        ),
      })),
    );
  });
  expect(cacheState).toEqual([
    { key: "mastani-offline-v1", urls: ["/offline.html"] },
  ]);
  await context.setOffline(true);
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "You’re offline" }),
  ).toBeVisible();
  await expect(
    page.getByText("Reconnect to view the team hub and your latest updates."),
  ).toBeVisible();
  await expect(
    page.getByText(/@tamu\.edu|outstanding|Your membership/i),
  ).toHaveCount(0);
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
});

test("pwa: notification permission is never requested on mount", async ({
  page,
  context,
  request,
}, info) => {
  await page.addInitScript(() => {
    (window as Window & { permissionRequests?: number }).permissionRequests = 0;
    if ("Notification" in window)
      Object.defineProperty(Notification, "requestPermission", {
        configurable: true,
        value: async () => {
          (window as Window & { permissionRequests?: number })
            .permissionRequests!++;
          return "default";
        },
      });
  });
  await login(context, request);
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Loading settings…")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { permissionRequests?: number }).permissionRequests,
    ),
  ).toBe(0);
  if (info.project.name === "mobile") {
    await expect(
      page.getByText(/In Safari, tap Share → Add to Home Screen/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enable notifications" }),
    ).toHaveCount(0);
  }
  await page
    .locator(".notification-settings")
    .screenshot({ path: info.outputPath("notifications.png") });
});

test("pwa: unsupported browser still opens team hub", async ({
  page,
  context,
  request,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: undefined,
    });
    Reflect.deleteProperty(window, "PushManager");
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Unsupported desktop browser",
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 0,
    });
  });
  await login(context, request);
  await page.goto("/home");
  await expect(
    page.getByText(
      "Notifications aren’t supported in this browser. You can still use the team hub.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
});
