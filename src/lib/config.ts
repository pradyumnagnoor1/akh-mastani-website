export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
  } catch {
    return null;
  }
  return { url, key };
}

export function appOrigin() {
  const raw = process.env.APP_ORIGIN;
  if (!raw) throw new Error("APP_ORIGIN is required for Google sign-in.");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  ) {
    throw new Error("APP_ORIGIN must use HTTPS outside local development.");
  }
  return url.origin;
}

export function authConfig() {
  const config = supabaseConfig();
  if (!config) return null;
  try {
    return { ...config, origin: appOrigin() };
  } catch {
    return null;
  }
}
