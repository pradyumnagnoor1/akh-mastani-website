"use client";
import { useActionState, useRef, useState, type ReactNode } from "react";
import {
  Plus,
  ChevronDown,
  Wallet,
  ChartNoAxesCombined,
  ReceiptText,
  ShieldCheck,
  X,
  Download,
  ArrowUpRight,
} from "lucide-react";
import { mutateBudget, importBudget } from "@/features/budget/actions";
import {
  oldSheetRows,
  validateImportRows,
  type ImportRow,
} from "@/features/budget/import";
import {
  canManage,
  canReview,
  eligibleFund,
  money,
  totals,
} from "@/features/budget/policy";
import {
  type BudgetData,
  type BudgetRole,
  type BudgetState,
  type Expense,
  type Fund,
  type PlannedExpense,
  type Season,
} from "@/features/budget/types";
import { DraftConflict, useDraftRevision } from "@/components/draft-revision";
import { SeasonQuestionnaire } from "./season-questionnaire";
type Modal =
  | { kind: "expense"; id: string; expense?: Expense }
  | { kind: "season"; id: string; season?: Season }
  | { kind: "season-delete"; id: string; season: Season }
  | { kind: "planned-delete"; id: string; plan: PlannedExpense; season: Season }
  | { kind: "balance"; id: string; fund: Fund }
  | { kind: "import"; id: string }
  | {
      kind: "review" | "payment" | "refund" | "delete";
      id: string;
      expense: Expense;
    };
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
const statusLabel = {
  pending: "Pending approval",
  approved: "Approved",
  changes: "Changes requested",
};

