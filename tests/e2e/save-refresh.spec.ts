import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
type Kind =
  "announcement" | "task" | "segment" | "group" | "payment" | "featured";
const kinds: Kind[] = [
  "announcement",
  "task",
  "segment",
  "group",
  "payment",
  "featured",
];
test.afterAll(async ({ request }) => {
  const response = await request.post(
    "http://127.0.0.1:3201/fixture/reset-refresh-audit",
  );
  expect(response.ok()).toBe(true);
});

test("save-refresh: member name rejects preserve drafts and concurrent corrections block saving", async ({
  page,
  context,
  request,
}) => {
  await login(context, request);
  await page.clock.install();
  await page.goto("/admin");
  const input = page.getByLabel("Name for dancer@tamu.edu", { exact: true });
  const form = page.locator("form").filter({ has: input });
  const original = await input.inputValue();
  const id = await form.locator('input[name="id"]').inputValue();
  await input.fill("Preserved name draft");
  await request.post("http://127.0.0.1:3201/fixture/mutation-fault", {
    data: { rpc: "correct_member_name", id, mode: "reject" },
  });
  await form.getByRole("button", { name: "Correct name", exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(input).toHaveValue("Preserved name draft");
  const second = await context.newPage();
  try {
    await second.goto("/admin");
    const other = second.getByLabel("Name for dancer@tamu.edu", {
      exact: true,
    });
    const otherForm = second.locator("form").filter({ has: other });
    await other.fill("Concurrent name correction");
    await otherForm
      .getByRole("button", { name: "Correct name", exact: true })
      .click();
    await expect(otherForm.getByRole("status")).toHaveText("Member updated.");
    await page.bringToFront();
    await refreshMounted(page);
    await expect(input).toHaveValue("Preserved name draft");
    await expect(
      form.getByRole("button", { name: "Correct name", exact: true }),
    ).toBeDisabled();
    await expect(
      form.getByRole("alert").filter({ hasText: "changed while" }),
    ).toBeVisible();
  } finally {
    await second.goto("/admin");
    const other = second.getByLabel("Name for dancer@tamu.edu", {
      exact: true,
    });
    await other.fill(original);
    await second
      .locator("form")
      .filter({ has: other })
      .getByRole("button", { name: "Correct name", exact: true })
      .click();
    await expect(
      second.locator("form").filter({ has: other }).getByRole("status"),
    ).toHaveText("Member updated.");
    await second.close();
  }
});
const config = {
  announcement: {
    path: "/announcements/new",
    field: "Title",
    create: "Publish announcement",
    save: "Save changes",
    rpc: "save_communication_reminder",
  },
  task: {
    path: "/todos/new",
    field: "Title",
    create: "Create to-do",
    save: "Save changes",
    rpc: "save_communication_media",
  },
  segment: {
    path: "/segments/new",
    field: "Segment name",
    create: "Create segment",
    save: "Save changes",
    rpc: "save_segment",
  },
  group: {
    path: "/admin/groups/new",
    field: "Group name",
    create: "Create group",
    save: "Save group",
    rpc: "save_communication_group",
  },
  payment: {
    path: "/payments/new",
    field: "Reason",
    create: "Issue charges",
    save: "Save charge",
    rpc: "issue_payment_charges",
  },
  featured: {
    path: "/calendar/featured/new",
    field: "Event title",
    create: "Create featured event",
    save: "Save event",
    rpc: "save_featured_event_expiring",
  },
};
async function login(context: BrowserContext, request: APIRequestContext) {
  const session = await (
    await request.get("http://127.0.0.1:3201/fixture/session?role=admin")
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
async function prepare(page: Page, kind: Kind, title: string) {
  await page.goto(config[kind].path);
  await page.getByLabel(config[kind].field, { exact: true }).fill(title);
  if (kind === "announcement" || kind === "task") {
    await page
      .getByLabel("Details", { exact: true })
      .fill("Keep these draft details.");
    await page.getByLabel("Expiration date (optional)").fill("2099-12-12");
  } else if (kind === "segment") {
    await page.getByLabel("Formation PDF", { exact: true }).setInputFiles({
      name: "draft.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nDraft formation\n%%EOF"),
    });
    await page.getByRole("checkbox", { name: /Anika Dancer/ }).check();
  } else if (kind === "group") {
    await page.getByRole("checkbox", { name: /Anika Dancer/ }).check();
  } else if (kind === "payment") {
    await page
      .getByLabel("Amount per dancer (USD)", { exact: true })
      .fill("10.50");
    await page
      .getByLabel("Payment instructions", { exact: true })
      .fill("Keep the payment instructions.");
    await page.getByRole("radio", { name: /Anika Dancer/ }).check();
  } else {
    await page.getByLabel("Event date", { exact: true }).fill("2099-12-12");
    await page
      .getByLabel("Location (optional)", { exact: true })
      .fill("Keep this location");
    await page.getByLabel("Expiration date (optional)").fill("2099-12-12");
  }
}
async function records(request: APIRequestContext, kind: Kind, title: string) {
  return (
    await request.get(
      `http://127.0.0.1:3201/fixture/records?kind=${kind}&title=${encodeURIComponent(title)}`,
    )
  ).json();
}
// Exercise a mounted server refresh even when dirty polling is normally paused.
// A non-cancelable reset event clears the controller guard without resetting fields.
async function refreshMounted(page: Page) {
  await page.getByRole("heading", { level: 1 }).click();
  await page.evaluate(() =>
    document
      .querySelectorAll('form:has(input[name="id"])')
      .forEach((form) =>
        form.dispatchEvent(new Event("reset", { bubbles: true })),
      ),
  );
  const refreshed = page.waitForResponse((r) => r.url().includes("_rsc="));
  await page.clock.runFor(30_100);
  await refreshed;
  await expect(
    page.getByRole("status", { name: "Refreshing page", exact: true }),
  ).toHaveCount(0);
}
function editPath(kind: Kind, id: string) {
  const bases = {
    announcement: "/announcements",
    task: "/todos",
    segment: "/segments",
    group: "/admin/groups",
    payment: "/payments",
    featured: "/calendar/featured",
  };
  return `${bases[kind]}/${id}/edit`;
}
for (const kind of kinds) {
  test(`save-refresh: ${kind} preserves draft identity and fields through server refresh`, async ({
    page,
    context,
    request,
  }, info) => {
    await login(context, request);
    await page.clock.install();
    const title = `Stable ${kind} ${info.project.name}`;
    await prepare(page, kind, title);
    const id = await page.locator('input[name="id"]').inputValue();
    await refreshMounted(page);
    await expect(page.locator('input[name="id"]')).toHaveValue(id);
    await expect(
      page.getByLabel(config[kind].field, { exact: true }),
    ).toHaveValue(title);
    await page
      .getByRole("button", { name: config[kind].create, exact: false })
      .click();
    await expect
      .poll(async () => (await records(request, kind, title)).length)
      .toBe(1);
    const rows = await records(request, kind, title);
    expect(kind === "payment" ? rows[0].batch_id : rows[0].id).toBe(id);
  });
  test(`save-refresh: ${kind} cannot duplicate a committed save after a lost response and refresh`, async ({
    page,
    context,
    request,
  }, info) => {
    await login(context, request);
    await page.clock.install();
    const title = `Lost ${kind} ${info.project.name}`;
    await prepare(page, kind, title);
    const id = await page.locator('input[name="id"]').inputValue();
    await request.post("http://127.0.0.1:3201/fixture/mutation-fault", {
      data: { rpc: config[kind].rpc, id, mode: "lost-response" },
    });
    await page
      .getByRole("button", { name: config[kind].create, exact: false })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: /confirm|Unable to save/ }),
    ).toBeVisible();
    await expect(
      page.getByLabel(config[kind].field, { exact: true }),
    ).toHaveValue(title);
    expect((await records(request, kind, title)).length).toBe(1);
    await refreshMounted(page);
    await expect(page.locator('input[name="id"]')).toHaveValue(id);
    await page
      .getByRole("button", { name: config[kind].create, exact: false })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /changed|exists|already|Unable to save/ }),
    ).toBeVisible();
    expect((await records(request, kind, title)).length).toBe(1);
  });
  test(`save-refresh: ${kind} edit keeps its draft and rejects a concurrent revision`, async ({
    page,
    context,
    request,
  }, info) => {
    await login(context, request);
    const title = `Concurrent ${kind} ${info.project.name}`;
    await prepare(page, kind, title);
    await page
      .getByRole("button", { name: config[kind].create, exact: false })
      .click();
    await expect
      .poll(async () => (await records(request, kind, title)).length)
      .toBe(1);
    const row = (await records(request, kind, title))[0];
    const path = editPath(kind, row.id);
    await page.clock.install();
    await page.goto(path);
    const field = kind === "payment" ? "Reason" : config[kind].field;
    await page.getByLabel(field, { exact: true }).fill(`${title} draft`);
    if (kind === "payment")
      await page.getByLabel("Change explanation").fill("Keep my explanation");
    const version = await page.locator('input[name="version"]').inputValue();
    const second = await context.newPage();
    await second.goto(path);
    await second.getByLabel(field, { exact: true }).fill(`${title} other`);
    if (kind === "payment")
      await second.getByLabel("Change explanation").fill("Other correction");
    await second
      .getByRole("button", { name: config[kind].save, exact: true })
      .click();
    await expect
      .poll(async () => (await records(request, kind, `${title} other`)).length)
      .toBe(1);
    await page.bringToFront();
    await refreshMounted(page);
    await expect(page.getByLabel(field, { exact: true })).toHaveValue(
      `${title} draft`,
    );
    await expect(page.locator('input[name="version"]')).toHaveValue(version);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /changed while you were editing/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: config[kind].save, exact: true }),
    ).toBeDisabled();
    expect((await records(request, kind, `${title} draft`)).length).toBe(0);
    await page.reload();
    await expect(page.getByLabel(field, { exact: true })).toHaveValue(
      `${title} other`,
    );
    await expect(
      page.getByRole("button", { name: config[kind].save, exact: true }),
    ).toBeEnabled();
    await second.close();
  });
}

