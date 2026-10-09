"use client";
import { useLinkStatus } from "next/link";

/** Link owns this state, so cancelled or superseded navigation clears it. */
export function NavigationHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      className="navigation-hint"
      data-pending={pending}
      aria-hidden="true"
    />
  );
}
