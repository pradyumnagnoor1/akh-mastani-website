"use client";
import { useEffect, useState } from "react";
// Retain a server clock estimate across remount/back navigation. Older cached
// props must never restart an expired item's countdown.
let latestServerTime = 0;
let serverOffset = 0;
function clock(serverNow: number) {
  if (serverNow > latestServerTime) {
    latestServerTime = serverNow;
    serverOffset = serverNow - Date.now();
  }
  return Date.now() + serverOffset;
}
/** Remove already-rendered content at its cutoff, even before the next refresh. */
export function Expires({
  at,
  serverNow,
  children,
  detail = false,
}: {
  at?: string | null;
  serverNow: number;
  children: React.ReactNode;
  detail?: boolean;
}) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!at) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the external expiration clock.
      setExpired(false);
      return;
    }
    const cutoff = Date.parse(at);
    clock(serverNow);
    let timer: ReturnType<typeof setTimeout>;
    function check() {
      clearTimeout(timer);
      const left = cutoff - clock(serverNow);
      setExpired(left <= 0);
      if (left > 0) timer = setTimeout(check, Math.min(left, 60_000));
    }
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [at, serverNow]);
  if (expired)
    return detail ? (
      <section className="panel empty-state">
        <h1>This item has expired</h1>
        <p className="muted">It is no longer available.</p>
      </section>
    ) : null;
  return children;
}
