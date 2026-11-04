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

test("updates: member notes and protected admin notes", async ({
  page,
  context,
  request,
}) => {
  await login(context, request, "dancer");
  await page.goto("/updates");
  await expect(
    page.getByRole("heading", { name: "Updates", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "v2.1" })).toBeVisible();
  await expect(
    page.getByText("2026-11-04", { exact: true }),
  ).toBeVisible();
  await page.goto("/admin/updates");
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole("heading", { name: "Admin Updates", exact: true }),
  ).toHaveCount(0);
  await login(context, request, "admin");
  await page.goto("/admin/updates");
  await expect(
    page.getByRole("heading", { name: "Admin Updates", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "v2.1" })).toBeVisible();
});
