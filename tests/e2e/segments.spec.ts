import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
async function login(
  context: BrowserContext,
  request: APIRequestContext,
  role: "admin" | "dancer",
) {
  const response = await request.get(
    `http://127.0.0.1:3201/fixture/session?role=${role}`,
  );
  const session = await response.json();
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
}
test("segments: dancer sees formations, assignments and personal roster links", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request, "dancer");
  await page.goto("/segments");
  await expect(page.getByRole("heading", { name: "Set design" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add segment" })).toHaveCount(0);
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Opening", exact: true }),
    })
    .click();
  await expect(page.getByRole("heading", { name: "Opening" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Anika Dancer")).toBeVisible();
  const documentResponse = await context.request.get(
    "/segments/00000000-0000-4000-8000-000000000010/document",
  );
  expect(documentResponse.status()).toBe(200);
  expect(documentResponse.url()).toContain("/document");
  expect(documentResponse.headers()["cache-control"]).toContain("no-store");
  expect(documentResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(documentResponse.headers()["content-type"]).toBe("application/pdf");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("heading", { level: 1 }).click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: info.outputPath("segment-detail.png"),
    fullPage: true,
  });
  await page.goto("/roster");
  await expect(
    page.locator(".roster-segment-tag").filter({ hasText: /^Opening$/ }),
  ).toHaveCount(2);
  expect(
    await page
      .locator(".roster-segment-tag")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThan(28);
  await page.screenshot({
    path: info.outputPath("roster-tags.png"),
    fullPage: true,
  });
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Your segments" }),
  ).toContainText("1");
  await page.goto("/segments/new");
  await expect(page).toHaveURL(/\/home$/);
});
test("segments: admin creates, renames, changes lineup, replaces PDF and removes segment", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request, "admin");
  await page.goto("/segments/new");
  await page
    .getByLabel("Segment name", { exact: true })
    .fill(`Finale ${info.project.name}`);
  await page.getByLabel("Formation PDF", { exact: true }).setInputFiles({
    name: "finale.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nTest formation\n%%EOF"),
  });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Create segment" }).click();
  await expect(page).toHaveURL(/\/segments\/[0-9a-f-]{36}$/);
  const url = page.url();
  const id = url.split("/").pop();
  await page.goto("/admin/groups");
  await expect(
    page.getByRole("heading", {
      name: `Finale ${info.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/announcements/new");
  await page.getByLabel("Send to", { exact: true }).selectOption("group");
  await page.getByLabel("Group", { exact: true }).selectOption(`segment:${id}`);
  const targeting = await page
    .locator("form.communication-form")
    .evaluate((form) => {
      const data = new FormData(form as HTMLFormElement);
      return [data.get("audience"), data.get("source_id")];
    });
  expect(targeting).toEqual(["segment", id]);
  await expect(
    page.getByRole("heading", {
      name: "Recipient preview · 1 dancer",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Title", { exact: true })
    .fill(`Lineup update ${info.project.name}`);
  await page
    .getByLabel("Details", { exact: true })
    .fill("For this lineup only.");
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(
    page.getByRole("heading", {
      name: `Lineup update ${info.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
  const postUrl = page.url();
  await page.goto("/payments/new");
  await page.getByLabel("Charge to", { exact: true }).selectOption("group");
  await page.getByLabel("Group", { exact: true }).selectOption(`segment:${id}`);
  await page.goto(url);

  await page.getByRole("link", { name: "Edit segment" }).click();
  await page
    .getByLabel("Segment name", { exact: true })
    .fill(`Finale revised ${info.project.name}`);
  await page.getByRole("button", { name: "Select entire team" }).click();
  await page
    .getByLabel("Replace formation PDF", { exact: true })
    .setInputFiles({
      name: "revised.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nRevised formation\n%%EOF"),
    });
  await page.getByRole("heading", { level: 1 }).click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: info.outputPath("segment-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByText("revised.pdf", { exact: true })).toBeVisible();
  await expect(
    page.getByText("2 active dancers · Formation PDF"),
  ).toBeVisible();
  await page.goto(postUrl);
  await expect(
    page.getByRole("heading", { name: "Acknowledgments · 0/1", exact: true }),
  ).toBeVisible();
  await page.goto("/admin/groups");
  const lineup = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: `Finale revised ${info.project.name}`,
      exact: true,
    }),
  });
  await expect(lineup.getByText("2 active dancers")).toBeVisible();
  await page.goto("/roster");
  await expect(
    page
      .locator(".roster-segment-tag")
      .filter({ hasText: `Finale revised ${info.project.name}` }),
  ).toHaveCount(2);
  await page.goto(url);
  await page.getByText("Remove this segment", { exact: true }).click();
  await page.getByLabel("I want to remove this segment").check();
  await page
    .getByRole("button", { name: "Remove segment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/segments$/);
  await expect(
    page.getByRole("heading", { name: `Finale revised ${info.project.name}` }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Archive", exact: true }),
  ).toHaveCount(0);
  await page.goto("/admin/groups");
  await expect(
    page.getByRole("heading", { name: `Finale revised ${info.project.name}` }),
  ).toHaveCount(0);
  await page.goto("/roster");
  await expect(
    page
      .locator(".roster-segment-tag")
      .filter({ hasText: `Finale revised ${info.project.name}` }),
  ).toHaveCount(0);
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "This page isn’t here" }),
  ).toBeVisible();
  await login(context, request, "dancer");
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "This page isn’t here" }),
  ).toBeVisible();
});
