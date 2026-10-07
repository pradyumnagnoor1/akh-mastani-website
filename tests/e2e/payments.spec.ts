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
test("payments: dancer reports, admin rejects then verifies, history stays", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request, "admin");
  const reason = `Costume repair ${info.project.name}`;
  await page.goto("/payments/new");
  await page
    .getByLabel("Amount per dancer (USD)", { exact: true })
    .fill("12.50");
  await page.getByLabel("Reason", { exact: true }).fill(reason);
  await page
    .getByLabel("Payment instructions", { exact: true })
    .fill("Pay the team treasurer using the agreed team method.");
  await page
    .getByLabel("Charge to", { exact: true })
    .selectOption("individual");
  await page.getByRole("radio", { name: /Anika Dancer/ }).check();
  await page
    .getByRole("button", { name: "Issue charges", exact: true })
    .click();
  await expect(page).toHaveURL(/\/payments\?view=all$/);
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: reason, exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: reason, exact: true }),
  ).toBeVisible();
  const url = page.url();
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto(url);
  await expect(
    dancer.getByRole("button", { name: "Verify payment", exact: true }),
  ).toHaveCount(0);
  await dancer
    .getByLabel("Reference or note (optional)", { exact: true })
    .fill("Paid to treasurer");
  await dancer
    .getByRole("button", { name: "Report paid", exact: true })
    .click();
  await expect(
    dancer.getByText("Awaiting verification", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await page
    .getByLabel("Rejection reason", { exact: true })
    .fill("No matching transfer yet");
  await page
    .getByRole("button", { name: "Reject report", exact: true })
    .click();
  await dancer.reload();
  await expect(
    dancer.getByText("No matching transfer yet", { exact: true }).first(),
  ).toBeVisible();
  await dancer
    .getByRole("button", { name: "Report paid", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Verify payment", exact: true })
    .click();
  await expect(
    page.getByText("Verified", { exact: true }).first(),
  ).toBeVisible();
  await dancer.reload();
  await expect(
    dancer.getByText("Verified", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("payment-detail.png"),
    fullPage: true,
  });
  await dancer.goto("http://127.0.0.1:3102/payments");
  const outstandingSection = dancer.locator("section").filter({
    has: dancer.getByRole("heading", { name: "Outstanding", exact: true }),
  });
  const history = dancer.locator("section").filter({
    has: dancer.getByRole("heading", {
      name: "Payment history",
      exact: true,
    }),
  });
  await expect(
    outstandingSection.getByRole("heading", { name: reason, exact: true }),
  ).toHaveCount(0);
  await expect(
    history.getByRole("heading", { name: reason, exact: true }),
  ).toBeVisible();
  await dancerContext.close();
});
test("payments: admin stays a dancer and can waive a charge with a reason", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request, "admin");
  const reason = `Team supplies ${info.project.name}`;
  await page.goto("/payments/new");
  await page
    .getByLabel("Amount per dancer (USD)", { exact: true })
    .fill("5.25");
  await page.getByLabel("Reason", { exact: true }).fill(reason);
  await page
    .getByLabel("Payment instructions", { exact: true })
    .fill("Ask the treasurer.");
  await page
    .getByLabel("Charge to", { exact: true })
    .selectOption("individual");
  await page.getByRole("radio", { name: /Prady Admin/ }).check();
  await page.getByRole("heading", { level: 1 }).click();
  await page.screenshot({
    path: info.outputPath("payment-editor.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Issue charges", exact: true })
    .click();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: reason, exact: true }) })
    .click();
  await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: reason, exact: true }),
  ).toBeVisible();
  const url = page.url();
  await expect(
    page.getByRole("button", { name: "Report paid", exact: true }),
  ).toBeVisible();
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto(url);
  await expect(
    dancer.getByRole("heading", { name: reason, exact: true }),
  ).toHaveCount(0);
  await dancerContext.close();
  await page
    .getByLabel("Waiver reason", { exact: true })
    .fill("Covered by the team");
  await page.getByRole("button", { name: "Waive charge", exact: true }).click();
  await expect(page.getByText("Waived", { exact: true }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
