import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
test.afterAll(async ({ request }) => {
  expect(
    (
      await request.post("http://127.0.0.1:3201/fixture/reset-digest-tests")
    ).ok(),
  ).toBe(true);
});
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
test("digest: personal announcement excerpt, acknowledgment refresh and reminder draft", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request);
  await page.goto("/announcements/new");
  const title = `Digest announcement ${info.project.name}`;
  const body =
    "Bring black shoes to practice. " +
    "We will rehearse the opener and transitions together. ".repeat(8);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Details", { exact: true }).fill(body);
  await page.getByLabel("Add a reminder", { exact: true }).check();
  const date = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel("Reminder date", { exact: true }).fill(date);
  await page.getByLabel("Reminder time (Texas)", { exact: true }).fill("10:00");
  await page
    .getByLabel("When should this reminder stop?", { exact: true })
    .selectOption("preparation");
  await page
    .getByLabel("Reminder message (optional)", { exact: true })
    .fill("Bring black shoes");
  await page.screenshot({
    path: info.outputPath("announcement-reminder.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Publish announcement", exact: true })
    .click();
  await expect(page).toHaveURL(/\/announcements\/[0-9a-f-]+$/);
  await expect(
    page.getByText("Preparation reminder · acknowledgment does not stop it.", {
      exact: true,
    }),
  ).toBeVisible();
  const detail = page.url();
  await page.goto("/home");
  const today = page.getByRole("region", { name: /Today ·/ });
  await expect(today.getByText(title, { exact: true })).toBeVisible();
  const entry = today.getByRole("link").filter({ hasText: title });
  await expect(entry).toContainText("Bring black shoes to practice.");
  await expect(entry).toContainText("…");
  await expect(entry).toContainText("Read announcement");
  await expect(today.getByText(body, { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("today-digest.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto("http://127.0.0.1:3102/home");
  const expand = dancer
    .getByRole("region", { name: /Today ·/ })
    .getByRole("button", { name: /View all/ });
  if (await expand.count()) await expand.click();
  await expect(
    dancer
      .getByRole("region", { name: /Today ·/ })
      .getByText(title, { exact: true }),
  ).toBeVisible();
  await dancer.goto(detail);
  await dancer
    .getByRole("button", { name: "Mark as read", exact: true })
    .click();
  await expect(
    dancer.getByText("You’ve read this announcement.", { exact: true }),
  ).toBeVisible();
  await dancer.goto("http://127.0.0.1:3102/home");
  await expect(
    dancer
      .getByRole("region", { name: /Today ·/ })
      .getByText(title, { exact: true }),
  ).toHaveCount(0);
  await dancerContext.close();
  await page.goto(detail + "/edit");
  await expect(
    page.getByLabel("Reminder message (optional)", { exact: true }),
  ).toHaveValue("Bring black shoes");
  await page.getByLabel("Reminder time (Texas)", { exact: true }).fill("11:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(detail);
  await page.goto(detail + "/edit");
  await page.getByLabel("Add a reminder", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText(/Preparation reminder/)).toHaveCount(0);
});

test("digest: all incomplete assignments appear, completed tasks disappear, and the list expands", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request);
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  for (let i = 0; i < 6; i++) {
    await page.goto("/todos/new");
    await page
      .getByLabel("Title", { exact: true })
      .fill(`Digest task ${info.project.name} ${i}`);
    await page.getByLabel("Details", { exact: true }).fill("Learn the opener.");
    if (i < 5) {
      await page
        .getByLabel("Due date (optional)", { exact: true })
        .fill(i === 4 ? "2099-12-31" : todayDate);
    }
    await page
      .getByLabel("Send to", { exact: true })
      .selectOption("individual");
    await page.getByRole("radio", { name: /Anika Dancer/ }).check();
    await page
      .getByRole("button", { name: "Create to-do", exact: true })
      .click();
    await expect(page).toHaveURL(/\/todos\/[0-9a-f-]+$/);
  }
  await page.goto("/home");
  await expect(
    page
      .getByRole("region", { name: /Today ·/ })
      .getByText(`Digest task ${info.project.name} 0`, { exact: true }),
  ).toHaveCount(0);
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto("http://127.0.0.1:3102/home");
  const today = dancer.getByRole("region", { name: /Today ·/ });
  await expect(
    today.getByRole("heading", { name: "Take care of these", exact: true }),
  ).toBeVisible();
  await expect(today.getByRole("button", { name: /View all/ })).toBeVisible();
  await today.getByRole("button", { name: /View all/ }).click();
  await expect(
    today.getByText(`Digest task ${info.project.name} 5`, { exact: true }),
  ).toBeVisible();
  await expect(
    today.getByText("To-do · no due date", { exact: true }),
  ).toBeVisible();
  await expect(
    today.getByText("To-do · due 2099-12-31", { exact: true }),
  ).toBeVisible();
  await expect(
    today.getByText(`Digest task ${info.project.name} 0`, { exact: true }),
  ).toBeVisible();
  await today
    .getByRole("link")
    .filter({ hasText: `Digest task ${info.project.name} 0` })
    .click();
  await dancer.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(
    dancer.getByText("You’ve completed this to-do.", { exact: true }),
  ).toBeVisible();
  await dancer.goto("http://127.0.0.1:3102/home");
  await expect(
    dancer
      .getByRole("region", { name: /Today ·/ })
      .getByText(`Digest task ${info.project.name} 0`, { exact: true }),
  ).toHaveCount(0);
  await expect(
    dancer
      .getByRole("region", { name: /Today ·/ })
      .getByText(`Digest task ${info.project.name} 1`, { exact: true }),
  ).toBeVisible();
  await dancer.screenshot({
    path: info.outputPath("today-actions.png"),
    fullPage: true,
  });
  expect(
    await dancer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dancerContext.close();
});
