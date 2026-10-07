import { afterEach, describe, it, expect, vi } from "vitest";
import { authConfig } from "../src/lib/config";
afterEach(() => vi.unstubAllEnvs());
describe("incomplete auth configuration", () => {
  it.each(["/rest/v1", "/auth/v1", "?apikey=example", "#api"])(
    "rejects a service endpoint instead of a project URL: %s",
    (suffix) => {
      vi.stubEnv(
        "NEXT_PUBLIC_SUPABASE_URL",
        `https://example.supabase.co${suffix}`,
      );
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
      vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
      expect(authConfig()).toBeNull();
    },
  );
  it("requires a canonical origin as well as Supabase", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
    vi.stubEnv("APP_ORIGIN", "");
    expect(authConfig()).toBeNull();
  });
  it("rejects insecure nonlocal callback origins", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
    vi.stubEnv("APP_ORIGIN", "http://example.com");
    expect(authConfig()).toBeNull();
  });
  it("accepts configured localhost development", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    expect(authConfig()?.origin).toBe("http://localhost:3000");
  });
});
