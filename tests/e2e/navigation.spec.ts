import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
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

test("navigation: brand returns home and nested pages retain section selection", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request);
  await page.goto("/calendar/featured/new");
  const mobile = info.project.name === "mobile";
  const nav = page.getByRole("navigation", {
    name: mobile ? "Quick navigation" : "Main navigation",
  });
  await expect(
    nav.getByRole("link", {
      name: mobile ? "Calendar" : "Practice Calendar",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .locator(mobile ? ".mobile-header" : ".sidebar")
    .getByRole("link", { name: "AKH Mastani home" })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    nav.getByRole("link", { name: "Home", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Your to-dos" }),
  ).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("home-redesign.png"),
    fullPage: true,
    animations: "disabled",
    style: "nextjs-portal { display: none; }",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("navigation: mobile menu supports focus, all pages, and drafts", async ({
  page,
  context,
  request,
}, info) => {
  test.skip(info.project.name !== "mobile", "Mobile navigation interaction");
  await login(context, request);
  await page.goto("/home");
  const more = page.getByRole("button", { name: "More pages" });
  const menu = page.getByRole("dialog", { name: "Team navigation" });
  await more.click();
  await expect(menu).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(
    menu.getByRole("link", { name: "Admin", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await menu.getByRole("button", { name: "Sign out" }).focus();
  await page.keyboard.press("Tab");
  // Chrome may include its browser chrome before wrapping the native modal.
  // No background application control may receive focus.
  if (await page.evaluate(() => document.activeElement === document.body)) {
    await page.keyboard.press("Tab");
  }
  await expect(
    menu.getByRole("link", { name: "AKH Mastani home" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(more).toBeFocused();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  await more.click();
  await menu.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page).toHaveURL(/\/payments$/);
  await expect(menu).not.toBeVisible();
  await more.click();
  await expect(
    menu.getByRole("link", { name: "Payments", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await menu.getByRole("link", { name: "AKH Mastani home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(menu).not.toBeVisible();
  await more.click();
  await expect(
    menu.getByRole("link", { name: "Roster", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Set Design", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Admin", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("mobile-menu.png") });
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Quick navigation" })
    .getByRole("link", { name: "To-Dos", exact: true })
    .click();
  await page.getByRole("link", { name: "Create to-do", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Preserve my draft");
  await expect(
    page.getByRole("navigation", { name: "Quick navigation" }),
  ).not.toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(
    page.getByRole("navigation", { name: "Quick navigation" }),
  ).toBeVisible();
  await more.click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Preserve my draft",
  );
  await more.click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(menu).not.toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Preserve my draft",
  );
});

test("navigation: narrow layouts keep controls accessible and dancer permissions intact", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request, "dancer");
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 640 });
  for (const route of [
    "/home",
    "/roster",
    "/calendar",
    "/payments",
    "/segments",
    "/choreo",
    "/announcements",
    "/todos",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route,
    ).toBe(true);
  }
  if (info.project.name === "mobile") {
    const quick = page.getByRole("navigation", { name: "Quick navigation" });
    for (const link of await quick.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "More pages" }).click();
    const menu = page.getByRole("dialog", { name: "Team navigation" });
    await expect(
      menu.getByRole("link", { name: "Admin", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/home");
    const last = page.getByRole("heading", {
      name: "Notifications",
      exact: true,
    });
    await last.scrollIntoViewIfNeeded();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const settings = await page.locator(".notification-settings").boundingBox();
    const bar = await quick.boundingBox();
    expect(settings!.y + settings!.height).toBeLessThanOrEqual(bar!.y);
    await page.getByRole("heading", { name: "Home", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("narrow-home.png"),
      fullPage: true,
      animations: "disabled",
      style: "nextjs-portal { display: none; }",
    });
  } else {
    await page.goto("/roster");
    await expect(
      page.getByRole("heading", { name: "Team roster" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("desktop-roster.png"),
      fullPage: true,
      animations: "disabled",
      style: "nextjs-portal { display: none; }",
    });
  }
});
