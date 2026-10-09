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

test("communication: phone image compression, private display, removal and mounted expiry", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request, "admin");
  const sharp = (await import("sharp")).default;
  const png = await sharp({
    create: { width: 2400, height: 1800, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const title = `Image announcement ${info.project.name}`;
  await create(page, "announcement", title);
  await page.getByLabel("Attach an image (optional)").setInputFiles({
    name: "phone-photo.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByText(/Prepared JPEG/)).toBeVisible();
  await page
    .getByLabel("Image description (optional)")
    .fill("Practice formation");
  await page.getByLabel("Expiration date (optional)").fill("2027-12-12");
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const image = page.getByRole("img", { name: "Practice formation" }).first();
  await expect(image).toBeVisible();
  await page.screenshot({
    path: info.outputPath("announcement-image.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Enlarge announcement image" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close image" }).click();
  const imageUrl = await image.getAttribute("src");
  const response = await page.request.get(imageUrl!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/jpeg");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const metadata = await sharp(await response.body()).metadata();
  expect(Math.max(metadata.width!, metadata.height!)).toBeLessThanOrEqual(1600);
  await page
    .getByRole("link", { name: "Edit announcement", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  expect((await page.request.get(imageUrl!)).status()).toBe(404);
  const id = new URL(page.url()).pathname.split("/").pop();
  await request.get(`http://127.0.0.1:3201/fixture/expire?id=${id}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "This item has expired" }),
  ).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
});
