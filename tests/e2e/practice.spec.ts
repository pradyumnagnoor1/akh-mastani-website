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
async function assign(
  page: Page,
  roles: string[],
  request: APIRequestContext,
  keepAdmin = false,
) {
  await request.post("http://127.0.0.1:3201/fixture/member-admin?enabled=true");
  await page.goto("/admin");
  const member = page.locator(".admin-member").filter({
    has: page.getByRole("heading", { name: "Anika Dancer", exact: true }),
  });
  const change = member.getByRole("button", {
    name: "Change exec role",
    exact: true,
  });
  const group = member.getByRole("group", {
    name: "Exec roles for Anika Dancer",
    exact: true,
  });
  await expect(group.or(change)).toBeVisible();
  if (await change.count()) {
    await expect(group).toHaveCount(0);
    await change.click();
  }
  const form = member
    .locator("form")
    .filter({ has: page.locator('input[name="expected_roles"]') });
  for (const role of [
    "Captain",
    "Logistics & Finance",
    "Production",
    "Social",
    "AO",
    "Hospitality",
  ])
    await group
      .getByLabel(role, { exact: true })
      .setChecked(roles.includes(role));
  await form
    .getByRole("button", { name: "Save exec roles", exact: true })
    .click();
  await expect(form.getByRole("status")).toHaveText("Exec roles updated.");
  await expect(group).toHaveCount(0);
  await expect(change).toBeVisible();
  if (!keepAdmin)
    await request.post(
      "http://127.0.0.1:3201/fixture/member-admin?enabled=false",
    );
}
test("practice: exec posts attributed practice notes, calendar shares them and badges turn green", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=fresh");
  await login(context, request);
  await assign(page, ["Social", "Production"], request);
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
    const member = page.locator(".admin-member").filter({
      has: page.getByRole("heading", { name: "Anika Dancer", exact: true }),
    });
    await member
      .getByRole("button", { name: "Change exec role", exact: true })
      .click();
    await member.getByLabel("Social", { exact: true }).uncheck();
    await member.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(member.getByRole("group")).toHaveCount(0);
    await assign(page, ["Captain"], request);
    await exec.goto("/admin");
    await expect(
      exec.getByRole("heading", { name: "Team management", exact: true }),
    ).toBeVisible();
    await expect(
      exec.getByRole("button", { name: "Save exec roles", exact: true }),
    ).toHaveCount(0);
    await expect(
      exec.getByRole("button", { name: "Change exec role", exact: true }),
    ).toHaveCount(0);
    await expect(
      exec.getByRole("group", { name: /^Exec roles for / }),
    ).toHaveCount(0);
    await exec.goto("/payments/new");
    await expect(
      exec.getByRole("heading", { name: "Issue charges", exact: true }),
    ).toBeVisible();
  } finally {
    await execContext.close();
    await assign(page, [], request);
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

test("practice: exec role editor protects a pending save and reopens saved roles", async ({
  page,
  context,
  request,
}) => {
  await login(context, request);
  await page.goto("/admin");
  const dancer = page.locator(".admin-member").filter({
    has: page.getByRole("heading", { name: "Anika Dancer", exact: true }),
  });
  await expect(dancer).toBeVisible();
  await expect(
    dancer.getByRole("group", { name: /^Exec roles for / }),
  ).toHaveCount(0);
  await expect(
    dancer.getByRole("button", { name: "Change exec role", exact: true }),
  ).toHaveCount(0);
  await assign(page, ["Social"], request, true);
  const member = page.locator(".admin-member").filter({
    has: page.getByRole("heading", { name: "Anika Dancer", exact: true }),
  });
  const change = member.getByRole("button", {
    name: "Change exec role",
    exact: true,
  });
  await page.reload();
  await change.click();
  await expect(member.getByLabel("Social", { exact: true })).toBeChecked();
  await member.getByLabel("Social", { exact: true }).uncheck();
  await member.getByLabel("Captain", { exact: true }).check();
  let release!: () => void;
  let signal!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    signal = resolve;
  });
  await page.route("**/admin", async (route) => {
    if (!route.request().headers()["next-action"]) return route.continue();
    const response = await route.fetch();
    signal();
    await held;
    await route.fulfill({ response });
  });
  try {
    await member
      .getByRole("button", { name: "Save exec roles", exact: true })
      .click();
    await started;
    await expect(
      member.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await expect(member.getByLabel("Captain", { exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(change).toBeVisible();
  await page.unroute("**/admin");
  await change.click();
  await expect(member.getByLabel("Captain", { exact: true })).toBeChecked();
  await expect(member.getByLabel("Social", { exact: true })).not.toBeChecked();
  await member.getByRole("button", { name: "Cancel", exact: true }).click();
  await assign(page, [], request);
});

test("practice: AO and Hospitality tags can be assigned and used for posting", async ({
  page,
  context,
  request,
}) => {
  await login(context, request);
  try {
    await assign(page, ["AO", "Hospitality"], request, true);
    const member = page.locator(".admin-member").filter({
      has: page.getByRole("heading", { name: "Anika Dancer", exact: true }),
    });
    await expect(member.getByText("AO", { exact: true })).toBeVisible();
    await expect(
      member.getByText("Hospitality", { exact: true }),
    ).toBeVisible();
    await login(context, request, "dancer");
    await page.goto("/announcements/new");
    await page.getByLabel("Posting as", { exact: true }).selectOption("AO");
    await page
      .getByLabel("Posting as", { exact: true })
      .selectOption("Hospitality");
  } finally {
    await login(context, request);
    await assign(page, [], request);
  }
});

test("practice: to-do actions show explicit saved exec identity on detail, lists and Home", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request);
  await assign(page, ["AO", "Hospitality"], request, true);
  const title = `Hospitality checklist ${info.project.name}`;
  try {
    await login(context, request, "dancer");
    await page.goto("/todos/new");
    await page
      .getByLabel("Posting as", { exact: true })
      .selectOption("Hospitality");
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page
      .getByLabel("Details", { exact: true })
      .fill("Prepare the welcome table.");
    await page
      .getByRole("button", { name: "Create to-do", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const url = page.url();
    const attribution = page.locator(".page-heading .announcement-attribution");
    await expect(attribution).toContainText("Anika Dancer");
    await expect(attribution.locator(".exec-role-badge")).toHaveText(
      /Exec roleHospitality/,
    );
    await expect(attribution).toContainText("Created");
    await page.screenshot({
      path: info.outputPath("exec-task-detail.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Edit to-do", exact: true }).click();
    await expect(page.getByLabel("Posting as", { exact: true })).toBeDisabled();
    await page
      .getByLabel("Details", { exact: true })
      .fill("Prepare the welcome table and water.");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(attribution.locator(".exec-role-badge")).toContainText(
      "Hospitality",
    );
    await page.goto("/todos");
    const card = page
      .locator(".communication-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(card.locator(".exec-role-badge")).toHaveText(
      /Exec roleHospitality/,
    );
    await page.goto("/home");
    const expand = page
      .getByRole("region", { name: /Today ·/ })
      .getByRole("button", { name: /View all/ });
    if (await expand.count()) await expand.click();
    const today = page.locator(".today-item").filter({ hasText: title });
    if (await today.count())
      await expect(today.locator(".exec-role-badge")).toContainText(
        "Hospitality",
      );
    await page.screenshot({
      path: info.outputPath("exec-task-home.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto(url);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Delete to-do", exact: true })
      .click();
  } finally {
    await login(context, request);
    await assign(page, [], request);
  }
});

test("practice: Upcoming shows only the current month while day navigation reaches later events", async ({
  page,
  context,
  request,
}) => {
  await login(context, request);
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=months");
  try {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Upcoming", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "This month event", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Next month event", exact: true }),
    ).toHaveCount(0);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const current = new Date(`${today}T12:00:00Z`);
    const next = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1),
    )
      .toISOString()
      .slice(0, 10);
    await page.getByLabel("Date", { exact: true }).fill(next);
    await expect(
      page.getByRole("heading", { name: "Next month event", exact: true }),
    ).toBeVisible();
  } finally {
    await request.get("http://127.0.0.1:3201/fixture/calendar?state=fresh");
  }
});
test("practice: announcement creates a linked to-do with independent read and completion", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request);
  const title = `Forms announcement ${info.project.name}`;
  await page.goto("/announcements/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Details", { exact: true })
    .fill("Submit your forms before practice.");
  await page.getByLabel("Also create a to-do", { exact: true }).check();
  await page
    .getByLabel("To-do completion", { exact: true })
    .selectOption("individual");
  await page
    .getByRole("button", { name: "Publish announcement", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const announcement = page.url();
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await page
    .getByRole("link", { name: `View linked to-do: ${title} →`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/todos\/[0-9a-f-]+$/);
  const task = page.url();
  await expect(
    page.getByRole("button", { name: "Mark done", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Submit your forms before practice.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("announcement-linked-todo.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: `View announcement: ${title} →`, exact: true })
    .click();
  await expect(page).toHaveURL(announcement);
  await page.goto("/todos");
  const taskCard = page
    .locator(".communication-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(
    taskCard.getByRole("link", {
      name: `View announcement: ${title} →`,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/announcements");
  const annCard = page
    .locator(".communication-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(
    annCard.getByRole("link", {
      name: `View linked to-do: ${title} →`,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(task);
  await page.getByRole("button", { name: "Mark done", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete to-do", exact: true }).click();
  await page.goto(announcement);
  await expect(
    page.getByRole("link", { name: /^View linked to-do:/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete announcement", exact: true })
    .click();
});