for (const kind of kinds) {
  test(`save-refresh: ${kind} rejected save keeps fields, file and refresh protection for retry`, async ({
    page,
    context,
    request,
  }, info) => {
    await login(context, request);
    await page.clock.install();
    const title = `Rejected ${kind} ${info.project.name}`;
    await prepare(page, kind, title);
    const id = await page.locator('input[name="id"]').inputValue();
    await request.post("http://127.0.0.1:3201/fixture/mutation-fault", {
      data: { rpc: config[kind].rpc, id, mode: "reject" },
    });
    await page
      .getByRole("button", { name: config[kind].create, exact: false })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: /confirm|Unable to save/ }),
    ).toBeVisible();
    await expect(
      page.getByLabel(config[kind].field, { exact: true }),
    ).toHaveValue(title);
    if (kind === "segment") {
      expect(
        await page
          .getByLabel("Formation PDF", { exact: true })
          .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
      ).toBe("draft.pdf");
      await expect(
        page.getByRole("checkbox", { name: /Anika Dancer/ }),
      ).toBeChecked();
    }
    expect((await records(request, kind, title)).length).toBe(0);
    await page.getByRole("heading", { level: 1 }).click();
    let refreshes = 0;
    page.on("request", (req) => {
      if (req.url().includes("_rsc=")) refreshes++;
    });
    await page.clock.runFor(30_100);
    expect(refreshes).toBe(0);
    await expect(page.locator('input[name="id"]')).toHaveValue(id);
    await page
      .getByRole("button", { name: config[kind].create, exact: false })
      .click();
    await expect
      .poll(async () => (await records(request, kind, title)).length)
      .toBe(1);
  });
}

