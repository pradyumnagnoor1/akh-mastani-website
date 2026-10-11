"use client";
import { useState } from "react";

/** Keep identity and optimistic revision paired with the fields in a mounted draft. */
export function useDraftRevision(id: string, version = 0) {
  const [revision] = useState({ id, version });
  return { ...revision, changed: version !== revision.version };
}

export function DraftConflict({ changed }: { changed: boolean }) {
  return changed ? (
    <p className="notice error" role="alert">
      This item changed while you were editing. Your draft is still here.
      Refresh the page to load the latest version before saving.
    </p>
  ) : null;
}
