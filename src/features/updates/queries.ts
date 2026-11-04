import "server-only";
import { requireAdmin, requireMember } from "@/features/identity/session";

export type ReleaseUpdate = {
  version: string;
  releasedOn: string | null;
  summary: string;
  changes: string[];
};

export async function memberUpdates(): Promise<ReleaseUpdate[]> {
  await requireMember();
  return [
    {
      version: "2.1",
      releasedOn: null,
      summary: "Practice events, pinned posts, and clearer task priorities.",
      changes: [
        "Create a practice event with its announcement. Google Calendar serves as a reference schedule.",
        "Find featured events at the top of Practice Calendar and pinned posts on Announcements and To-Dos.",
        "See task importance with Low, Normal, High, and Urgent labels.",
        "Read website release notes here in Updates.",
      ],
    },
  ];
}

export async function adminUpdates(): Promise<ReleaseUpdate[]> {
  await requireAdmin();
  return [
    {
      version: "2.1",
      releasedOn: null,
      summary: "Changes to publishing and managing team communication.",
      changes: [
        "General announcement is the default. Choose Practice announcement to create an event and its announcement together.",
        "Google-event linking is removed from announcement publishing. Google reference events do not drive Today or practice reminders.",
        "Pin or unpin communication within its existing audience, and set task priority independently of its due date.",
        "Member release notes and these management release notes have separate pages.",
      ],
    },
  ];
}
