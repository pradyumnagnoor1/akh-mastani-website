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
async function create(
  page: Page,
  kind: "task" | "announcement",
  title: string,
  audience = "team",
  mode = "individual",
) {
  await page.goto(kind === "task" ? "/todos/new" : "/announcements/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Details", { exact: true })
    .fill("Bring your practice shoes.\nCheck this before rehearsal.");
  await page.getByLabel("Send to", { exact: true }).selectOption(audience);
  if (audience === "individual")
    await page.getByRole("radio", { name: /Anika Dancer/ }).check();
  if (kind === "task")
    await page.getByLabel("Completion", { exact: true }).selectOption(mode);
}
test("communication: targeted announcement acknowledgment, edit and permanent deletion", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request, "admin");
  const title = `Practice update ${info.project.name}`;
  await create(page, "announcement", title, "individual");
  await expect(
    page.getByRole("heading", { name: "Recipient preview · 1 dancer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const url = page.url();
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto(url);
  await dancer.getByRole("button", { name: "Mark as read" }).click();
  await expect(
    dancer.getByText("You’ve read this announcement."),
  ).toBeVisible();
  await expect(
    dancer.getByRole("button", { name: "Delete announcement" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Acknowledgments · 1/1" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Edit announcement", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill(title + " revised");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: title + " revised", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete announcement" }).click();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(
    page.getByRole("link", { name: "Deleted", exact: true }),
  ).toHaveCount(0);
  await dancer.goto(url);
  await expect(
    dancer.getByRole("heading", { name: title + " revised", exact: true }),
  ).toHaveCount(0);
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: title + " revised", exact: true }),
  ).toHaveCount(0);
  await dancerContext.close();
});
test("communication: individual progress remains independent and can be reopened", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request, "admin");
  const title = `Practice checklist ${info.project.name}`;
  await create(page, "task", title);
  await page.getByRole("button", { name: "Create to-do", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const url = page.url();
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto(url);
  await dancer.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(dancer.getByText("You’ve completed this to-do.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mark done", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Completion · 1/2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reopen for Anika Dancer" }).click();
  await expect(
    page.getByRole("heading", { name: "Completion · 0/2" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit to-do", exact: true }).click();
  await page.getByLabel("Details", { exact: true }).fill("Revised checklist");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Revised checklist", { exact: true }),
  ).toBeVisible();
  await dancer.reload();
  await expect(
    dancer.getByRole("button", { name: "Mark done", exact: true }),
  ).toBeVisible();
  await dancerContext.close();
});
test("communication: saved group and shared completion show actor for everyone", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request, "admin");
  const group = `Production ${info.project.name}`;
  await page.goto("/admin/groups/new");
  await page.getByLabel("Group name", { exact: true }).fill(group);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("checkbox").last().check();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/groups$/);
  const title = `Pack speaker ${info.project.name}`;
  await create(page, "task", title, "group", "shared");
  await page
    .getByLabel("Group", { exact: true })
    .selectOption({ label: group });
  await expect(
    page.getByRole("heading", { name: "Recipient preview · 2 dancers" }),
  ).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await page.screenshot({
    path: info.outputPath("communication-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create to-do", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const url = page.url();
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto(url);
  await dancer.getByRole("button", { name: "Mark done", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("Completed by Anika Dancer for everyone."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark done", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("communication-detail.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Reopen shared item" }).click();
  await expect(
    page.getByRole("button", { name: "Mark done", exact: true }),
  ).toBeVisible();
  await page.goto("/home");
  await expect(
    page.getByRole("link", { name: new RegExp(title) }),
  ).toBeVisible();
  await dancer.goto("http://127.0.0.1:3102/admin/groups");
  await expect(dancer).toHaveURL(/\/home$/);
  await dancerContext.close();
});
