import { test, expect } from "@playwright/test";

test("navigation cache: revisiting a page avoids a server round trip", async ({
  page,
  context,
  request,
}, info) => {
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
  await page.goto("/todos");
  await expect(
    page.getByRole("heading", { name: "To-Dos", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", {
    name:
      info.project.name === "mobile" ? "Quick navigation" : "Main navigation",
  });
  await nav
    .getByRole("link", {
      name: info.project.name === "mobile" ? "Updates" : "Announcements",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Announcements", exact: true }),
  ).toBeVisible();
  let requests = 0;
  page.on("request", (req) => {
    if (
      new URL(req.url()).pathname === "/todos" &&
      !new URL(req.url()).searchParams.has("view") &&
      req.headers()["rsc"] === "1"
    )
      requests++;
  });
  const start = Date.now();
  await nav.getByRole("link", { name: "To-Dos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "To-Dos", exact: true }),
  ).toBeVisible();
  console.log(
    `${info.project.name}: cached navigation ${Date.now() - start}ms, ${requests} RSC requests`,
  );
  expect(requests).toBe(0);
  await page.screenshot({
    path: info.outputPath("cached-navigation.png"),
    fullPage: true,
  });
});

test("navigation preload: destination data is fetched before clicking", async ({
  page,
  context,
  request,
}, info) => {
  const session = await (
    await request.get("http://127.0.0.1:3201/fixture/session?role=dancer")
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
  const prefetched = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/todos" &&
      response.request().headers()["rsc"] === "1" &&
      !response.request().headers()["next-router-segment-prefetch"],
  );
  await page.goto("/announcements");
  const response = await prefetched;
  expect(response.status()).toBe(200);
  const nav = page.getByRole("navigation", {
    name:
      info.project.name === "mobile" ? "Quick navigation" : "Main navigation",
  });
  let requests = 0;
  page.on("request", (req) => {
    if (
      new URL(req.url()).pathname === "/todos" &&
      !new URL(req.url()).searchParams.has("view") &&
      req.headers()["rsc"] === "1"
    )
      requests++;
  });
  await nav.getByRole("link", { name: "To-Dos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "To-Dos", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.goto("/budget");
  await expect(page).toHaveURL(/\/home$/);
});
