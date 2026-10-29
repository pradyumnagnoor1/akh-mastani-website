// Test-only upstream transport fixture. Never loaded by production or imported by src.
if (process.env.CHOREO_FIXTURE_MODE === "1") {
  const actualFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (
      url.origin === "https://oauth2.googleapis.com" &&
      url.pathname === "/token"
    ) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (
      url.origin === "https://www.googleapis.com" &&
      url.pathname.startsWith("/drive/v3/")
    ) {
      const fixture = new URL(
        "http://127.0.0.1:3201/fixture/drive" + url.pathname,
      );
      fixture.search = url.search;
      return actualFetch(fixture, init);
    }
    return actualFetch(input, init);
  };
}
