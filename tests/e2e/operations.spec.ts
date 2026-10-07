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
test("operations: roster privacy, admin export and integrated dashboard", async ({
  page,
  context,
  request,
}, info) => {
  const adminSession = await (
    await request.get("http://127.0.0.1:3201/fixture/session?role=admin")
  ).json();
  const label = `Private charge ${info.project.name}`;
  const issue = await request.post(
    "http://127.0.0.1:3201/rest/v1/rpc/issue_payment_charges",
    {
      headers: { Authorization: `Bearer ${adminSession.access_token}` },
      data: {
        batch_id: crypto.randomUUID(),
        amount: 725,
        charge_reason: label,
        payment_instructions: "Pay the team",
        due_date: null,
        audience: "individual",
        recipient_ids: ["00000000-0000-4000-8000-000000000001"],
        source_id: null,
      },
    },
  );
  expect(issue.ok()).toBe(true);
  await login(context, request, "dancer");
  await page.goto("/roster/00000000-0000-4000-8000-000000000001");
  await expect(
    page.getByRole("heading", { name: "Prady Admin", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Payments", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(label, { exact: false })).toHaveCount(0);
  const forbidden = await context.request.get("/api/admin/export", {
    maxRedirects: 0,
  });
  expect(forbidden.status()).toBe(307);
  await page.goto("/roster/00000000-0000-4000-8000-000000000002");
  await expect(
    page.getByRole("heading", { name: "Payments", exact: true }),
  ).toBeVisible();
  await login(context, request, "admin");
  await page.goto("/roster/00000000-0000-4000-8000-000000000001");
  await expect(page.getByText(label, { exact: false })).toBeVisible();
  const exported = await context.request.get("/api/admin/export");
  expect(exported.status()).toBe(200);
  expect(exported.headers()["cache-control"]).toContain("no-store");
  expect(exported.headers()["content-disposition"]).toContain("attachment");
  const data = await exported.json();
  expect(
    data.tables.payment_charges.some(
      (c: { reason: string }) => c.reason === label,
    ),
  ).toBe(true);
  expect(JSON.stringify(data)).not.toContain("fixture-refresh");
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Admin overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your payments", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("home-integrated.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ status: "ok" });
});
