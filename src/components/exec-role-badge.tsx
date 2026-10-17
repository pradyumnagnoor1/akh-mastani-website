export function ExecRoleBadge({ role }: { role: string }) {
  return (
    <span className="badge exec-role-badge">
      <span className="exec-role-label">Exec role</span>
      <strong>{role}</strong>
    </span>
  );
}
