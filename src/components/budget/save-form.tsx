"use client";
import { useActionState, type ReactNode } from "react";
import { mutateBudget } from "@/features/budget/actions";
import type { BudgetState } from "@/features/budget/types";
import { DraftConflict, useDraftRevision } from "@/components/draft-revision";
export function SaveForm({
  id,
  version,
  operation,
  children,
  onSaved,
  label = "Save",
  extra,
}: {
  id: string;
  version: number;
  operation: string;
  children: ReactNode;
  onSaved: () => void;
  label?: string;
  extra?: Record<string, string>;
}) {
  const draft = useDraftRevision(id, version);
  const [state, action, pending] = useActionState(
    async (previous: BudgetState, form: FormData) => {
      let result: BudgetState;
      try {
        result = await mutateBudget(previous, form);
      } catch {
        result = {
          error:
            "Unable to confirm the save. Your entries are still here. Refresh before retrying.",
        };
      }
      if (result.success) onSaved();
      return result;
    },
    {},
  );
  return (
    <form action={action} data-refresh-busy={pending} className="budget-form">
      <input type="hidden" name="id" value={draft.id} />
      <input type="hidden" name="version" value={draft.version} />
      <input type="hidden" name="operation" value={operation} />
      {Object.entries(extra ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <DraftConflict changed={draft.changed} />
      <fieldset disabled={pending || draft.changed}>{children}</fieldset>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      <button
        className="button primary budget-save"
        disabled={pending || draft.changed}
      >
        {pending ? "Saving…" : label}
      </button>
    </form>
  );
}
