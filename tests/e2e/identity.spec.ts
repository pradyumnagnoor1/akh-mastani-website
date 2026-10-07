import { test, expect } from "@playwright/test";
test("unconfigured sign-in is honest, accessible and fits the screen", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Team sign-in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await expect(page.getByText("Sign-in is unavailable.")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
  });
});
for (const path of [
  "/home",
  "/roster",
  "/admin",
  "/onboarding",
  "/membership",
  "/announcements",
  "/todos",
  "/admin/groups",
]) {
  test(`unconfigured ${path} does not reveal team information`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeDisabled();
  });
}
test("unconfigured OAuth callback fails closed without leaking errors", async ({
  request,
}) => {
  const response = await request.get("/auth/callback?code=invalid");
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).toBe("Team sign-in is not configured yet.");
});
test("unknown route offers a recovery link", async ({ page }) => {
  await page.goto("/missing-page");
  await expect(
    page.getByRole("heading", { name: "This page isn’t here." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to the team space" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
