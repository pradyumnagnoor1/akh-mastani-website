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
  await dialog.getByLabel("Season name", { exact: true }).fill(name);
  await dialog
    .getByLabel("Season spending limit (USD)", { exact: true })
    .fill("10000");
  await dialog
    .getByLabel("Hotel allocation (USD)", { exact: true })
    .fill("3000");
  await dialog
    .getByLabel("Travel allocation (USD)", { exact: true })
    .fill("2000");
  await dialog
    .getByRole("button", { name: "Save budget", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
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
  await expect(
    execPage.getByRole("button", { name: "View queue" }),
  ).toHaveCount(0);
  await execPage
    .getByRole("button", { name: "Add expense", exact: true })
    .click();
  const ed = execPage.getByRole("dialog");
  await ed
    .getByLabel("What’s the expense?", { exact: true })
    .fill(`Hotel ${info.project.name}`);
  await ed.getByLabel("Total cost (USD)", { exact: true }).fill("500");
  await ed.getByRole("combobox", { name: /Category/ }).selectOption("Mix");
  await expect(
    ed.getByLabel("Pay from").locator('option[value="goodbull"]'),
  ).toHaveCount(0);
  await ed.getByRole("combobox", { name: /Category/ }).selectOption("Hotel");
  await ed.getByLabel("Partially paid", { exact: true }).check();
  await ed.getByLabel("Amount paid (USD)", { exact: true }).fill("100");
  await ed.getByLabel("Pay from").selectOption("goodbull");
  await ed.locator(".budget-optional summary").click();
  await ed.getByLabel(/Receipt \(PDF/).setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nreceipt fixture"),
  });
  await execPage.screenshot({
    path: info.outputPath("add-expense.png"),
    fullPage: true,
  });
  await ed.getByRole("button", { name: "Submit expense", exact: true }).click();
  await expect(ed).not.toBeVisible();
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
  await execPage.reload();
  await execPage.getByRole("button", { name: "Expenses", exact: true }).click();
  const ei = execPage.locator(".budget-expense").filter({
    has: execPage.getByText(`Hotel ${info.project.name}`, { exact: true }),
  });
  await ei.locator("summary").first().click();
  await ei.getByRole("button", { name: "Record payment" }).click();
  await ed.getByLabel("Payment amount (USD)", { exact: true }).fill("400");
  await ed.getByRole("button", { name: "Submit payment for approval" }).click();
  await expect(ed).not.toBeVisible();
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
  await dancerContext.close();
  await execContext.close();
  await captainContext.close();
});
