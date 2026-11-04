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
test("practice: event-first publication works independently of Google and preserves attribution", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request);
  await request.get("http://127.0.0.1:3201/fixture/calendar?state=unavailable");
  await page.goto("/announcements/new");
  await expect(
    page.getByLabel("Announcement type", { exact: true }),
  ).toHaveValue("announcement");
  await page
    .getByLabel("Announcement type", { exact: true })
    .selectOption("practice");
  await expect(page.getByLabel("Practice", { exact: true })).toHaveCount(0);
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const name = `Website rehearsal ${info.project.name}`;
  const title = `Practice announcement ${info.project.name}`;
  await page.getByLabel("Practice name", { exact: true }).fill(name);
  await page.getByLabel("Practice date", { exact: true }).fill(date);
  await page.getByLabel("Start time (Texas)", { exact: true }).fill("18:00");
  await page.getByLabel("End time (Texas)", { exact: true }).fill("20:00");
  await page
    .getByLabel("Practice location", { exact: true })
    .fill("PEAP Studio");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Details", { exact: true }).fill("Bring black shoes.");
  await page
    .getByRole("button", { name: "Publish announcement", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("heading", { name: title, exact: true }).click();
  await expect(
    page.getByText(`Practice announcement · ${name}`, { exact: true }),
  ).toBeVisible();
  await page.goto("/home");
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: "Featured events", exact: true }),
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