function BudgetBar({
  limit,
  expenses,
}: {
  limit: number | null;
  expenses: Expense[];
}) {
  const t = totals(expenses),
    used = t.paid + t.reserved,
    remaining = (limit ?? 0) - used;
  const scale = Math.max(limit ?? 0, used, 1);
  return (
    <div className="budget-progress">
      <div className="budget-progress-heading">
        <div>
          <span className="eyebrow">
            {limit === null ? "Allocation" : "Remaining to spend"}
          </span>
          <strong
            className={limit !== null && remaining < 0 ? "budget-danger" : ""}
          >
            {limit === null ? "Budget not set" : money(Math.abs(remaining))}
            {limit !== null && remaining < 0 ? " over budget" : ""}
          </strong>
        </div>
        <span className="muted">
          {limit === null
            ? "Set a limit to track progress"
            : `${money(limit)} allocated`}
        </span>
      </div>
      <div
        className="budget-bar"
        role="img"
        aria-label={`Paid ${money(t.paid)}, committed ${money(t.reserved)}, ${limit === null ? "budget not set" : `remaining ${money(remaining)}`}`}
      >
        <span
          className="budget-bar-paid"
          style={{ width: `${(t.paid / scale) * 100}%` }}
        />
        <span
          className="budget-bar-committed"
          style={{ width: `${((t.reserved - t.pending) / scale) * 100}%` }}
        />
        <span
          className="budget-bar-pending"
          style={{ width: `${(t.pending / scale) * 100}%` }}
        />
      </div>
      <div className="budget-legend">
        <span>
          <i className="budget-bar-paid" />
          Paid <b>{money(t.paid)}</b>
        </span>
        <span>
          <i className="budget-bar-committed" />
          Approved commitments <b>{money(t.reserved - t.pending)}</b>
        </span>
        <span>
          <i className="budget-bar-pending" />
          Awaiting review <b>{money(t.pending)}</b>
        </span>
      </div>
    </div>
  );
}
function BudgetCircle({
  limit,
  expenses,
}: {
  limit: number;
  expenses: Expense[];
}) {
  const t = totals(expenses);
  const paid = Math.max(0, t.paid);
  const approved = Math.max(0, t.reserved - t.pending);
  const pending = Math.max(0, t.pending);
  const used = paid + approved + pending;
  const remaining = Math.max(0, limit - used);
  const scale = Math.max(limit, used, 1);
  const p1 = (paid / scale) * 100;
  const p2 = ((paid + approved) / scale) * 100;
  const p3 = (used / scale) * 100;
  return (
    <div className="budget-circle-layout">
      <div
        className="budget-circle"
        role="img"
        aria-label={`Paid ${money(t.paid)}, approved commitments ${money(approved)}, awaiting review ${money(pending)}, remaining ${money(limit - used)}`}
        style={{
          background: `conic-gradient(var(--budget-paid) 0 ${p1}%, var(--budget-committed) ${p1}% ${p2}%, var(--budget-pending) ${p2}% ${p3}%, var(--budget-remaining) ${p3}% 100%)`,
        }}
      >
        <div className="budget-circle-center">
          <span>Remaining to spend</span>
          <strong>{money(Math.abs(limit - used))}</strong>
          {used > limit && <small>over budget</small>}
        </div>
      </div>
      <div className="budget-circle-details">
        <strong>{money(limit)} allocated</strong>
        <div className="budget-legend">
          <span>
            <i className="budget-bar-paid" />
            Paid <b>{money(t.paid)}</b>
          </span>
          <span>
            <i className="budget-bar-committed" />
            Approved commitments <b>{money(approved)}</b>
          </span>
          <span>
            <i className="budget-bar-pending" />
            Awaiting review <b>{money(pending)}</b>
          </span>
          <span>
            <i className="budget-bar-remaining" />
            Remaining <b>{money(remaining)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
function TeamFundsVisual({ funds }: { funds: Fund[] }) {
  const recorded = funds.filter((fund) => !!fund.updated_at);
  const total = recorded.reduce((sum, fund) => sum + fund.balance_cents, 0);
  const positiveTotal = recorded.reduce(
    (sum, fund) => sum + Math.max(0, fund.balance_cents),
    0,
  );
  return (
    <section
      className="panel budget-funds-visual"
      aria-label="Team funds overview"
    >
      <div>
        <span className="eyebrow">RECORDED TEAM FUNDS</span>
        <strong>
          {recorded.length ? money(total) : "Balances not entered"}
        </strong>
        <p className="small muted">
          Current recorded balances across {recorded.length} of three accounts.
        </p>
      </div>
      <div
        className="budget-funds-stack"
        role="img"
        aria-label={
          recorded.length
            ? recorded
                .map((fund) => `${fund.name}: ${money(fund.balance_cents)}`)
                .join(", ")
            : "No recorded fund balances"
        }
      >
        {recorded.map((fund) => (
          <span
            key={fund.id}
            className={`budget-funds-stack-${fund.id}`}
            style={{
              width: `${positiveTotal ? (Math.max(0, fund.balance_cents) / positiveTotal) * 100 : 0}%`,
            }}
          />
        ))}
      </div>
      <div className="budget-funds-key">
        {funds.map((fund) => (
          <span key={fund.id}>
            <i className={`budget-funds-stack-${fund.id}`} />
            {fund.name}{" "}
            <b>{fund.updated_at ? money(fund.balance_cents) : "Not entered"}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
function SaveForm({
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
function ExpenseForm({
  data,
  season,
  category,
  expense,
  id,
  onSaved,
}: {
  data: BudgetData;
  season: Season;
  category: string;
  expense?: Expense;
  id: string;
  onSaved: () => void;
}) {
  const [cat, setCat] = useState(
    expense?.category ?? (category === "all" ? "" : category),
  );
  const [fund, setFund] = useState(expense?.fund_id ?? "");
  const [amount, setAmount] = useState(
    expense ? String(expense.total_cents / 100) : "",
  );
  const [payment, setPayment] = useState(
    expense
      ? expense.reported_cents === expense.total_cents
        ? "paid"
        : expense.reported_cents > 0
          ? "partial"
          : "unpaid"
      : "unpaid",
  );
  const allocation = data.allocations.find(
    (a) => a.season_id === season.id && a.category === cat,
  );
  const others = data.expenses.filter(
    (e) => e.season_id === season.id && e.category === cat && e.id !== id,
  );
  const amountCents = Math.round(Number(amount || 0) * 100);
  const t = totals(others);
  const selectedFund = data.funds.find((f) => f.id === fund);
  const fundReserved = totals(
    data.expenses.filter((e) => e.fund_id === fund && e.id !== id),
  ).reserved;
  return (
    <SaveForm
      id={id}
      version={expense?.version ?? 0}
      operation="submit"
      onSaved={onSaved}
      label={expense ? "Resubmit for approval" : "Submit expense"}
      extra={{ season_id: season.id }}
    >
      <label>
        What’s the expense?
        <input
          name="title"
          placeholder="Hotel for Tufaan"
          required
          maxLength={160}
          defaultValue={expense?.title}
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </label>
      <label>
        Category
        <select
          name="category"
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            if (!eligibleFund(fund, e.target.value)) setFund("");
          }}
          required
        >
          <option value="">Choose a category</option>
          {data.allocations
            .filter((a) => a.season_id === season.id)
            .map((a) => (
              <option key={a.id}>{a.category}</option>
            ))}
        </select>
      </label>
      <fieldset className="budget-payment-choice">
        <legend>Payment status</legend>
        {[
          ["unpaid", "Not paid"],
          ["partial", "Partially paid"],
          ["paid", "Fully paid"],
        ].map(([value, label]) => (
          <label key={value} className={payment === value ? "selected" : ""}>
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
            defaultValue={expense ? String(expense.reported_cents / 100) : ""}
            required
            placeholder="0.00"
          />
        </label>
      )}
      <label>
        Pay from
        <select
          name="fund_id"
          value={fund}
          onChange={(e) => setFund(e.target.value)}
          required
        >
          <option value="">Choose a funding source</option>
          {data.funds
            .filter((f) => eligibleFund(f.id, cat))
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.id === "goodbull" ? " · Hotel & Travel only" : ""}
              </option>
            ))}
        </select>
      </label>
      {payment !== "unpaid" && (
        <label className="budget-checkbox">
          <input
            type="checkbox"
            name="included"
            defaultChecked={expense?.included_in_balance}
          />
          This payment is already included in the recorded account balance
        </label>
      )}
      <details className="budget-optional">
        <summary>
          Add details <span className="muted">Receipt, due date, notes</span>
        </summary>
        <label>
          Receipt (PDF, JPEG or PNG, up to 2 MB)
          <input
            type="file"
            name="receipt"
            accept="application/pdf,image/jpeg,image/png"
          />
        </label>
        {data.receipts.some((r) => r.expense_id === id) && (
          <p className="muted small">
            Existing receipt is kept unless you choose a replacement.
          </p>
        )}
        <label>
          Due date
          <input
            type="date"
            name="due_on"
            defaultValue={expense?.due_on ?? ""}
          />
        </label>
        <label>
          Notes
          <textarea
            name="notes"
            maxLength={2000}
            defaultValue={expense?.notes}
            rows={3}
          />
        </label>
      </details>
      {cat && Number.isFinite(amountCents) && amountCents > 0 && (
        <div className="budget-impact">
          <strong>After this expense</strong>
          <p>
            {allocation
              ? `${money(allocation.limit_cents - t.paid - t.reserved - amountCents)} remaining in ${cat}`
              : `${cat} budget not set`}
          </p>
          {selectedFund && (
            <p>
              {selectedFund.updated_at
                ? `${money(selectedFund.balance_cents - fundReserved - Math.max(0, amountCents - (expense?.paid_cents ?? 0)))} available in ${selectedFund.name} after reservations`
                : `${selectedFund.name} balance not yet entered`}
            </p>
          )}
          <small>
            Pending expenses reserve funds. Payments deduct only after a second
            person approves.
          </small>
        </div>
      )}
    </SaveForm>
  );
}
export function BudgetWorkspace({
  data,
  memberId,
  role,
}: {
  data: BudgetData;
  memberId: string;
  role: BudgetRole;
}) {
  const [tab, setTab] = useState<"funds" | "allocated" | "expenses">("funds");
  const [seasonId, setSeasonId] = useState(
    [...data.seasons].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0]?.id ?? "",
  );
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [modal, setModal] = useState<Modal | null>(null);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const season =
    data.seasons.find((s) => s.id === seasonId) ??
    [...data.seasons].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];
  const seasonExpenses = data.expenses.filter(
    (e) => e.season_id === season?.id,
  );
  const selected = seasonExpenses.filter(
    (e) => category === "all" || e.category === category,
  );
  const reviewable = data.expenses.filter(
    (e) =>
      e.status === "pending" &&
      e.submitted_by !== memberId &&
      e.created_by !== memberId,
  );
  const pendingCount = data.expenses.filter(
    (e) => e.status === "pending",
  ).length;
  const manager = canManage(role),
    reviewer = canReview(role);
  const currentModal =
    modal && "expense" in modal && modal.expense
      ? {
          ...modal,
          expense:
            data.expenses.find((e) => e.id === modal.expense!.id) ??
            modal.expense,
        }
      : modal;
  function open(value: Modal) {
    opener.current = document.activeElement as HTMLElement;
    setModal(value);
    if (!dialog.current?.open) dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
    setModal(null);
    opener.current?.focus();
  }
  function saved() {
    if (modal?.kind === "season") setSeasonId(modal.id);
    if (modal?.kind === "season-delete") {
      setSeasonId("");
      setCategory("all");
    }
    setMessage(
      modal?.kind === "season-delete"
        ? "Budget deleted."
        : "Saved. Budget and funds are up to date.",
    );
    close();
  }
  function expenseRows(items: Expense[], inFundLedger = false) {
    return items.length ? (
      <div className="budget-expenses">
        {[...items]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((e) => {
            const receipt = data.receipts.find((r) => r.expense_id === e.id);
            const overdue =
              e.due_on &&
              e.due_on <
                new Date().toLocaleDateString("en-CA", {
                  timeZone: "America/Chicago",
                }) &&
              e.paid_cents < e.total_cents;
            return (
              <details className="budget-expense" key={e.id}>
                <summary>
                  <div>
                    <strong>{e.title}</strong>
                    <span className="muted small">
                      {e.category} ·{" "}
                      {data.funds.find((f) => f.id === e.fund_id)?.name}
                      {inFundLedger &&
                      data.plannedExpenses.some((plan) => plan.id === e.id)
                        ? " · Known expense"
                        : ""}
                    </span>
                  </div>
                  <div className="budget-expense-end">
                    <strong>{money(e.total_cents)}</strong>
                    <span className={`badge budget-status-${e.status}`}>
                      {statusLabel[e.status]}
                    </span>
                  </div>
                  <ChevronDown size={16} />
                </summary>
                <div className="budget-expense-detail">
                  <div className="budget-numbers">
                    <span>
                      Verified paid <b>{money(e.paid_cents)}</b>
                    </span>
                    <span>
                      Remaining due <b>{money(e.total_cents - e.paid_cents)}</b>
                    </span>
                    <span>
                      Reported, awaiting review{" "}
                      <b>{money(e.reported_cents - e.paid_cents)}</b>
                    </span>
                    {e.refunded_cents > 0 && (
                      <span>
                        Refunded <b>{money(e.refunded_cents)}</b>
                      </span>
                    )}
                    {e.pending_refund_cents > 0 && (
                      <span>
                        Refund awaiting review{" "}
                        <b>{money(e.pending_refund_cents)}</b>
                      </span>
                    )}
                  </div>
                  <p className="small muted">
                    Submitted by {e.submitted_name} · {date(e.created_at)}
                    {e.due_on
                      ? ` · ${overdue ? "Overdue" : "Due"} ${e.due_on}`
                      : ""}
                  </p>
                  {e.included_in_balance && (
                    <p className="notice">
                      Reported payment is marked as already included in the
                      account balance. Approval will not deduct it again.
                    </p>
                  )}
                  {e.notes && <p className="budget-note">{e.notes}</p>}
                  {receipt && (
                    <a className="button" href={`/budget/receipts/${e.id}`}>
                      <Download size={16} />
                      Receipt
                    </a>
                  )}
                  {e.reviewed_name && (
                    <p className="small">
                      {statusLabel[e.status]} by {e.reviewed_name}
                      {e.reviewed_at ? ` · ${date(e.reviewed_at)}` : ""}
                    </p>
                  )}
                  {e.review_note && <p className="notice">{e.review_note}</p>}
                  <div className="budget-row-actions">
                    {reviewer &&
                      e.status === "pending" &&
                      e.created_by !== memberId &&
                      e.submitted_by !== memberId && (
                        <button
                          className="button primary"
                          onClick={() =>
                            open({ kind: "review", id: e.id, expense: e })
                          }
                        >
                          Review expense
                        </button>
                      )}
                    {(e.created_by === memberId || role === "owner") &&
                      e.pending_refund_cents === 0 && (
                        <button
                          className="button"
                          onClick={() =>
                            open({ kind: "expense", id: e.id, expense: e })
                          }
                        >
                          Edit expense
                        </button>
                      )}
                    {e.status === "approved" &&
                      e.paid_cents < e.total_cents && (
                        <button
                          className="button"
                          onClick={() =>
                            open({ kind: "payment", id: e.id, expense: e })
                          }
                        >
                          Record payment
                        </button>
                      )}
                    {(e.status === "approved" ||
                      (e.status === "changes" &&
                        e.pending_refund_cents > 0 &&
                        (e.submitted_by === memberId || role === "owner"))) &&
                      e.paid_cents > e.refunded_cents && (
                        <button
                          className="button"
                          onClick={() =>
                            open({ kind: "refund", id: e.id, expense: e })
                          }
                        >
                          {e.status === "changes"
                            ? "Correct refund"
                            : "Record refund"}
                        </button>
                      )}
                    {manager && (
                      <button
                        className="button"
                        onClick={() =>
                          open({ kind: "delete", id: e.id, expense: e })
                        }
                      >
                        Cancel expense
                      </button>
                    )}
                  </div>
                  <details>
                    <summary>History</summary>
                    {data.events
                      .filter((v) => v.expense_id === e.id)
                      .map((v) => (
                        <p key={v.id} className="small muted">
                          {date(v.created_at)} · {v.action.replaceAll("_", " ")}{" "}
                          · {v.actor_name}
                          {v.note ? ` · ${v.note}` : ""}
                          {v.delta_cents ? ` · ${money(v.delta_cents)}` : ""}
                        </p>
                      ))}
                  </details>
                </div>
              </details>
            );
          })}
      </div>
    ) : (
      <div className="budget-empty">
        <ReceiptText />
        <h3>No expenses here yet</h3>
        <p className="muted">
          Add an expense to start tracking spending and approvals.
        </p>
      </div>
    );
  }
  return (
    <div className="budget-workspace">
      <header className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">TEAM FINANCES</p>
          <h1>Budget</h1>
          <p className="muted">
            Know what’s available. Keep every expense accounted for.
          </p>
        </div>
        <button
          className="button primary"
          disabled={!season}
          onClick={() => open({ kind: "expense", id: crypto.randomUUID() })}
        >
          <Plus size={18} />
          Add expense
        </button>
      </header>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {reviewer && (
        <button
          className={`budget-approval-button ${pendingCount ? "has-pending" : ""}`}
          aria-label={`Needs approval: ${pendingCount} pending expenses${reviewable.length ? `, ${reviewable.length} ready for your review` : ""}`}
          onClick={() => {
            setTab("expenses");
            setStatus("pending");
            setCategory("all");
          }}
        >
          <ShieldCheck size={18} />
          <span>Needs approval</span>
          {pendingCount > 0 && (
            <b className="budget-approval-count">{pendingCount}</b>
          )}
          <ArrowUpRight size={15} />
        </button>
      )}
      <nav className="view-tabs budget-tabs" aria-label="Budget sections">
        {(
          [
            ["funds", "Funds", Wallet],
            ["allocated", "Allocated Budget", ChartNoAxesCombined],
            ["expenses", "Expenses", ReceiptText],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => {
              setTab(key);
              setStatus("all");
            }}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      {!season && (
        <section className="panel budget-empty">
          <ChartNoAxesCombined />
          <h2>Start with a season budget</h2>
          <p className="muted">
            Set your spending limit and category allocations before adding
            expenses.
          </p>
          {manager ? (
            <button
              className="button primary"
              onClick={() => open({ kind: "season", id: crypto.randomUUID() })}
            >
              Set up budget
            </button>
          ) : (
            <p>Logistics & Finance can set up the first season.</p>
          )}
        </section>
      )}
      {tab === "funds" && (
        <>
          <div className="budget-section-heading">
            <div>
              <h2>Team funds</h2>
              <p className="muted">
                {data.funds.some((f) => f.updated_at)
                  ? `${money(data.funds.reduce((s, f) => s + (f.updated_at ? f.balance_cents : 0), 0))} recorded across ${data.funds.filter((f) => f.updated_at).length} of three accounts.`
                  : "No account balances entered yet."}{" "}
                Good Bull is restricted.
              </p>
            </div>
            <div className="budget-row-actions">
              <a className="button" href="/budget/export">
                Export CSV
              </a>
            </div>
          </div>
          <TeamFundsVisual funds={data.funds} />
          <div className="budget-funds">
            {data.funds.map((f) => {
              const expenses = data.expenses.filter((e) => e.fund_id === f.id);
              const t = totals(expenses);
              return (
                <details className="panel budget-fund" key={f.id}>
                  <summary>
                    <div className="budget-fund-heading">
                      <span className="budget-fund-icon">
                        <Wallet size={22} />
                      </span>
                      <div>
                        <h3>{f.name}</h3>
                        <span className="small muted">
                          {f.id === "goodbull"
                            ? "Hotel & Travel only"
                            : f.id === "sofc"
                              ? "Football funds and consolidated Groupfund"
                              : "Team funds"}
                        </span>
                      </div>
                      <ChevronDown size={19} />
                    </div>
                    <div className="budget-fund-balance">
                      <span className="eyebrow">
                        {f.updated_at
                          ? "Available"
                          : "Available after commitments"}
                      </span>
                      <strong
                        className={
                          f.updated_at && f.balance_cents - t.reserved < 0
                            ? "budget-danger"
                            : ""
                        }
                      >
                        {f.updated_at
                          ? money(f.balance_cents - t.reserved)
                          : "Balance not entered"}
                      </strong>
                    </div>
                    <div className="budget-numbers">
                      <span>
                        Recorded balance{" "}
                        <b>
                          {f.updated_at
                            ? money(f.balance_cents)
                            : "Not entered"}
                        </b>
                      </span>
                      <span>
                        Reserved <b>{money(t.reserved)}</b>
                      </span>
                      <span>
                        Awaiting review <b>{money(t.pending)}</b>
                      </span>
                    </div>
                    <span className="small muted">
                      {f.updated_at
                        ? `Updated ${date(f.updated_at)}`
                        : "Balance not yet entered"}{" "}
                      · Expand account ledger
                    </span>
                  </summary>
                  <div className="budget-fund-ledger">
                    {manager && (
                      <button
                        className="button"
                        onClick={() =>
                          open({
                            kind: "balance",
                            id: crypto.randomUUID(),
                            fund: f,
                          })
                        }
                      >
                        Update balance
                      </button>
                    )}
                    <h4>Expenses assigned to this account</h4>
                    {expenseRows(expenses, true)}
                    <h4>Balance history</h4>
                    {data.events
                      .filter(
                        (e) => e.fund_id === f.id && e.balance_after !== null,
                      )
                      .reverse()
                      .map((e) => (
                        <div className="budget-ledger-entry" key={e.id}>
                          <div>
                            <strong>
                              {e.action === "balance_updated"
                                ? "Balance adjustment"
                                : (data.expenses.find(
                                    (x) => x.id === e.expense_id,
                                  )?.title ?? "Payment")}
                            </strong>
                            <span className="small muted">
                              {e.actor_name} · {date(e.created_at)}
                              {e.note ? ` · ${e.note}` : ""}
                            </span>
                          </div>
                          <div>
                            <strong>{money(e.delta_cents)}</strong>
                            <span className="small muted">
                              Balance {money(e.balance_after!)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}
      {tab !== "funds" && season && (
        <>
          <div className="budget-filters">
            <label>
              Season
              <select
                value={season.id}
                onChange={(e) => {
                  setSeasonId(e.target.value);
                  setCategory("all");
                }}
              >
                {data.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">All categories</option>
                {data.allocations
                  .filter((a) => a.season_id === season.id)
                  .map((a) => (
                    <option key={a.id}>{a.category}</option>
                  ))}
              </select>
            </label>
            {tab === "expenses" && (
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All expenses</option>
                  <option value="pending">Needs approval (all seasons)</option>
                  <option value="changes">Changes requested</option>
                  <option value="approved">Approved</option>
                </select>
              </label>
            )}
          </div>
          {tab === "allocated" ? (
            <>
              <section className="panel">
                {category !== "all" && (
                  <button
                    className="budget-back-to-all"
                    onClick={() => setCategory("all")}
                  >
                    ← All categories
                  </button>
                )}
                <div className="budget-section-heading">
                  <h2>{category === "all" ? season.name : category}</h2>
                  {manager && category === "all" && (
                    <div className="budget-row-actions">
                      <button
                        className="button"
                        onClick={() =>
                          open({ kind: "season", id: season.id, season })
                        }
                      >
                        Edit budget
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          open({ kind: "season-delete", id: season.id, season })
                        }
                      >
                        Delete budget
                      </button>
                    </div>
                  )}
                </div>
                {category === "all" ? (
                  <BudgetCircle
                    limit={season.limit_cents}
                    expenses={selected}
                  />
                ) : (
                  <BudgetBar
                    limit={
                      data.allocations.find(
                        (a) =>
                          a.season_id === season.id && a.category === category,
                      )?.limit_cents ?? null
                    }
                    expenses={selected}
                  />
                )}
                {category === "all" && (
                  <p className="small muted">
                    Original season budget: {money(season.original_cents)}.
                    Pending expenses count toward commitments.
                  </p>
                )}
              </section>
              {category === "all" && (
                <div className="budget-category-grid">
                  {data.allocations
                    .filter((a) => a.season_id === season.id)
                    .map((a) => (
                      <button
                        className={`panel budget-category ${category === a.category ? "selected" : ""}`}
                        key={a.id}
                        onClick={() => setCategory(a.category)}
                      >
                        <h3>{a.category}</h3>
                        <BudgetBar
                          limit={a.limit_cents}
                          expenses={seasonExpenses.filter(
                            (e) => e.category === a.category,
                          )}
                        />
                      </button>
                    ))}
                </div>
              )}
              {category !== "all" && (
                <section className="panel budget-category-expenses">
                  <h2>{category} expenses</h2>
                  {expenseRows(selected)}
                </section>
              )}
              <section className="panel budget-planned-overview">
                <div className="budget-section-heading">
                  <h2>Known expenses</h2>
                </div>
                <p className="muted">
                  These planned costs are already included in category
                  allocations. They do not count as an additional budget or fund
                  deduction.
                </p>
                {data.plannedExpenses.filter(
                  (item) =>
                    item.season_id === season.id &&
                    (category === "all" || item.category === category),
                ).length ? (
                  <div className="budget-planned-overview-list">
                    {data.plannedExpenses
                      .filter(
                        (item) =>
                          item.season_id === season.id &&
                          (category === "all" || item.category === category),
                      )
                      .map((item) => {
                        const linked = data.expenses.find(
                          (expense) => expense.id === item.id,
                        );
                        return (
                          <div key={item.id}>
                            <div>
                              <strong>{item.name}</strong>
                              <p className="small muted">
                                {item.category}
                                {item.request_deduction
                                  ? ` · ${linked?.status === "approved" ? "Fund deduction approved" : linked ? "Fund deduction awaiting review" : "Fund deduction requested"}`
                                  : " · Planned only"}
                              </p>
                            </div>
                            <div className="budget-known-actions">
                              <b>{money(item.amount_cents)}</b>
                              {manager && (
                                <button
                                  className="button secondary"
                                  onClick={() =>
                                    linked
                                      ? open({
                                          kind: "delete",
                                          id: linked.id,
                                          expense: linked,
                                        })
                                      : open({
                                          kind: "planned-delete",
                                          id: item.id,
                                          plan: item,
                                          season,
                                        })
                                  }
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="small muted">
                    No known expenses listed for this selection.
                  </p>
                )}
              </section>
              {manager && category === "all" && (
                <button
                  className="button"
                  onClick={() =>
                    open({ kind: "season", id: crypto.randomUUID() })
                  }
                >
                  Create another season
                </button>
              )}
              {category === "all" && (
                <details className="panel">
                  <summary>Budget revision history</summary>
                  {data.events
                    .filter(
                      (e) =>
                        e.action === "budget_saved" &&
                        e.season_id === season.id,
                    )
                    .map((e) => (
                      <p key={e.id}>
                        {date(e.created_at)} · {e.actor_name} ·{" "}
                        {e.note || "Initial allocation"}
                      </p>
                    ))}
                </details>
              )}
            </>
          ) : (
            <>
              <h2>{status === "pending" ? "Needs approval" : "Expenses"}</h2>
              {expenseRows(
                (status === "pending" ? data.expenses : selected).filter(
                  (e) =>
                    (category === "all" || e.category === category) &&
                    (status === "all" || e.status === status),
                ),
              )}
            </>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        className={`budget-dialog ${currentModal?.kind === "season" ? "budget-dialog-setup" : ""}`}
        aria-labelledby="budget-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="budget-dialog-header">
          <h2 id="budget-dialog-title">
            {modal?.kind === "expense"
              ? modal.expense
                ? "Edit expense"
                : "Add expense"
              : modal?.kind === "import"
                ? "Import previous sheet"
                : modal?.kind === "season-delete"
                  ? "Delete budget"
                  : modal?.kind === "planned-delete"
                    ? "Remove known expense"
                    : modal?.kind === "season"
                      ? modal.season
                        ? "Edit budget"
                        : "Set up budget"
                      : modal?.kind === "balance"
                        ? "Update balance"
                        : modal?.kind === "payment"
                          ? "Record payment"
                          : modal?.kind === "refund"
                            ? "Record refund"
                            : modal?.kind === "delete"
                              ? "Cancel expense"
                              : "Review expense"}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close form"
            onClick={close}
          >
            <X />
          </button>
        </div>
        {currentModal?.kind === "expense" && season && (
          <ExpenseForm
            key={currentModal.id}
            id={currentModal.id}
            data={data}
            season={
              data.seasons.find(
                (s) => s.id === currentModal.expense?.season_id,
              ) ?? season
            }
            category={category}
            expense={currentModal.expense}
            onSaved={saved}
          />
        )}
        {currentModal?.kind === "import" && season && (
          <ImportForm
            season={season}
            categories={data.allocations
              .filter((a) => a.season_id === season.id)
              .map((a) => a.category)}
            onSaved={saved}
          />
        )}
        {currentModal?.kind === "season" && (
          <SeasonQuestionnaire
            key={currentModal.id}
            id={currentModal.id}
            season={currentModal.season}
            allocations={data.allocations}
            funds={data.funds}
            plannedExpenses={data.plannedExpenses}
            expenses={data.expenses}
            onRemoveLinked={(expense) =>
              open({ kind: "delete", id: expense.id, expense })
            }
            onSaved={saved}
          />
        )}
        {currentModal?.kind === "season-delete" && (
          <SaveForm
            key={currentModal.id}
            id={currentModal.id}
            version={currentModal.season.version}
            operation="delete_season"
            onSaved={saved}
            label="Delete budget"
          >
            <p>
              Delete “{currentModal.season.name}” from the Budget page? This
              keeps its history privately. Cancel any active expenses in this
              budget first; recorded fund balances remain available.
            </p>
            <label>
              Reason for deleting this budget
              <textarea name="note" required maxLength={2000} />
            </label>
          </SaveForm>
        )}
        {currentModal?.kind === "planned-delete" && (
          <SaveForm
            key={currentModal.id}
            id={currentModal.id}
            version={currentModal.season.version}
            operation="remove_planned"
            onSaved={saved}
            label="Remove known expense"
          >
            <p>
              Remove “{currentModal.plan.name}” from known expenses? Its
              category allocation stays the same.
            </p>
          </SaveForm>
        )}
        {currentModal?.kind === "balance" && (
          <SaveForm
            key={currentModal.id}
            id={currentModal.id}
            version={
              data.funds.find((f) => f.id === currentModal.fund.id)!.version
            }
            operation="balance"
            onSaved={saved}
            extra={{ fund_id: currentModal.fund.id }}
          >
            <p>
              {currentModal.fund.name}: enter the actual balance now. This
              replaces the recorded balance; it does not add money.
            </p>
            <label>
              Current balance (USD)
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={currentModal.fund.balance_cents / 100}
              />
            </label>
            <label>
              Why does the recorded balance need updating?
              <textarea name="note" required maxLength={2000} />
            </label>
            <p className="small muted">
              Review pending payments and refunds first so the recorded balance
              matches the real account. Older payments already included in this
              balance must be marked accordingly when submitted.
            </p>
          </SaveForm>
        )}
        {currentModal?.kind === "review" && (
          <ReviewForm
            expense={currentModal.expense}
            data={data}
            onSaved={saved}
          />
        )}
        {currentModal?.kind === "payment" && (
          <SaveForm
            key={currentModal.id}
            id={currentModal.id}
            version={currentModal.expense.version}
            operation="payment"
            onSaved={saved}
            label="Submit payment for approval"
          >
            <h3>{currentModal.expense.title}</h3>
            <p>
              {money(
                currentModal.expense.total_cents -
                  currentModal.expense.paid_cents,
              )}{" "}
              remaining due
            </p>
            <label>
              Payment amount (USD)
              <input name="amount" required inputMode="decimal" />
            </label>
            <label className="budget-checkbox">
              <input type="checkbox" name="included" />
              Already included in the current account balance
            </label>
            <label>
              Payment reference / note
              <input name="note" maxLength={2000} />
            </label>
          </SaveForm>
        )}
        {currentModal?.kind === "refund" && (
          <SaveForm
            key={currentModal.id}
            id={currentModal.id}
            version={currentModal.expense.version}
            operation="refund"
            onSaved={saved}
            label="Submit refund for approval"
          >
            <h3>{currentModal.expense.title}</h3>
            <p>
              {money(
                currentModal.expense.paid_cents -
                  currentModal.expense.refunded_cents,
              )}{" "}
              paid and eligible for refund
            </p>
            <label>
              Refund amount (USD)
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={
                  currentModal.expense.pending_refund_cents
                    ? currentModal.expense.pending_refund_cents / 100
                    : undefined
                }
              />
            </label>
            <label className="budget-checkbox">
              <input
                type="checkbox"
                name="included"
                defaultChecked={currentModal.expense.refund_included_in_balance}
              />
              Already included in the current account balance
            </label>
            <label>
              Refund reference / note
              <input name="note" maxLength={2000} />
            </label>
          </SaveForm>
        )}
        {currentModal?.kind === "delete" && (
          <SaveForm
            key={currentModal.id}
            id={currentModal.id}
            version={currentModal.expense.version}
            operation="delete"
            onSaved={saved}
            label="Cancel expense"
          >
            <p>
              {currentModal.expense.reported_cents > 0 ||
              currentModal.expense.paid_cents > 0
                ? "This removes the expense from active budget totals and reverses any account balance changes it made since the last recorded actual balance. Its payment reports and cancellation history stay in a private database audit record."
                : "This permanently removes the unpaid expense, receipt and history, and releases its reservation."}
            </p>
            <label>
              Cancellation reason
              <textarea name="note" required />
            </label>
          </SaveForm>
        )}
      </dialog>
    </div>
  );
}
function ReviewForm({
  expense: e,
  data,
  onSaved,
}: {
  expense: Expense;
  data: BudgetData;
  onSaved: () => void;
}) {
  const [operation, setOperation] = useState("approve");
  return (
    <SaveForm
      id={e.id}
      version={e.version}
      operation={operation}
      onSaved={onSaved}
      label={operation === "approve" ? "Approve expense" : "Request changes"}
    >
      <div className="budget-review-summary">
        <h3>{e.title}</h3>
        <strong className="metric">{money(e.total_cents)}</strong>
        <p>
          {e.category} · {data.funds.find((f) => f.id === e.fund_id)?.name}
        </p>
        <p>Submitted by {e.submitted_name}</p>
        <p>
          Reported paid: {money(e.reported_cents)} · Previously verified:{" "}
          {money(e.paid_cents)}
        </p>
        {e.included_in_balance && (
          <p className="notice">
            Marked as already included in the balance. Verify this before
            approving: no new deduction will be made.
          </p>
        )}
        {e.notes && <p>{e.notes}</p>}
        {data.receipts.some((r) => r.expense_id === e.id) ? (
          <a className="button" href={`/budget/receipts/${e.id}`}>
            Download receipt
          </a>
        ) : (
          <p className="small muted">No receipt attached.</p>
        )}
      </div>
      <label>
        Review decision
        <select
          value={operation}
          onChange={(event) => setOperation(event.target.value)}
        >
          <option value="approve">Approve expense</option>
          <option value="changes">Request changes</option>
        </select>
      </label>
      <label>
        {operation === "changes"
          ? "Explain the requested changes"
          : "Review note (optional)"}
        <textarea
          name="note"
          required={operation === "changes"}
          maxLength={2000}
        />
      </label>
    </SaveForm>
  );
}

function ImportForm({
  season,
  categories,
  onSaved,
}: {
  season: Season;
  categories: string[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [state, action, pending] = useActionState(
    async (previous: BudgetState, form: FormData) => {
      try {
        validateImportRows(rows, categories);
      } catch (error) {
        return { error: (error as Error).message };
      }
      const result = await importBudget(previous, form);
      if (result.success) onSaved();
      return result;
    },
    {},
  );
  async function choose(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Choose a CSV smaller than 1 MB.");
      setRows(oldSheetRows(await file.text()));
      setParseError("");
    } catch (error) {
      setRows([]);
      setParseError((error as Error).message);
    }
  }
  function change(index: number, update: Partial<ImportRow>) {
    setRows((previous) =>
      previous.map((row, i) => (i === index ? { ...row, ...update } : row)),
    );
  }
  return (
    <div className="budget-import">
      <p>
        Import expense rows from the previous AKH finance sheet into{" "}
        <strong>{season.name}</strong>. Check the category, funding source and
        amounts before submitting. Every row will await a second person’s
        approval.
      </p>
      <label>
        Previous sheet (.csv)
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>
      {parseError && (
        <p role="alert" className="notice error">
          {parseError}
        </p>
      )}
      {rows.length > 0 && (
        <form action={action} data-refresh-busy={pending}>
          <input type="hidden" name="season_id" value={season.id} />
          <input type="hidden" name="rows" value={JSON.stringify(rows)} />
          <p>
            <strong>{rows.length} expenses found</strong>
          </p>
          <div className="budget-import-rows">
            {rows.map((r, i) => (
              <div className="budget-import-row" key={r.id}>
                <strong>
                  {i + 1}. {r.title}
                </strong>
                <div className="budget-import-grid">
                  <label>
                    Category
                    <select
                      value={r.category}
                      onChange={(e) =>
                        change(i, {
                          category: e.target.value,
                          fund_id:
                            e.target.value === "Hotel" ||
                            e.target.value === "Travel"
                              ? r.fund_id
                              : r.fund_id === "goodbull"
                                ? ""
                                : r.fund_id,
                        })
                      }
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Pay from
                    <select
                      value={r.fund_id}
                      onChange={(e) => change(i, { fund_id: e.target.value })}
                    >
                      <option value="">Choose source</option>
                      <option value="venmo">Venmo</option>
                      <option value="sofc">Main SOFC</option>
                      {eligibleFund("goodbull", r.category) && (
                        <option value="goodbull">SOFC Good Bull</option>
                      )}
                    </select>
                  </label>
                  <label>
                    Total cost (USD)
                    <input
                      inputMode="decimal"
                      value={r.total}
                      onChange={(e) => change(i, { total: e.target.value })}
                    />
                  </label>
                  <label>
                    Paid (USD)
                    <input
                      inputMode="decimal"
                      value={r.paid}
                      onChange={(e) => change(i, { paid: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <label className="budget-checkbox">
            <input type="checkbox" name="included" defaultChecked />
            Past payments are already included in current account balances.
            Approval will count them toward spending without deducting again.
          </label>
          {state.error && (
            <p role="alert" className="notice error">
              {state.error}
            </p>
          )}
          <button className="button primary budget-save" disabled={pending}>
            {pending
              ? "Importing…"
              : `Submit ${rows.length} expenses for approval`}
          </button>
        </form>
      )}
    </div>
  );
}
