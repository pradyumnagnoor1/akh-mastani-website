"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveName,
  manageMember,
  manageExecRoles,
  type FormState,
} from "@/features/identity/actions";
import {
  EXEC_ROLES,
  normalizeName,
  type Member,
} from "@/features/identity/policy";
import { DraftConflict } from "./draft-revision";
export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "button primary",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      type="submit"
      disabled={disabled || pending}
      data-refresh-busy={pending}
    >
      {pending ? pendingText : children}
    </button>
  );
}
export function NameForm() {
  const [state, action] = useActionState(saveName, {
    error: null,
  } as FormState);
  return (
    <form
      data-mutation-form
      action={action}
      className="stack"
      onReset={(e) => e.preventDefault()}
    >
      <label htmlFor="name">Your name on the roster</label>
      <input
        id="name"
        name="name"
        autoComplete="name"
        required
        maxLength={80}
        placeholder="First and last name"
        aria-describedby="name-help"
      />
      <p id="name-help" className="muted small">
        Use the name your teammates know. You only need to do this once.
      </p>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      <SubmitButton>
        Save and continue <span aria-hidden="true">→</span>
      </SubmitButton>
    </form>
  );
}
export function MemberControls({
  member,
  self,
}: {
  member: Member;
  self: boolean;
}) {
  const [originalName, setOriginalName] = useState(member.display_name ?? "");
  const nameChanged = originalName !== (member.display_name ?? "");
  const [state, action] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await manageMember(previous, data);
      if (result.success && data.get("operation") === "name")
        setOriginalName(normalizeName(String(data.get("name") ?? "")));
      return result;
    },
    {
      error: null,
    } as FormState,
  );
  return (
    <form
      data-mutation-form
      action={action}
      className="member-controls"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="id" value={member.id} />
      <label className="sr-only" htmlFor={`name-${member.id}`}>
        Name for {member.email}
      </label>
      <input
        id={`name-${member.id}`}
        name="name"
        defaultValue={member.display_name ?? ""}
        required
        maxLength={80}
      />
      <div className="actions">
        <ActionButton value="name" disabled={nameChanged}>
          Correct name
        </ActionButton>
        {!self && member.display_name && (
          <ActionButton
            value={member.status === "active" ? "inactive" : "active"}
          >
            {member.status === "active" ? "Deactivate" : "Approve access"}
          </ActionButton>
        )}
      </div>
      <DraftConflict changed={nameChanged} />
      {state.error && (
        <p className="error small" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="small" role="status">
          {state.success}
        </p>
      )}
    </form>
  );
}
function ActionButton({
  value,
  children,
  disabled = false,
}: {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="operation"
      value={value}
      className="button secondary small"
      disabled={disabled || pending}
      data-refresh-busy={pending}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

export function ExecRoleControls({ member }: { member: Member }) {
  const original = JSON.stringify(member.exec_roles ?? []);
  const [expected, setExpected] = useState(original);
  const [selected, setSelected] = useState(member.exec_roles ?? []);
  const [editing, setEditing] = useState(!member.exec_roles?.length);
  const [state, action, pending] = useActionState(
    async (previous: FormState, data: FormData) => {
      const result = await manageExecRoles(previous, data);
      if (result.success) {
        const savedRoles = EXEC_ROLES.filter((role) =>
          data.getAll("roles").includes(role),
        ).sort();
        setExpected(JSON.stringify(savedRoles));
        setSelected(savedRoles);
        setEditing(false);
      }
      return result;
    },
    { error: null } as FormState,
  );
  return (
    <form
      data-mutation-form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="stack"
    >
      <input type="hidden" name="id" value={member.id} />
      <input type="hidden" name="expected_roles" value={expected} />
      {editing ? (
        <>
          <fieldset
            className="exec-role-picker"
            disabled={pending || original !== expected}
          >
            <legend>Exec roles for {member.display_name}</legend>
            {EXEC_ROLES.map((role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  name="roles"
                  value={role}
                  checked={selected.includes(role)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, role]
                        : selected.filter((r) => r !== role),
                    )
                  }
                />
                {role}
              </label>
            ))}
          </fieldset>
          <div className="actions">
            <SubmitButton disabled={original !== expected}>
              Save exec roles
            </SubmitButton>
            {JSON.parse(expected).length > 0 && (
              <button
                type="button"
                disabled={pending}
                className="button secondary small"
                onClick={() => {
                  setSelected(JSON.parse(expected));
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          className="button secondary small"
          disabled={original !== expected}
          onClick={() => setEditing(true)}
        >
          Change exec role
        </button>
      )}
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
      {original !== expected && (
        <p className="notice">Roles changed. Refresh before editing again.</p>
      )}
    </form>
  );
}
