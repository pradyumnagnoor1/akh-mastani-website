"use client";

import NextLink, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";

function PendingPage() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return createPortal(
    <div className="page-navigation-loading" role="status" aria-live="polite">
      <strong>Loading page…</strong>
      <span>Getting the latest team information.</span>
    </div>,
    document.body,
  );
}

/** Next owns pending state, including cancellation and superseding transitions. */
export default function AppLink({
  children,
  ...props
}: ComponentProps<typeof NextLink>) {
  return (
    <NextLink {...props}>
      {children}
      <PendingPage />
    </NextLink>
  );
}
