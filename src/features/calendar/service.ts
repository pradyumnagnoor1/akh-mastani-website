import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/config";
export function calendarService() {
  const config = supabaseConfig(),
    secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secret)
    throw new Error("Calendar server setup is incomplete.");
  return createClient(config.url, secret, {
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
