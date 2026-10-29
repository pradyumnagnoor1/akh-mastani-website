import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
async function login(
  context: BrowserContext,
  request: APIRequestContext,
  role: string,
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
test("budget: season, fund reconciliation, private expense review and exact deductions", async ({
  page,
  context,
  request,
  browser,
}, info) => {
  await login(context, request, "admin");
  await page.goto("/budget");
  const name = `Season ${info.project.name}`;
  await expect(
    page.getByRole("heading", { name: "Budget", exact: true }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Set up budget", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Set up budget", exact: true })
      .click();
  else {
    await page
      .getByRole("button", { name: "Allocated Budget", exact: true })
      .click();
    await page.getByRole("button", { name: "Create another season" }).click();
  }
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Budget name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog
    .getByLabel("Hotel allocation (USD)", { exact: true })
    .fill("3000");
  await dialog
    .getByLabel("Travel allocation (USD)", { exact: true })
    .fill("2000");
  await dialog.getByLabel("Competition allocation (USD)").fill("400");
  await dialog.getByLabel("Mix allocation (USD)").fill("200");
  await dialog.getByRole("button", { name: "Add custom category" }).click();
  await dialog.getByLabel("Custom category name").fill("Team meals");
  await dialog.getByLabel("Team meals allocation (USD)").fill("300");
  await expect(dialog.getByRole("status")).toContainText("$5,900.00");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: /Competition fee/ }).click();
  const comp = dialog.locator(".budget-planned-row").first();
  await comp.getByLabel("Planned amount for Competition fee").fill("300");
  await comp.getByLabel("Request a fund deduction for this expense").check();
  await comp.getByLabel("Deduct Competition fee from").selectOption("venmo");
  await dialog.getByRole("button", { name: /Mix fee/ }).click();
  const mix = dialog.locator(".budget-planned-row").last();
  await mix.getByLabel("Planned amount for Mix fee").fill("100");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByText("Total budget", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create budget", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Allocated Budget" }).click();
  await expect(
    page.getByRole("heading", { name: "Known expenses" }),
  ).toBeVisible();
  await expect(page.locator(".budget-planned-overview")).toContainText(
    "Competition fee",
  );
  await expect(page.locator(".budget-planned-overview")).toContainText(
    "Fund deduction awaiting review",
  );
  await page.getByRole("button", { name: "Funds", exact: true }).click();
  const goodbull = page.locator(".budget-fund").filter({
    has: page.getByRole("heading", { name: "SOFC Good Bull", exact: true }),
  });
  await goodbull.locator("summary").first().click();
  await goodbull.getByRole("button", { name: "Update balance" }).click();
  await dialog
    .getByLabel("Current balance (USD)", { exact: true })
    .fill("5000");
  await dialog
    .getByLabel("Why does the recorded balance need updating?")
    .fill("Checked account");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const execContext = await browser.newContext({
    viewport: page.viewportSize()!,
  });
  await login(execContext, request, "exec");
  const execPage = await execContext.newPage();
  await execPage.goto("http://127.0.0.1:3102/budget");
  await expect(execPage).toHaveURL(/\/home$/);
  await expect(execPage.getByRole("link", { name: "Budget" })).toHaveCount(0);
  await execPage.goto("http://127.0.0.1:3102/expenses/new");
  await expect(
    execPage.getByRole("heading", { name: "Add expense" }),
  ).toBeVisible();
  await expect(execPage.getByText("Team funds")).toHaveCount(0);
  await expect(execPage.getByText("Allocated Budget")).toHaveCount(0);
  await expect(
    execPage.getByRole("option", { name: "Team meals" }),
  ).toHaveCount(1);
  const form = execPage.locator(".budget-submit-card form");
  await form
    .getByLabel("What’s the expense?", { exact: true })
    .fill(`Hotel ${info.project.name}`);
  await form.getByLabel("Total cost (USD)", { exact: true }).fill("500");
  await form.getByRole("combobox", { name: /Category/ }).selectOption("Mix");
  await expect(
    form.getByLabel("Pay from").locator('option[value="goodbull"]'),
  ).toHaveCount(0);
  await form.getByRole("combobox", { name: /Category/ }).selectOption("Hotel");
  await form.getByLabel("Partially paid", { exact: true }).check();
  await form.getByLabel("Amount paid (USD)", { exact: true }).fill("100");
  await form.getByLabel("Pay from").selectOption("goodbull");
  await form.locator(".budget-optional summary").click();
  await form.getByLabel(/Receipt \(PDF/).setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nreceipt fixture"),
  });
  await execPage.screenshot({
    path: info.outputPath("add-expense.png"),
    fullPage: true,
  });
  await form
    .getByRole("button", { name: "Submit expense for approval", exact: true })
    .click();
  await expect(
    execPage.getByRole("heading", { name: "Expense sent for review" }),
  ).toBeVisible();
  const captainContext = await browser.newContext({
    viewport: page.viewportSize()!,
  });
  await login(captainContext, request, "captain");
  const captain = await captainContext.newPage();
  await captain.goto("http://127.0.0.1:3102/budget");
  await captain.getByRole("button", { name: "View queue" }).click();
  const item = captain.locator(".budget-expense").filter({
    has: captain.getByText(`Hotel ${info.project.name}`, { exact: true }),
  });
  await item.locator("summary").first().click();
  await item.getByRole("button", { name: "Review expense" }).click();
  await captain
    .getByRole("dialog")
    .getByRole("combobox")
    .selectOption("changes");
  await captain
    .getByRole("dialog")
    .getByLabel("Explain the requested changes")
    .fill("Add the booking note");
  await captain
    .getByRole("dialog")
    .getByRole("button", { name: "Request changes", exact: true })
    .click();
  await expect(captain.getByRole("dialog")).not.toBeVisible();
  await execPage.reload();
  const ownExpense = execPage
    .locator(".budget-own-item")
    .filter({ hasText: `Hotel ${info.project.name}` });
  await expect(ownExpense).toContainText("Add the booking note");
  await ownExpense.getByRole("button", { name: "Edit" }).click();
  await expect(
    execPage.getByRole("heading", { name: "Edit expense" }),
  ).toBeVisible();
  await execPage
    .locator(".budget-submit-card form .budget-optional summary")
    .click();
  await execPage
    .locator(".budget-submit-card form")
    .getByLabel("Notes")
    .fill("Booking confirmed");
  await execPage
    .getByRole("button", { name: "Save changes for review" })
    .click();
  await expect(
    execPage.getByRole("heading", { name: "Changes sent for review" }),
  ).toBeVisible();
  await captain.reload();
  await captain.getByRole("button", { name: "View queue" }).click();
  await item.locator("summary").first().click();
  await item.getByRole("button", { name: "Review expense" }).click();
  await captain
    .getByRole("dialog")
    .getByRole("button", { name: "Approve expense", exact: true })
    .click();
  await expect(captain.getByRole("dialog")).not.toBeVisible();
  await captain.getByRole("button", { name: "Funds", exact: true }).click();
  const cf = captain.locator(".budget-fund").filter({
    has: captain.getByRole("heading", {
      name: "SOFC Good Bull",
      exact: true,
    }),
  });
  await expect(cf).toContainText("$4,900.00");
  await captain.screenshot({
    path: info.outputPath("funds.png"),
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  const ei = page.locator(".budget-expense").filter({
    has: page.getByText(`Hotel ${info.project.name}`, { exact: true }),
  });
  await ei.locator("summary").first().click();
  await ei.getByRole("button", { name: "Record payment" }).click();
  await dialog.getByLabel("Payment amount (USD)", { exact: true }).fill("400");
  await dialog
    .getByRole("button", { name: "Submit payment for approval" })
    .click();
  await expect(dialog).not.toBeVisible();
  await captain.reload();
  await captain.getByRole("button", { name: "View queue" }).click();
  await item.locator("summary").first().click();
  await item.getByRole("button", { name: "Review expense" }).click();
  await captain
    .getByRole("dialog")
    .getByRole("button", { name: "Approve expense", exact: true })
    .click();
  await expect(captain.getByRole("dialog")).not.toBeVisible();
  await captain.getByRole("button", { name: "Funds", exact: true }).click();
  await expect(cf).toContainText("$4,500.00");
  await captain
    .getByRole("button", { name: "Allocated Budget", exact: true })
    .click();
  await captain
    .getByRole("combobox", { name: /Category/ })
    .selectOption("Hotel");
  await expect(captain.locator(".budget-progress").first()).toContainText(
    "$2,500.00",
  );
  expect(
    await captain.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await captain.screenshot({
    path: info.outputPath("category-budget.png"),
    fullPage: true,
  });
  const dancerContext = await browser.newContext();
  await login(dancerContext, request, "dancer");
  const dancer = await dancerContext.newPage();
  await dancer.goto("http://127.0.0.1:3102/budget");
  await expect(dancer).toHaveURL(/\/home$/);
  await dancer.goto("http://127.0.0.1:3102/expenses/new");
  await expect(dancer).toHaveURL(/\/home$/);
  await dancerContext.close();
  await execContext.close();
  await captainContext.close();
});
