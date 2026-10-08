import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  const cache = { add: vi.fn(async () => {}), put: vi.fn() };
  const fallback = new Response("Generic offline page");
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => fallback),
  };
  const fetch = vi.fn(async () => new Response("Private team page"));
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://team.example" },
      addEventListener: (
        name: string,
        handler: (event: Record<string, unknown>) => void,
      ) => {
        handlers[name] = handler;
      },
      registration: { showNotification },
      clients: { matchAll: async () => [], openWindow },
    },
    caches,
    fetch,
    URL,
    Response,
  });
  async function dispatch(
    name: string,
    properties: Record<string, unknown> = {},
  ) {
    let promise: Promise<unknown> | undefined;
    const event = {
      ...properties,
      waitUntil: (p: Promise<unknown>) => {
        promise = p;
      },
      respondWith: (p: Promise<unknown>) => {
        promise = p;
      },
    };
    handlers[name](event);
    return await promise;
  }
  return {
    dispatch,
    cache,
    caches,
    fetch,
    fallback,
    showNotification,
    openWindow,
  };
}

describe("PWA worker privacy and notification behavior", () => {
  it("caches only a generic offline page and never saves private responses", async () => {
    const w = worker();
    await w.dispatch("install");
    expect(w.cache.add).toHaveBeenCalledExactlyOnceWith("/offline.html");
    const request = {
      mode: "navigate",
      method: "GET",
      url: "https://team.example/payments",
    };
    const response = (await w.dispatch("fetch", { request })) as Response;
    expect(await response.text()).toBe("Private team page");
    expect(w.cache.put).not.toHaveBeenCalled();
    w.fetch.mockRejectedValueOnce(new Error("offline"));
    expect(await w.dispatch("fetch", { request })).toBe(w.fallback);
    expect(w.caches.match).toHaveBeenCalledExactlyOnceWith("/offline.html");
  });
  it("does not intercept API, PDF, external navigation, or POST requests", async () => {
    const w = worker();
    for (const request of [
      { mode: "cors", method: "GET", url: "https://team.example/api/calendar" },
      { mode: "cors", method: "GET", url: "https://team.example/private.pdf" },
      { mode: "navigate", method: "GET", url: "https://external.example/" },
      {
        mode: "navigate",
        method: "POST",
        url: "https://team.example/payments",
      },
    ])
      expect(await w.dispatch("fetch", { request })).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it("always displays a visible notification, including malformed payloads", async () => {
    const w = worker();
    await w.dispatch("push", {
      data: {
        json: () => {
          throw new Error("invalid");
        },
      },
    });
    expect(w.showNotification).toHaveBeenCalledWith(
      "AKH Mastani",
      expect.objectContaining({
        body: "Open the team hub for an update.",
        data: { url: "/home" },
      }),
    );
    await w.dispatch("push", {
      data: {
        json: () => ({
          title: "Practice",
          body: "Updated",
          url: "/calendar",
          tag: "practice",
        }),
      },
    });
    expect(w.showNotification).toHaveBeenLastCalledWith(
      "Practice",
      expect.objectContaining({
        body: "Updated",
        tag: "practice",
        data: { url: "/calendar" },
      }),
    );
  });
  it.each([
    "https://external.example/",
    "//external.example/",
    "/\\external.example/",
    "/auth/signout",
    "/api/calendar",
    "/login",
  ])("rejects unsafe notification destination %s", async (url) => {
    const w = worker();
    const close = vi.fn();
    await w.dispatch("notificationclick", {
      notification: { close, data: { url } },
    });
    expect(close).toHaveBeenCalledOnce();
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith(
      "https://team.example/home",
    );
  });
  it("opens a valid team destination", async () => {
    const w = worker();
    await w.dispatch("notificationclick", {
      notification: { close: vi.fn(), data: { url: "/todos?filter=mine" } },
    });
    expect(w.openWindow).toHaveBeenCalledExactlyOnceWith(
      "https://team.example/todos?filter=mine",
    );
  });
});
