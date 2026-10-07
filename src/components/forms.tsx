"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveName,
  manageMember,
  type FormState,
} from "@/features/identity/actions";
import type { Member } from "@/features/identity/policy";
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
    <button className={className} type="submit" disabled={disabled || pending}>
      {pending ? pendingText : children}
    </button>
  );
}
export function NameForm() {
  const [state, action] = useActionState(saveName, {
    error: null,
  } as FormState);
  return (
    <form action={action} className="stack">
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
  const [state, action] = useActionState(manageMember, {
    error: null,
  } as FormState);
  return (
    <form action={action} className="member-controls">
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
        <ActionButton value="name">Correct name</ActionButton>
        {!self && member.display_name && (
          <ActionButton
            value={member.status === "active" ? "inactive" : "active"}
          >
            {member.status === "active" ? "Deactivate" : "Approve access"}
          </ActionButton>
        )}
      </div>
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
}: {
  value: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="operation"
      value={value}
      className="button secondary small"
      disabled={pending}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
