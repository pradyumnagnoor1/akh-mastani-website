"use client";
import { useActionState } from "react";
import { saveCommunicationMetadata } from "@/features/communication/metadata-actions";
import type { CommunicationPost } from "@/features/communication/types";
export function CommunicationMetadata({ post }: { post: CommunicationPost }) {
  const [state, action, pending] = useActionState(saveCommunicationMetadata, {
    error: null,
  });
  return (
    <form action={action} className="panel">
      <h2>Visibility and importance</h2>
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="version" value={post.version} />
      <label>
        <input
          type="checkbox"
          name="pinned"
          defaultChecked={!!post.pinned_at}
        />{" "}
        Pin to the top
      </label>
      {post.kind === "task" && (
        <label>
          Priority
          <select name="priority" defaultValue={post.priority ?? "normal"}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button className="button secondary" disabled={pending}>
        {pending ? "Saving…" : "Save pin and priority"}
      </button>
    </form>
  );
}
