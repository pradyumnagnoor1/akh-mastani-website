import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  seal,
  unseal,
  validateAttempt,
  authorizationUrl,
} from "../src/features/calendar/oauth";
vi.mock("server-only", () => ({}));
const key = randomBytes(32).toString("base64");
describe("calendar OAuth security", () => {
  it("encrypts credentials and rejects modification, wrong key and wrong purpose", () => {
    const value = seal("private-token", key, "token");
    expect(value).not.toContain("private-token");
    expect(unseal(value, key, "token")).toBe("private-token");
    expect(() => unseal(value.slice(0, -4) + "AAAA", key, "token")).toThrow();
    expect(() =>
      unseal(value, randomBytes(32).toString("base64"), "token"),
    ).toThrow();
    expect(() => unseal(value, key, "state")).toThrow();
  });
  it("binds callbacks to admin, state, client and expiration", () => {
    const attempt = {
      state: "a".repeat(43),
      verifier: "b".repeat(43),
      actor: "admin",
      calendarId: "team@group.calendar.google.com",
      clientId: "client",
      expires: 1000,
    };
    expect(
      validateAttempt(attempt, "admin", attempt.state, "client", 999),
    ).toEqual(attempt);
    for (const args of [
      ["dancer", attempt.state, "client", 999],
      ["admin", "wrong", "client", 999],
      ["admin", attempt.state, "other", 999],
      ["admin", attempt.state, "client", 1000],
    ] as const)
      expect(() =>
        validateAttempt(attempt, args[0], args[1], args[2], args[3]),
      ).toThrow();
  });
  it("requests offline readonly authorization with PKCE and explicit consent", () => {
    const url = new URL(
      authorizationUrl({
        clientId: "client",
        redirectUri: "https://team.example/api/calendar/oauth/callback",
        state: "state",
        verifier: "v".repeat(43),
      }),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events.readonly",
    );
  });
});
it("exchanges a code with verifier, requires offline readonly grant, and hides provider errors", async () => {
  const { exchangeCode } = await import("../src/features/calendar/oauth");
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        refresh_token: "refresh",
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
      }),
      { status: 200 },
    ),
  );
  const options = {
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "https://team.example/api/calendar/oauth/callback",
    code: "code",
    verifier: "verifier",
  };
  expect(await exchangeCode(options, request)).toBe("refresh");
  const sent = request.mock.calls[0][1]!;
  expect((sent.body as URLSearchParams).get("code_verifier")).toBe("verifier");
  request.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        access_token: "only-access",
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
      }),
    ),
  );
  await expect(exchangeCode(options, request)).rejects.toThrow("offline");
  request.mockResolvedValueOnce(
    new Response("private-provider-detail", { status: 400 }),
  );
  await expect(exchangeCode(options, request)).rejects.toThrow(
    "Google authorization failed",
  );
});
