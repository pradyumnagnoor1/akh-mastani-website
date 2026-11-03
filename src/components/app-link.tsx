"use client";

import NextLink, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import { useState, type ComponentProps } from "react";

function PendingPage() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return createPortal(
    <div className="page-navigation-loading" role="status" aria-live="polite">
      <strong>Loading page…</strong>
    </div>,
    document.body,
  );
}

/** Next owns pending state, including cancellation and superseding transitions. */
export default function AppLink({
  children,
  prefetch,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof NextLink>) {
  const [intent, setIntent] = useState(false);
  const warm = () => {
    if (prefetch !== false) setIntent(true);
  };
  return (
    <NextLink
      {...props}
      prefetch={
        prefetch === false ? false : intent ? true : (prefetch ?? false)
      }
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        warm();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        warm();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        warm();
      }}
    >
      {children}
      <PendingPage />
    </NextLink>
  );
}
