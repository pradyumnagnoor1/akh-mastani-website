import type { Audience } from "./types";
/** Saved-group UI can select a live segment without copying its assignments. */
export function savedAudience(audience: Audience, source: string) {
  const fromSegment = audience === "group" && source.startsWith("segment:");
  return {
    audience: fromSegment ? ("segment" as const) : audience,
    source: fromSegment ? source.slice("segment:".length) : source,
  };
}
