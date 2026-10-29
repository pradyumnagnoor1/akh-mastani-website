"use client";
import { useActionState, useState } from "react";
import { ReceiptText, ShieldCheck } from "lucide-react";
import { mutateBudget } from "@/features/budget/actions";
import { eligibleFund } from "@/features/budget/policy";
import { CATEGORIES, type BudgetState } from "@/features/budget/types";

const FUNDS = [
  { id: "venmo", name: "Venmo" },
  { id: "goodbull", name: "SOFC Good Bull · Hotel & Travel only" },
  { id: "sofc", name: "Main SOFC account" },
];

export function ExpenseSubmission({
  seasonId,
  draftId,
}: {
  seasonId: string | null;
  draftId: string;
}) {
  const [id, setId] = useState(draftId);
  return (
    <div className="budget-workspace budget-submit-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TEAM EXPENSES</span>
          <h1>Add expense</h1>
          <p className="muted">
            Send the details to Captains and Logistics & Finance for review.
          </p>
        </div>
      </div>
      {seasonId ? (
        <SubmitForm
          key={id}
          id={id}
          seasonId={seasonId}
          onAnother={() => setId(crypto.randomUUID())}
        />
      ) : (
        <div className="panel budget-submit-card">
          <h2>Expense submissions will open soon</h2>
          <p>Logistics & Finance needs to set up the current budget first.</p>
        </div>
      )}
    </div>
  );
}

function SubmitForm({
  id,
  seasonId,
  onAnother,
}: {
  id: string;
  seasonId: string;
  onAnother: () => void;
}) {
  const [state, action, pending] = useActionState(
    mutateBudget,
    {} as BudgetState,
  );
  const [category, setCategory] = useState("");
  const [fund, setFund] = useState("");
  const [payment, setPayment] = useState("unpaid");
  if (state.success)
    return (
      <div
        className="panel budget-submit-card budget-submit-success"
        role="status"
      >
        <ShieldCheck size={34} aria-hidden="true" />
        <h2>Expense sent for review</h2>
        <p>
          Captains and Logistics & Finance can verify it before any payment
          changes the recorded account balance.
        </p>
        <button className="button primary" onClick={onAnother}>
          Add another expense
        </button>
      </div>
    );
  return (
    <div className="panel budget-submit-card">
      <div className="budget-submit-intro">
        <span className="budget-fund-icon">
          <ReceiptText size={22} />
        </span>
        <div>
          <h2>Expense details</h2>
          <p className="muted">
            Just the essentials. You can attach a receipt too.
          </p>
        </div>
      </div>
      <form action={action} className="budget-form" data-refresh-busy={pending}>
        <input type="hidden" name="operation" value="submit" />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value="0" />
        <input type="hidden" name="season_id" value={seasonId} />
        <fieldset disabled={pending}>
          <label>
            What’s the expense?
            <input
              name="title"
              placeholder="Hotel for Tufaan"
              required
              maxLength={160}
              autoFocus
            />
          </label>
          <label>
            Total cost (USD)
            <div className="budget-amount-input">
              <span aria-hidden="true">$</span>
              <input
                name="total"
                aria-label="Total cost (USD)"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </div>
          </label>
          <label>
            Category
            <select
              name="category"
              value={category}
              onChange={(e) => {
                const next = e.target.value;
                setCategory(next);
                if (!eligibleFund(fund, next)) setFund("");
              }}
              required
            >
              <option value="">Choose a category</option>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Pay from
            <select
              name="fund_id"
              value={fund}
              onChange={(e) => setFund(e.target.value)}
              required
            >
              <option value="">Choose a funding source</option>
              {FUNDS.filter((item) => eligibleFund(item.id, category)).map(
                (item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ),
              )}
            </select>
          </label>
          <fieldset className="budget-payment-choice">
            <legend>Payment status</legend>
            {[
              ["unpaid", "Not paid"],
              ["partial", "Partially paid"],
              ["paid", "Fully paid"],
            ].map(([value, label]) => (
              <label
                key={value}
                className={payment === value ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="payment_status"
                  value={value}
                  checked={payment === value}
                  onChange={() => setPayment(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {payment === "partial" && (
            <label>
              Amount paid (USD)
              <input
                name="paid"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </label>
          )}
          {payment !== "unpaid" && (
            <label className="budget-checkbox">
              <input type="checkbox" name="included" />
              This payment is already reflected in the account balance
            </label>
          )}
          <details className="budget-optional">
            <summary>
              Add details{" "}
              <span className="muted">Receipt, due date, notes</span>
            </summary>
            <label>
              Receipt (PDF, JPEG or PNG, up to 2 MB)
              <input
                type="file"
                name="receipt"
                accept="application/pdf,image/jpeg,image/png"
              />
            </label>
            <label>
              Due date
              <input type="date" name="due_on" />
            </label>
            <label>
              Notes
              <textarea name="notes" maxLength={2000} rows={3} />
            </label>
          </details>
        </fieldset>
        {state.error && (
          <p role="alert" className="notice error">
            {state.error}
          </p>
        )}
        <button className="button primary budget-save" disabled={pending}>
          {pending ? "Sending…" : "Submit expense for approval"}
        </button>
      </form>
    </div>
  );
}
