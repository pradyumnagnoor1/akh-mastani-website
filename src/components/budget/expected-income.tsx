"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SaveForm } from "./save-form";
import { money, canManage } from "@/features/budget/policy";
import type {
  BudgetData,
  BudgetRole,
  ExpectedIncome,
  Season,
} from "@/features/budget/types";

type Editor = {
  kind: "edit" | "receive" | "cancel";
  id: string;
  item?: ExpectedIncome;
  receiptId: string;
};
export function ExpectedIncomeSection({
  data,
  season,
  role,
}: {
  data: BudgetData;
  season: Season;
  role: BudgetRole;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const items = (data.income ?? []).filter((i) => i.season_id === season.id);
  const outstanding = items.filter(
    (i) => !i.canceled && i.received_cents < i.expected_cents,
  );
  const history = items.filter(
    (i) => i.canceled || i.received_cents >= i.expected_cents,
  );
  const expected = outstanding.reduce(
    (sum, i) => sum + i.expected_cents - i.received_cents,
    0,
  );
  const manager = canManage(role);
  function open(kind: Editor["kind"], item?: ExpectedIncome) {
    opener.current = document.activeElement as HTMLElement;
    setEditor({
      kind,
      item,
      id: item?.id ?? crypto.randomUUID(),
      receiptId: crypto.randomUUID(),
    });
    dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
    setEditor(null);
    opener.current?.focus();
  }
  function saved() {
    close();
    startRefresh(() => router.refresh());
  }
  const current = editor?.item
    ? (items.find((i) => i.id === editor.item?.id) ?? editor.item)
    : undefined;
  return (
    <section
      className="panel income-section"
      aria-labelledby="expected-income-heading"
    >
      <div className="budget-section-heading">
        <div>
          <h2 id="expected-income-heading">
            Expected income <span className="muted">{money(expected)}</span>
          </h2>
          <p className="muted small">Money still to come · {season.name}</p>
        </div>
        {manager && data.incomeReady !== false && (
          <button
            className="button secondary"
            disabled={refreshing}
            onClick={() => open("edit")}
          >
            Add income
          </button>
        )}
      </div>
      {data.incomeReady === false ? (
        <p className="muted small">
          Expected income will be available after the database update.
        </p>
      ) : (
        <>
          {outstanding.length === 0 ? (
            <p className="muted small">
              No income expected. Add an entry when you’re expecting money.
            </p>
          ) : (
            <div className="income-list">
              {outstanding.map((item) => (
                <div className="income-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted small">
                      {item.category}
                      {item.due_on
                        ? ` · Expected ${item.due_on.slice(5).replace("-", "/")}/${item.due_on.slice(0, 4)}`
                        : ""}
                      {item.received_cents > 0
                        ? ` · ${money(item.received_cents)} received`
                        : ""}
                    </p>
                  </div>
                  <strong>
                    {money(item.expected_cents - item.received_cents)}
                  </strong>
                  {manager && (
                    <div className="budget-row-actions">
                      <button
                        className="button secondary"
                        disabled={refreshing}
                        onClick={() => open("receive", item)}
                      >
                        Record received
                      </button>
                      <button
                        className="button"
                        aria-label={`Edit ${item.name}`}
                        disabled={refreshing}
                        onClick={() => open("edit", item)}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {expected > 0 && (
            <p className="muted small">
              After expected receipts:{" "}
              <strong>
                {money(
                  data.funds
                    .filter((f) => f.updated_at)
                    .reduce((sum, f) => sum + f.balance_cents, 0) + expected,
                )}
              </strong>{" "}
              across accounts. Expected money is not available yet.
            </p>
          )}
          {(history.length > 0 || items.some((i) => i.received_cents > 0)) && (
            <details className="budget-optional">
              <summary>Received &amp; canceled</summary>
              {items
                .filter((i) => i.received_cents > 0 || i.canceled)
                .map((item) => (
                  <div className="income-history" key={item.id}>
                    <strong>{item.name}</strong>{" "}
                    <span className="muted small">
                      {item.canceled
                        ? "Canceled remaining forecast"
                        : item.received_cents >= item.expected_cents
                          ? "Received"
                          : "Partially received"}{" "}
                      · {money(item.received_cents)}
                    </span>
                    {(data.incomeReceipts ?? [])
                      .filter((r) => r.income_id === item.id)
                      .map((r) => (
                        <p className="muted small" key={r.id}>
                          {money(r.amount_cents)} →{" "}
                          {data.funds.find((f) => f.id === r.fund_id)?.name} ·{" "}
                          {new Date(r.created_at).toLocaleDateString("en-US", {
                            timeZone: "America/Chicago",
                          })}{" "}
                          · {r.actor_name}
                          {r.included_in_balance ? " · Already in balance" : ""}
                        </p>
                      ))}
                  </div>
                ))}
            </details>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        className="budget-dialog"
        onCancel={() => {
          setEditor(null);
          opener.current?.focus();
        }}
        onClose={() => setEditor(null)}
      >
        <div className="budget-dialog-header">
          <h2>
            {editor?.kind === "receive"
              ? "Record received income"
              : editor?.kind === "cancel"
                ? "Remove expected income"
                : current
                  ? "Edit expected income"
                  : "Add expected income"}
          </h2>
          <button
            type="button"
            className="button"
            aria-label="Close income form"
            onClick={close}
          >
            Close
          </button>
        </div>
        {editor && (
          <SaveForm
            key={`${editor.kind}-${editor.id}`}
            id={editor.id}
            version={current?.version ?? 0}
            operation={
              editor.kind === "edit"
                ? "income_save"
                : editor.kind === "receive"
                  ? "income_receive"
                  : "income_cancel"
            }
            onSaved={saved}
            label={
              editor.kind === "receive"
                ? "Confirm received"
                : editor.kind === "cancel"
                  ? "Remove expected income"
                  : "Save income"
            }
            extra={{ season_id: season.id, receipt_id: editor.receiptId }}
          >
            {editor.kind === "edit" ? (
              <>
                <label>
                  Income name
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={current?.name}
                    placeholder="Remaining football games"
                    autoFocus
                  />
                </label>
                <label>
                  Category
                  <input
                    name="category"
                    list="income-categories"
                    required
                    maxLength={50}
                    defaultValue={current?.category}
                    placeholder="Choose or type a category"
                  />
                </label>
                <datalist id="income-categories">
                  {Array.from(
                    new Set([
                      "Football",
                      "Fundraising",
                      "GroupFund",
                      "Other",
                      ...items.map((i) => i.category),
                    ]),
                  ).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <label>
                  Expected total (USD)
                  <input
                    name="expected"
                    inputMode="decimal"
                    required
                    defaultValue={
                      current ? (current.expected_cents / 100).toFixed(2) : ""
                    }
                    placeholder="0.00"
                  />
                </label>
                {current && current.received_cents > 0 && (
                  <p className="muted small">
                    Includes {money(current.received_cents)} already received.
                    Changing the forecast does not change recorded balances.
                  </p>
                )}
                <details className="budget-optional">
                  <summary>Expected date (optional)</summary>
                  <label>
                    Expected date
                    <input
                      type="date"
                      name="due_on"
                      defaultValue={current?.due_on ?? ""}
                    />
                  </label>
                </details>
              </>
            ) : editor.kind === "receive" ? (
              <>
                <p>
                  <strong>{current?.name}</strong> ·{" "}
                  {money(
                    (current?.expected_cents ?? 0) -
                      (current?.received_cents ?? 0),
                  )}{" "}
                  outstanding
                </p>
                <label>
                  Amount received (USD)
                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    defaultValue={(
                      ((current?.expected_cents ?? 0) -
                        (current?.received_cents ?? 0)) /
                      100
                    ).toFixed(2)}
                    autoFocus
                  />
                </label>
                <label>
                  Received into
                  <select name="fund_id" required defaultValue="">
                    <option value="">Choose account</option>
                    {data.funds
                      .filter((f) => f.updated_at)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="budget-checkbox">
                  <input type="checkbox" name="included" />
                  Already included in the recorded account balance
                </label>
                <p className="muted small">
                  Adds this amount to the account unless already included. Fully
                  received income leaves the outstanding list.
                </p>
              </>
            ) : (
              <p>
                Remove the remaining forecast for{" "}
                <strong>{current?.name}</strong>? Received money and its history
                will be kept.
              </p>
            )}
          </SaveForm>
        )}
        {editor?.kind === "edit" && current && (
          <button
            type="button"
            className="button"
            onClick={() => setEditor({ ...editor, kind: "cancel" })}
          >
            Remove expected income
          </button>
        )}
      </dialog>
    </section>
  );
}
