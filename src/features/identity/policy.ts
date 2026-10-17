export const EXEC_ROLES = [
  "Captain",
  "Logistics & Finance",
  "Production",
  "Social",
] as const;
export type ExecRole = (typeof EXEC_ROLES)[number];
export function canPostAnnouncements(member: Member) {
  return member.is_admin || !!member.exec_roles?.length;
}
export function canManagePost(
  member: Member,
  post: { kind: string; created_by: string | null },
) {
  return (
    member.is_admin ||
    (post.kind === "announcement" &&
      canPostAnnouncements(member) &&
      post.created_by === member.id)
  );
}
export type Member = {
  id: string;
  email: string;
  display_name: string | null;
  status: "pending" | "active" | "inactive";
  is_admin: boolean;
  is_owner?: boolean;
  exec_roles?: ExecRole[];
};

export function isTamuEmail(email: string | undefined | null): boolean {
  return (
    typeof email === "string" &&
    /^[^@\s]+@tamu\.edu$/i.test(email) &&
    email.trim() === email
  );
}

export function normalizeName(name: string): string {
  if (/[\u0000-\u001f\u007f]/.test(name))
    throw new Error("Enter a name without control characters.");
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized || [...normalized].length > 80)
    throw new Error("Use between 1 and 80 characters for your name.");
  return normalized;
}

export function destination(member: Member | null): string {
  if (!member) return "/login";
  if (member.status === "inactive") return "/membership";
  if (!member.display_name) return "/onboarding";
  return member.status === "active" ? "/home" : "/membership";
}
