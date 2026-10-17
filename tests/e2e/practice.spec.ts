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
async function assign(page: Page, roles: string[]) {
  await page.goto("/admin");
  const group = page.getByRole("group", {
    name: "Exec roles for Anika Dancer",
    exact: true,
  });
  const form = page.locator("form").filter({ has: group });
  for (const role of ["Captain", "Logistics & Finance", "Production", "Social"])
    await group
      .getByLabel(role, { exact: true })
      .setChecked(roles.includes(role));
  await form
    .getByRole("button", { name: "Save exec roles", exact: true })
    .click();
  await expect(form.getByRole("status")).toHaveText("Exec roles updated.");
}
test("practice: exec posts attributed practice notes, calendar shares them and badges turn green", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=fresh");
  await login(context, request);
  await assign(page, ["Social", "Production"]);
  const execContext = await browser.newContext();
  await login(execContext, request, "dancer");
  const exec = await execContext.newPage();
  try {
    await exec.goto("/announcements/new");
    await exec.getByLabel("Posting as", { exact: true }).selectOption("Social");
    await exec
      .getByLabel("Announcement type", { exact: true })
      .selectOption("practice");
    const googlePractice = await exec
      .getByRole("option", { name: /^Team practice ·/ })
      .getAttribute("value");
    await exec
      .getByLabel("Practice", { exact: true })
      .selectOption(googlePractice!);
    await expect(
      exec.getByText(/shares the practice reminder, normally/),
    ).toBeVisible();
    await expect(exec.getByText("Add a reminder", { exact: true })).toHaveCount(
      0,
    );
    const title = `Practice shoes ${info.project.name}`;
    await exec.getByLabel("Title", { exact: true }).fill(title);
    await exec
      .getByLabel("Details", { exact: true })
      .fill(
        "Bring black shoes. Read https://example.com/practice for details.",
      );
    await exec
      .getByRole("button", { name: "Publish announcement", exact: true })
      .click();
    await expect(
      exec.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      exec.locator(".announcement-attribution").first(),
    ).toContainText("Anika Dancer");
    await expect(
      exec.locator(".announcement-attribution").first(),
    ).toContainText("Social");
    await expect(
      exec.locator(".announcement-attribution").first(),
    ).toContainText("Posted");
    await expect(
      exec.locator(".badge.unread", { hasText: "Unread" }).first(),
    ).toBeVisible();
    await exec
      .getByRole("button", { name: "Mark as read", exact: true })
      .click();
    await expect(
      exec.locator(".page-heading .badge.success", { hasText: "Read" }),
    ).toBeVisible();
    await exec.goto("/calendar");
    await expect(
      exec.getByRole("button", { name: "Day", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await exec.getByRole("button", { name: "Upcoming", exact: true }).click();
    const notes = exec.getByRole("region", {
      name: "Announcements for Team practice",
    });
    await expect(
      notes.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await expect(notes.getByText("Social", { exact: true })).toBeVisible();
    await expect(notes.locator(".message-link")).toHaveAttribute(
      "href",
      "https://example.com/practice",
    );
    await expect(
      notes.locator(".badge.success", { hasText: "Read" }),
    ).toBeVisible();
    await exec.screenshot({
      path: info.outputPath("practice-notes.png"),
      fullPage: true,
    });
    await exec.goto("/admin");
    await expect(
      exec.getByRole("heading", { name: "Team management", exact: true }),
    ).toBeVisible();
    await assign(page, ["Captain"]);
    await exec.goto("/admin");
    await expect(
      exec.getByRole("heading", { name: "Team management", exact: true }),
    ).toBeVisible();
    await expect(
      exec.getByRole("button", { name: "Save exec roles", exact: true }),
    ).toHaveCount(0);
    await exec.goto("/payments/new");
    await expect(
      exec.getByRole("heading", { name: "Issue charges", exact: true }),
    ).toBeVisible();
  } finally {
    await execContext.close();
    await assign(page, []);
  }
});
test("practice: Today shows every event and date controls find the selected day", async ({
  page,
  context,
  request,
}, info) => {
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=today");
  await login(context, request, "dancer");
  try {
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { name: /^Today ·/ })).toBeVisible();
    await expect(page.locator(".calendar-event")).toHaveCount(13);
    await expect(
      page.getByRole("heading", { name: "Daily event 12", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "All-day team event", exact: true }),
    ).toBeVisible();
    const original = await page
      .getByLabel("Date", { exact: true })
      .inputValue();
    await page.getByRole("button", { name: "Next day", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No events on this day", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Previous day", exact: true })
      .click();
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
      original,
    );
    await page.getByLabel("Date", { exact: true }).fill("2027-01-01");
    await expect(page.locator(".calendar-event")).toHaveCount(0);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.locator(".calendar-event")).toHaveCount(13);
    await page.screenshot({
      path: info.outputPath("calendar-today.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await request.get("http://127.0.0.1:3201/fixture/calendar?state=fresh");
  }
});

test("practice: create, reuse, edit and delete a custom practice with a shared announcement", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request);
  await page.goto("/announcements/new");
  await page
    .getByLabel("Announcement type", { exact: true })
    .selectOption("practice");
  await page.getByLabel("Practice", { exact: true }).selectOption("__custom__");
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const name = `Extra rehearsal ${info.project.name}`,
    title = `Extra instructions ${info.project.name}`;
  await page.getByLabel("Practice name", { exact: true }).fill(name);
  await page.getByLabel("Practice date", { exact: true }).fill(date);
  await page.getByLabel("Start time (Texas)", { exact: true }).fill("18:00");
  await page.getByLabel("End time (Texas)", { exact: true }).fill("20:00");
  await page
    .getByLabel("Practice location", { exact: true })
    .fill("PEAP Studio");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Details", { exact: true })
    .fill("Bring black shoes and review https://example.com/extra.");
  await expect(page.getByLabel("Add a reminder", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: info.outputPath("custom-practice-form.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Publish announcement", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const postUrl = page.url();
  await page
    .getByRole("link", { name: "View practice calendar →", exact: true })
    .click();
  const card = page
    .locator(".calendar-event")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toBeVisible();
  await expect(
    card.getByText("Custom practice", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();
  const edit = await card
    .getByRole("link", { name: "Edit practice", exact: true })
    .getAttribute("href");
  await page.screenshot({
    path: info.outputPath("custom-practice-calendar.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/announcements/new");
  await page
    .getByLabel("Announcement type", { exact: true })
    .selectOption("practice");
  const existing = await page
    .getByRole("option", { name: new RegExp(`^${name} ·`) })
    .getAttribute("value");
  await page.getByLabel("Practice", { exact: true }).selectOption(existing!);
  await page.getByLabel("Title", { exact: true }).fill(title + " second");
  await page.getByLabel("Details", { exact: true }).fill("Bring water too.");
  await page
    .getByRole("button", { name: "Publish announcement", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title + " second", exact: true }),
  ).toBeVisible();
  // A previously saved note can create another practice without reusing its old ID.
  await page.goto(postUrl);
  await page
    .getByRole("link", { name: "Edit announcement", exact: true })
    .click();
  await page.getByLabel("Practice", { exact: true }).selectOption("__custom__");
  await page
    .getByLabel("Practice name", { exact: true })
    .fill(name + " replacement");
  await page.getByLabel("Practice date", { exact: true }).fill(date);
  await page.getByLabel("Start time (Texas)", { exact: true }).fill("18:00");
  await page.getByLabel("End time (Texas)", { exact: true }).fill("20:00");
  await page
    .getByLabel("Practice location", { exact: true })
    .fill("Rec Center");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  // Re-link to the original practice to exercise its unavailable state after deletion.
  await page
    .getByRole("link", { name: "Edit announcement", exact: true })
    .click();
  await page.getByLabel("Practice", { exact: true }).selectOption(existing!);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  try {
    await dancer.goto(`http://127.0.0.1:3102${edit}`);
    await expect(dancer).toHaveURL(/\/home$/);
  } finally {
    await dancerContext.close();
  }
  await page.goto(edit!);
  await page
    .getByLabel("Practice location", { exact: true })
    .fill("Rudder Studio");
  await page.getByLabel("End time (Texas)", { exact: true }).fill("21:00");
  await page
    .getByRole("button", { name: "Save practice", exact: true })
    .click();
  await expect(card.getByText("Rudder Studio", { exact: true })).toBeVisible();
  await expect(card.getByRole("region")).toContainText("Bring water too.");
  page.once("dialog", (dialog) => dialog.accept());
  await card
    .getByRole("button", { name: "Delete practice", exact: true })
    .click();
  await page.goto(postUrl);
  await expect(
    page.getByText(/Practice unavailable in the current schedule/),
  ).toBeVisible();
});
