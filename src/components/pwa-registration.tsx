"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        .catch(() => {
          // The notification panel exposes registration failures when used.
        });
    }
  }, []);
  return null;
}
