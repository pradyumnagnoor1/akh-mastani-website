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
test("management: featured event create/edit/delete, Home and dancer access", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request);
  await page.goto("/calendar");
  await page
    .getByRole("link", { name: "Add featured event", exact: true })
    .click();
  const title = `Team showcase ${info.project.name}`;
  await page.getByLabel("Event title", { exact: true }).fill(title);
  await page.getByLabel("Event date", { exact: true }).fill("2099-12-12");
  await page
    .getByLabel("Time (Central, optional)", { exact: true })
    .fill("18:30");
  await page
    .getByLabel("Location (optional)", { exact: true })
    .fill("Rudder auditorium");
  await page
    .getByLabel("Event details (optional)", { exact: true })
    .fill("Arrive ready for showcase.");
  await page
    .getByLabel("Event link (optional)", { exact: true })
    .fill("https://example.com/showcase");
  await page
    .getByLabel("Event link (optional)", { exact: true })
    .fill("https://user:secret@example.com/event");
  await page
    .getByRole("button", { name: "Create featured event", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Use a valid http or https link." }),
  ).toBeVisible();
  await expect(page.getByLabel("Event title", { exact: true })).toHaveValue(
    title,
  );
  await expect(
    page.getByLabel("Location (optional)", { exact: true }),
  ).toHaveValue("Rudder auditorium");
  await page
    .getByLabel("Event link (optional)", { exact: true })
    .fill("https://example.com/showcase");
  await page
    .getByRole("button", { name: "Create featured event", exact: true })
    .click();
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByText(/6:30 PM Central/)).toBeVisible();
  const editLink = await card
    .getByRole("link", { name: "Edit event", exact: true })
    .getAttribute("href");
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto("http://127.0.0.1:3102/calendar");
  await expect(
    dancer.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    dancer.getByRole("button", { name: "Delete event" }),
  ).toHaveCount(0);
  await dancer.goto("http://127.0.0.1:3102" + editLink);
  await expect(dancer).toHaveURL(/\/home$/);
  await expect(
    dancer.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.goto(editLink!);
  await page
    .getByLabel("Event title", { exact: true })
    .fill(title + " revised");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  const revised = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: title + " revised", exact: true }),
  });
  await expect(revised).toBeVisible();
  await page.screenshot({
    path: info.outputPath("featured-calendar.png"),
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await revised
    .getByRole("button", { name: "Delete event", exact: true })
    .click();
  await expect(revised).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await revised
    .getByRole("button", { name: "Delete event", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title + " revised", exact: true }),
  ).toHaveCount(0);
  await dancer.goto("http://127.0.0.1:3102/calendar");
  await expect(
    dancer.getByRole("heading", { name: title + " revised", exact: true }),
  ).toHaveCount(0);
  await dancerContext.close();
});
test("management: payment edit invalidates report and deletion hides retained history", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request);
  await page.goto("/payments/new");
  const title = `Costume adjustment ${info.project.name}`;
  await page
    .getByLabel("Amount per dancer (USD)", { exact: true })
    .fill("12.50");
  await page.getByLabel("Reason", { exact: true }).fill(title);
  await page
    .getByLabel("Payment instructions", { exact: true })
    .fill("Pay the treasurer.");
  await page
    .getByLabel("Charge to", { exact: true })
    .selectOption("individual");
  await page.getByRole("radio", { name: /Anika Dancer/ }).check();
  await page
    .getByRole("button", { name: "Issue charges", exact: true })
    .click();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/(payments|todos)\/[0-9a-f-]{36}$/);
  const url = page.url();
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto(url);
  await expect(dancer.getByRole("link", { name: "Edit charge" })).toHaveCount(
    0,
  );
  await expect(
    dancer.getByRole("button", { name: "Delete charge" }),
  ).toHaveCount(0);
  await dancer
    .getByRole("button", { name: "Report paid", exact: true })
    .click();
  await expect(
    dancer.getByText("Awaiting verification", { exact: true }),
  ).toBeVisible();
  await page.goto(url);
  await page.getByRole("link", { name: "Edit charge", exact: true }).click();
  await page.getByLabel("Amount (USD)", { exact: true }).fill("20.00");
  await page
    .getByLabel("Change explanation", { exact: true })
    .fill("Corrected costume cost");
  await page.getByRole("button", { name: "Save charge", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "$20.00", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();
  await expect(page.getByText("Charge updated", { exact: true })).toBeVisible();
  await expect(
    page.getByText("$12.50 → $20.00", { exact: true }),
  ).toBeVisible();
  await dancer.goto(url);
  await expect(
    dancer.getByRole("button", { name: "Report paid", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Deletion reason", { exact: true })
    .fill("Charge created in error");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete charge", exact: true })
    .click();
  await expect(page).toHaveURL(/\/payments\?view=all$/);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await dancer.goto(url);
  await expect(
    dancer.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByText("Charge issued", { exact: true })).toHaveCount(0);
  await dancerContext.close();
});
test("management: to-do deletion removes admin/dancer access permanently", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request);
  await page.goto("/todos/new");
  const title = `Delete checklist ${info.project.name}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Details", { exact: true }).fill("Check shoes.");
  await page.getByRole("button", { name: "Create to-do", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/(payments|todos)\/[0-9a-f-]{36}$/);
  const url = page.url();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete to-do", exact: true }).click();
  await expect(page).toHaveURL(/\/todos$/);
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto(url);
  await expect(
    dancer.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  const exported = await (await page.request.get("/api/admin/export")).json();
  expect(JSON.stringify(exported)).not.toContain(title);
  await dancerContext.close();
});

test("management: saved group create/edit/delete", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request);
  await page.goto("/admin/groups/new");
  const title = `Showcase crew ${info.project.name}`;
  await page.getByLabel("Group name", { exact: true }).fill(title);
  await page.getByRole("checkbox").last().check();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const card = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Edit group", exact: true }).click();
  await page.getByLabel("Group name", { exact: true }).fill(title + " revised");
  await page.getByRole("button", { name: "Save group", exact: true }).click();
  const updated = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: title + " revised", exact: true }),
  });
  await expect(updated).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await updated
    .getByRole("button", { name: "Delete group", exact: true })
    .click();
  await expect(updated).toHaveCount(0);
  await expect(updated.getByRole("link", { name: "Edit group" })).toHaveCount(
    0,
  );
});
