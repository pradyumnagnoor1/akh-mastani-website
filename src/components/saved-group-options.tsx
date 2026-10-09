import type { CommunicationGroup } from "@/features/communication/types";
import type { Segment } from "@/features/segments/policy";
export function SavedGroupOptions({
  groups,
  segments,
}: {
  groups: CommunicationGroup[];
  segments: Segment[];
}) {
  return (
    <>
      <optgroup label="Segment lineups">
        {segments
          .filter((s) => !s.archived_at)
          .map((s) => (
            <option key={s.id} value={`segment:${s.id}`}>
              {s.name}
            </option>
          ))}
      </optgroup>
      <optgroup label="Other saved groups">
        {groups
          .filter((g) => !g.archived_at)
          .map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
      </optgroup>
    </>
  );
}
