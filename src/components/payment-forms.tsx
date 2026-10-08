"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "./forms";
import {
  issuePayments,
  transitionPayment,
  managePaymentCharge,
} from "@/features/payments/actions";
import {
  formatMoney,
  type Charge,
  type FormState,
} from "@/features/payments/types";
import { parseAmount } from "@/features/payments/policy";
import type { Member } from "@/features/identity/policy";
import type { Segment, Assignment } from "@/features/segments/policy";
import type {
  Audience,
  CommunicationGroup,
  GroupMember,
} from "@/features/communication/types";
function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="notice">
          {state.success}
        </p>
      )}
    </>
  );
}
function PeoplePicker({
  people,
  selected,
  setSelected,
  single = false,
}: {
  people: Member[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  single?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = people.filter((p) =>
    `${p.display_name} ${p.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <label htmlFor="recipient-search">Find a dancer</label>
      <input
        id="recipient-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search names or emails"
      />
      <div className="dancer-picker">
        {filtered.map((p) => (
          <label
            key={p.id}
            className={`dancer-option ${selected.includes(p.id) ? "chosen" : ""}`}
          >
            <input
              type={single ? "radio" : "checkbox"}
              name={single ? "person-picker" : undefined}
              checked={selected.includes(p.id)}
              onChange={() =>
                setSelected(
                  single
                    ? [p.id]
                    : selected.includes(p.id)
                      ? selected.filter((id) => id !== p.id)
                      : [...selected, p.id],
                )
              }
            />
            <span>
              <strong>{p.display_name ?? p.email}</strong>
              <small>{p.email}</small>
            </span>
            {p.is_admin && <span className="badge">Admin · Dancer</span>}
          </label>
        ))}
      </div>
      {!filtered.length && (
        <p className="muted">No dancers match your search.</p>
      )}
    </>
  );
}

export function PaymentForm({
  id,
  people,
  groups,
  groupMembers,
  segments,
  assignments,
}: {
  id: string;
  people: Member[];
  groups: CommunicationGroup[];
  groupMembers: GroupMember[];
  segments: Segment[];
  assignments: Assignment[];
}) {
  const [state, action] = useActionState(issuePayments, {
    error: null,
  } as FormState);
  const [audience, setAudience] = useState<Audience>("individual"),
    [source, setSource] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [instructions, setInstructions] = useState(""),
    [due, setDue] = useState("");
  const active = people.filter((p) => p.status === "active");
  const ids =
    audience === "team"
      ? active.map((p) => p.id)
      : audience === "group"
        ? groupMembers
            .filter((g) => g.group_id === source)
            .map((g) => g.member_id)
        : audience === "segment"
          ? assignments
              .filter((a) => a.segment_id === source)
              .map((a) => a.member_id)
          : selected;
  const recipients = active.filter((p) => ids.includes(p.id));
  let cents = 0;
  try {
    cents = parseAmount(amount);
  } catch {}
  return (
    <form action={action} className="segment-editor communication-form">
      <input type="hidden" name="id" value={id} />
      {(audience === "individual" || audience === "selected"
        ? selected
        : []
      ).map((id) => (
        <input key={id} type="hidden" name="members" value={id} />
      ))}
      <section className="panel stack">
        <p className="eyebrow">01 / THE CHARGE</p>
        <label htmlFor="amount">Amount per dancer (USD)</label>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />
        <label htmlFor="reason">Reason</label>
        <input
          id="reason"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={160}
          required
        />
        <label htmlFor="instructions">Payment instructions</label>
        <textarea
          id="instructions"
          name="instructions"
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={3000}
          required
        />
        <label htmlFor="due">Due date (optional)</label>
        <input
          id="due"
          name="due_on"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <p className="muted small">
          Admins can edit outstanding charges or delete a charge with an
          explanation. Payment activity retains previous details.
        </p>
      </section>
      <section className="panel stack">
        <p className="eyebrow">02 / THE DANCERS</p>
        <label htmlFor="audience">Charge to</label>
        <select
          id="audience"
          name="audience"
          value={audience}
          onChange={(e) => {
            setAudience(e.target.value as Audience);
            setSource("");
            setSelected([]);
          }}
        >
          <option value="individual">One dancer</option>
          <option value="selected">Selected dancers</option>
          <option value="group">Saved group</option>
          <option value="segment">Segment lineup</option>
          <option value="team">Entire team</option>
        </select>
        {(audience === "individual" || audience === "selected") && (
          <PeoplePicker
            people={active}
            selected={selected}
            setSelected={setSelected}
            single={audience === "individual"}
          />
        )}
        {(audience === "group" || audience === "segment") && (
          <>
            <label htmlFor="source">
              {audience === "group" ? "Group" : "Segment"}
            </label>
            <select
              id="source"
              name="source_id"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              required
            >
              <option value="">Choose {audience}</option>
              {(audience === "group" ? groups : segments)
                .filter((g) => !g.archived_at)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </>
        )}
        <div className="recipient-preview" aria-live="polite">
          <h3>
            Recipient preview · {recipients.length}{" "}
            {recipients.length === 1 ? "dancer" : "dancers"}
          </h3>
          <p>
            {recipients.map((p) => p.display_name ?? p.email).join(", ") ||
              "Choose at least one active dancer."}
          </p>
          <p>
            {formatMoney(cents)} each · {formatMoney(cents * recipients.length)}{" "}
            total
          </p>
        </div>
        <p className="muted small">
          This saves a snapshot of these dancers. Later membership changes do
          not change their charges. The site records payments; it does not
          transfer money.
        </p>
      </section>
      <Feedback state={state} />
      <div className="actions">
        <SubmitButton disabled={!recipients.length || !cents}>
          Issue charges
        </SubmitButton>
        <Link href="/payments" className="button secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
export function PaymentAction({
  charge,
  operation,
}: {
  charge: Charge;
  operation: "report" | "verify" | "reject" | "waive";
}) {
  const [state, action] = useActionState(transitionPayment, {
    error: null,
  } as FormState);
  const [note, setNote] = useState("");
  const label = {
    report: "Report paid",
    verify: "Verify payment",
    reject: "Reject report",
    waive: "Waive charge",
  }[operation];
  return (
    <form action={action} className="panel stack payment-action">
      <h3>{label}</h3>
      <input type="hidden" name="id" value={charge.id} />
      <input type="hidden" name="version" value={charge.version} />
      <input type="hidden" name="operation" value={operation} />
      {operation !== "verify" && (
        <>
          <label htmlFor={`note-${operation}`}>
            {operation === "report"
              ? "Reference or note (optional)"
              : operation === "reject"
                ? "Rejection reason"
                : "Waiver reason"}
          </label>
          <textarea
            id={`note-${operation}`}
            name="note"
            rows={2}
            maxLength={1000}
            required={operation !== "report"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </>
      )}
      {operation === "verify" && (
        <p className="muted small">
          Confirm you have checked the payment. Verification clears this amount
          from outstanding balances.
        </p>
      )}
      <SubmitButton>{label}</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function EditPaymentForm({ charge }: { charge: Charge }) {
  const [state, action] = useActionState(managePaymentCharge, {
    error: null,
  } as FormState);
  const [fields, setFields] = useState({
    reason: charge.reason,
    amount: (charge.amount_cents / 100).toFixed(2),
    instructions: charge.instructions,
    due_on: charge.due_on ?? "",
    note: "",
  });
  return (
    <form
      action={action}
      className="panel stack"
      onReset={(e) => e.preventDefault()}
    >
      <input type="hidden" name="id" value={charge.id} />
      <input type="hidden" name="version" value={charge.version} />
      <input type="hidden" name="operation" value="update" />
      <label htmlFor="charge-reason">Reason</label>
      <input
        id="charge-reason"
        name="reason"
        required
        maxLength={160}
        value={fields.reason}
        onChange={(e) => setFields({ ...fields, reason: e.target.value })}
      />
      <label htmlFor="charge-amount">Amount (USD)</label>
      <input
        id="charge-amount"
        name="amount"
        type="number"
        min="0.01"
        max="10000"
        step="0.01"
        required
        value={fields.amount}
        onChange={(e) => setFields({ ...fields, amount: e.target.value })}
      />
      <label htmlFor="charge-instructions">Payment instructions</label>
      <textarea
        id="charge-instructions"
        name="instructions"
        required
        rows={4}
        maxLength={3000}
        value={fields.instructions}
        onChange={(e) => setFields({ ...fields, instructions: e.target.value })}
      />
      <label htmlFor="charge-due">Due date (optional)</label>
      <input
        id="charge-due"
        name="due_on"
        type="date"
        value={fields.due_on}
        onChange={(e) => setFields({ ...fields, due_on: e.target.value })}
      />
      <label htmlFor="charge-explanation">Change explanation</label>
      <textarea
        value={fields.note}
        onChange={(e) => setFields({ ...fields, note: e.target.value })}
        id="charge-explanation"
        name="note"
        required
        maxLength={1000}
        rows={2}
      />
      {charge.status === "reported" && (
        <p className="notice">
          Changing this charge cancels the current payment report. The dancer
          must report payment again before verification.
        </p>
      )}
      <p className="muted small">
        The assigned dancer stays the same. Previous details remain in payment
        activity.
      </p>
      <Feedback state={state} />
      <div className="actions">
        <SubmitButton>Save charge</SubmitButton>
        <Link href={`/payments/${charge.id}`} className="button secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
export function DeletePaymentForm({ charge }: { charge: Charge }) {
  const [state, action] = useActionState(managePaymentCharge, {
    error: null,
  } as FormState);
  const [note, setNote] = useState("");
  return (
    <form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="panel stack"
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Delete this charge? It will leave outstanding balances. Payment activity will be retained.",
          )
        )
          e.preventDefault();
      }}
    >
      <h3>Delete charge</h3>
      <input type="hidden" name="id" value={charge.id} />
      <input type="hidden" name="version" value={charge.version} />
      <input type="hidden" name="operation" value="delete" />
      <label htmlFor="delete-charge-note">Deletion reason</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        id="delete-charge-note"
        name="note"
        required
        maxLength={1000}
        rows={2}
      />
      <SubmitButton className="button secondary">Delete charge</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}