test("save-refresh: payment waiver and deletion notes survive a concurrent charge refresh", async ({
  page,
  context,
  request,
}, info) => {
  await login(context, request);
  const title = `Notes ${info.project.name}`;
  await prepare(page, "payment", title);
  await page
    .getByRole("button", { name: "Issue charges", exact: true })
    .click();
  await expect
    .poll(async () => (await records(request, "payment", title)).length)
    .toBe(1);
  const charge = (await records(request, "payment", title))[0];
  await page.clock.install();
  await page.goto(`/payments/${charge.id}`);
  await page
    .getByLabel("Waiver reason", { exact: true })
    .fill("Keep waiver note");
  await page
    .getByLabel("Deletion reason", { exact: true })
    .fill("Keep deletion note");
  const second = await context.newPage();
  await second.goto(editPath("payment", charge.id));
  await second.getByLabel("Reason", { exact: true }).fill(`${title} other`);
  await second
    .getByLabel("Change explanation", { exact: true })
    .fill("Other correction");
  await second
    .getByRole("button", { name: "Save charge", exact: true })
    .click();
  await expect
    .poll(
      async () => (await records(request, "payment", `${title} other`)).length,
    )
    .toBe(1);
  await page.bringToFront();
  await refreshMounted(page);
  await expect(page.getByLabel("Waiver reason", { exact: true })).toHaveValue(
    "Keep waiver note",
  );
  await expect(page.getByLabel("Deletion reason", { exact: true })).toHaveValue(
    "Keep deletion note",
  );
  await expect(
    page.getByRole("button", { name: "Waive charge", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Delete charge", exact: true }),
  ).toBeDisabled();
  await second.close();
});
