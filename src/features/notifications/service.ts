import "server-only";
import { createClient } from "@supabase/supabase-js";
import { pushConfig } from "./config";
export function pushService() {
  const config = pushConfig();
  if (!config) throw new Error("Notifications are not configured.");
  return createClient(config.database.url, config.secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)])
            : AbortSignal.timeout(5000),
        }),
    },
  });
}
