"use client";
import { useActionState, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { mutateBudget } from "@/features/budget/actions";
import { eligibleFund, money } from "@/features/budget/policy";
import {
  parseBudgetSetup,
  parseFundBalances,
  parsePlannedExpenses,
  validBudgetName,
  type AllocationEntry,
  type FundBalanceEntry,
  type PlannedEntry,
} from "@/features/budget/setup";
import {
  CATEGORIES,
  type Allocation,
  type BudgetState,
  type Expense,
  type Fund,
  type PlannedExpense,
  type Season,
} from "@/features/budget/types";
import { DraftConflict, useDraftRevision } from "@/components/draft-revision";

type Row = AllocationEntry & { id: string; existing: boolean };
type PlannedRow = PlannedEntry & { locked: boolean };
type FundRow = FundBalanceEntry & { name: string };
const FUNDS = [
  { id: "venmo", label: "Venmo" },
  { id: "goodbull", label: "SOFC Good Bull · Hotel/Travel only" },
  { id: "sofc", label: "Main SOFC account" },
];
const displayed = (cents: number) => (cents / 100).toFixed(2);
const numberValue = (value: string) => value.replaceAll(",", "");
const withCommas = (value: string) => {
  const [whole, decimal] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${decimal === undefined ? "" : `.${decimal}`}`;
};
function amountFromInput(value: string) {
  const plain = numberValue(value);
  if (!/^\d{0,7}(?:\.\d{0,2})?$/.test(plain)) return null;
  return withCommas(plain);
}
export function SeasonQuestionnaire({
  id,
  season,
  allocations,
  funds,
  plannedExpenses,
  expenses,
  onRemoveLinked,
  onSaved,
}: {
  id: string;
  season?: Season;
  allocations: Allocation[];
  funds: Fund[];
  plannedExpenses: PlannedExpense[];
  expenses: Expense[];
  onRemoveLinked: (expense: Expense) => void;
  onSaved: () => void;
}) {
  const draft = useDraftRevision(id, season?.version ?? 0);
  const formRef = useRef<HTMLFormElement>(null);
  const existing = allocations.filter((a) => a.season_id === id);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(season?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => [
    ...CATEGORIES.map((category) => ({
      id: category,
      category,
      amount: displayed(
        existing.find((a) => a.category === category)?.limit_cents ?? 0,
      ),
      existing: true,
    })),
    ...existing
      .filter(
        (a) => !CATEGORIES.includes(a.category as (typeof CATEGORIES)[number]),
      )
      .map((a) => ({
        id: a.id,
        category: a.category,
        amount: displayed(a.limit_cents),
        existing: true,
      })),
  ]);
  const [plans, setPlans] = useState<PlannedRow[]>(() =>
    plannedExpenses
      .filter((item) => item.season_id === id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        amount: displayed(item.amount_cents),
        request_deduction: item.request_deduction,
        fund_id: item.fund_id ?? "",
        included_in_balance: item.included_in_balance,
        locked: item.request_deduction,
      })),
  );
  const [fundRows, setFundRows] = useState<FundRow[]>(() =>
    funds.map((fund) => ({
      fund_id: fund.id,
      name: fund.name,
      amount:
        fund.updated_at && fund.balance_cents >= 0
          ? displayed(fund.balance_cents)
          : "",
      version: fund.version,
    })),
  );
  const [note, setNote] = useState("");
  const [clientError, setClientError] = useState("");
  const total = rows.reduce(
    (sum, row) => sum + (Number(numberValue(row.amount)) || 0),
    0,
  );
  const [state, action, pending] = useActionState(
    async (previous: BudgetState, form: FormData) => {
      const result = await mutateBudget(previous, form);
      if (result.success) onSaved();
      return result;
    },
    {} as BudgetState,
  );
  function change(id: string, update: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...update } : row)),
    );
    setClientError("");
  }
  function changePlan(id: string, update: Partial<PlannedRow>) {
    setPlans((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
    setClientError("");
  }
  function addPlan(name: string, category: string) {
    setPlans((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name,
        category,
        amount: "0.00",
        request_deduction: false,
        fund_id: "",
        included_in_balance: false,
        locked: false,
      },
    ]);
    setClientError("");
  }
  function next() {
    try {
      if (step === 0) validBudgetName(name, "budget");
      else {
        const setup = parseBudgetSetup(name, rows);
        if (step === 2) parseFundBalances(fundRows);
        if (step === 3) parsePlannedExpenses(plans, setup.allocations);
      }
      setClientError("");
      setStep((current) => Math.min(current + 1, 4));
    } catch (error) {
      setClientError((error as Error).message);
    }
  }
  const choices = rows.map(({ category, amount }) => ({
    category,
    amount: numberValue(amount),
  }));
  const plannedChoices = plans.map(
    ({
      id,
      name,
      category,
      amount,
      request_deduction,
      fund_id,
      included_in_balance,
    }) => ({
      id,
      name,
      category,
      amount: numberValue(amount),
      request_deduction,
      fund_id,
      included_in_balance,
    }),
  );
  return (
    <form
      ref={formRef}
      action={action}
      className="budget-form budget-questionnaire"
      data-refresh-busy={pending}
      onSubmit={(event) => {
        if (step < 4) {
          event.preventDefault();
          next();
        }
      }}
    >
      <input type="hidden" name="id" value={draft.id} />
      <input type="hidden" name="version" value={draft.version} />
      <input type="hidden" name="operation" value="season" />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="allocations" value={JSON.stringify(choices)} />
      <input
        type="hidden"
        name="planned_expenses"
        value={JSON.stringify(plannedChoices)}
      />
      <input
        type="hidden"
        name="fund_balances"
        value={JSON.stringify(
          fundRows.map(({ fund_id, amount, version }) => ({
            fund_id,
            amount: numberValue(amount),
            version,
          })),
        )}
      />
      <input type="hidden" name="note" value={note} />
      <nav className="budget-setup-steps" aria-label="Budget setup progress">
        {["Name", "Allocate", "Funds", "Planned costs", "Review"].map(
          (label, index) => (
            <span
              key={label}
              className={
                index === step ? "active" : index < step ? "complete" : ""
              }
              aria-current={index === step ? "step" : undefined}
            >
              {index + 1}. {label}
            </span>
          ),
        )}
      </nav>
      <DraftConflict changed={draft.changed} />
      <fieldset disabled={pending || draft.changed}>
        {step === 0 && (
          <div className="budget-setup-screen">
            <span className="eyebrow">STEP 1 OF 5</span>
            <h3>What should this budget be called?</h3>
            <p className="muted">
              Choose a name your team will recognize, such as “2026–2027
              season”.
            </p>
            <label>
              Budget name
              <input
                aria-label="Budget name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setClientError("");
                }}
                maxLength={80}
                autoFocus
                placeholder="2026–2027 season"
                autoComplete="off"
              />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="budget-setup-screen">
            <span className="eyebrow">STEP 2 OF 5</span>
            <h3>How much will each category get?</h3>
            <p className="muted">
              Enter an amount for each category. Leave unused categories at $0.
              The total adds itself up.
            </p>
            <div className="budget-setup-categories">
              {rows.map((row) => (
                <div className="budget-setup-row" key={row.id}>
                  {row.existing ? (
                    <span className="budget-setup-category-name">
                      {row.category}
                    </span>
                  ) : (
                    <label className="budget-custom-name">
                      Custom category name
                      <input
                        aria-label="Custom category name"
                        value={row.category}
                        onChange={(e) =>
                          change(row.id, { category: e.target.value })
                        }
                        maxLength={50}
                        placeholder="Team meals"
                      />
                    </label>
                  )}
                  <label className="budget-setup-amount">
                    Amount for {row.category || "custom category"}
                    <span className="budget-money-field">
                      <span aria-hidden="true">$</span>
                      <input
                        aria-label={`${row.category || "Custom category"} allocation (USD)`}
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => {
                          const amount = amountFromInput(e.target.value);
                          if (amount !== null) change(row.id, { amount });
                        }}
                        onBlur={() => {
                          const value = Number(numberValue(row.amount));
                          if (Number.isFinite(value))
                            change(row.id, {
                              amount: withCommas(value.toFixed(2)),
                            });
                        }}
                      />
                    </span>
                  </label>
                  {!row.existing && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${row.category || "custom category"}`}
                      onClick={() =>
                        setRows((current) =>
                          current.filter((item) => item.id !== row.id),
                        )
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    category: "",
                    amount: "0.00",
                    existing: false,
                  },
                ])
              }
            >
              <Plus size={17} /> Add custom category
            </button>
            <div className="budget-setup-total" role="status">
              <span>Total budget from allocations</span>
              <strong>{money(Math.round(total * 100))}</strong>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="budget-setup-screen">
            <span className="eyebrow">STEP 3 OF 5</span>
            <h3>What is in each fund right now?</h3>
            <p className="muted">
              Enter each account’s current balance, not money you plan to spend.
              Leave an unknown balance blank and add it later in Funds.
            </p>
            <div className="budget-setup-categories">
              {fundRows.map((fund) => (
                <div className="budget-setup-row" key={fund.fund_id}>
                  <span className="budget-setup-category-name">
                    {fund.name}
                  </span>
                  <label className="budget-setup-amount">
                    Current balance for {fund.name}
                    <span className="budget-money-field">
                      <span aria-hidden="true">$</span>
                      <input
                        aria-label={`${fund.name} current balance (USD)`}
                        inputMode="decimal"
                        placeholder="Not entered"
                        value={fund.amount}
                        onChange={(event) => {
                          const amount = amountFromInput(event.target.value);
                          if (amount !== null)
                            setFundRows((current) =>
                              current.map((row) =>
                                row.fund_id === fund.fund_id
                                  ? { ...row, amount }
                                  : row,
                              ),
                            );
                        }}
                        onBlur={() => {
                          if (!fund.amount) return;
                          const value = Number(numberValue(fund.amount));
                          if (Number.isFinite(value))
                            setFundRows((current) =>
                              current.map((row) =>
                                row.fund_id === fund.fund_id
                                  ? {
                                      ...row,
                                      amount: withCommas(value.toFixed(2)),
                                    }
                                  : row,
                              ),
                            );
                        }}
                      />
                    </span>
                  </label>
                </div>
              ))}
            </div>
            <p className="small muted">
              These are recorded balances, separate from your category budget. A
              change is saved in each fund’s balance history. Good Bull may only
              pay for Hotel and Travel.
            </p>
          </div>
        )}
        {step === 3 && (
          <div className="budget-setup-screen">
            <span className="eyebrow">STEP 4 OF 5</span>
            <h3>Which expenses are already known?</h3>
            <p className="muted">
              Add competition fees, mix fees, or other known costs. They are
              included in the category amounts above, so they do not increase
              the total budget.
            </p>
            <div
              className="budget-planned-suggestions"
              aria-label="Quick add planned expense"
            >
              <button
                type="button"
                className="button secondary"
                onClick={() => addPlan("Competition fee", "Competition")}
              >
                + Competition fee
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => addPlan("Mix fee", "Mix")}
              >
                + Mix fee
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => addPlan("Other fee", "Misc.")}
              >
                + Other fee
              </button>
            </div>
            {plans.length === 0 && (
              <p className="budget-plan-empty">
                No planned expenses yet. You can continue without adding any.
              </p>
            )}
            <div className="budget-planned-list">
              {plans.map((plan) => (
                <div className="budget-planned-row" key={plan.id}>
                  <fieldset disabled={plan.locked}>
                    <div className="budget-planned-top">
                      <label>
                        Expense name
                        <input
                          aria-label={`Planned expense name ${plan.id}`}
                          value={plan.name}
                          onChange={(e) =>
                            changePlan(plan.id, { name: e.target.value })
                          }
                          maxLength={80}
                          placeholder="Competition registration"
                        />
                      </label>
                      <label>
                        Category
                        <select
                          aria-label={`Category for ${plan.name || "planned expense"}`}
                          value={plan.category}
                          onChange={(e) => {
                            const category = e.target.value;
                            changePlan(plan.id, {
                              category,
                              fund_id: eligibleFund(plan.fund_id, category)
                                ? plan.fund_id
                                : "",
                            });
                          }}
                        >
                          <option value="">Choose category</option>
                          {rows.map((row) => (
                            <option key={row.id} value={row.category}>
                              {row.category}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Planned amount (USD)
                        <span className="budget-money-field">
                          <span aria-hidden="true">$</span>
                          <input
                            aria-label={`Planned amount for ${plan.name || "expense"}`}
                            inputMode="decimal"
                            value={plan.amount}
                            onChange={(e) => {
                              const amount = amountFromInput(e.target.value);
                              if (amount !== null)
                                changePlan(plan.id, { amount });
                            }}
                            onBlur={() => {
                              const value = Number(numberValue(plan.amount));
                              if (Number.isFinite(value))
                                changePlan(plan.id, {
                                  amount: withCommas(value.toFixed(2)),
                                });
                            }}
                          />
                        </span>
                      </label>
                    </div>
                    <label className="budget-checkbox">
                      <input
                        type="checkbox"
                        checked={plan.request_deduction}
                        onChange={(e) =>
                          changePlan(plan.id, {
                            request_deduction: e.target.checked,
                            fund_id: e.target.checked ? plan.fund_id : "",
                            included_in_balance:
                              e.target.checked && plan.included_in_balance,
                          })
                        }
                      />
                      Request a fund deduction for this expense
                    </label>
                    {plan.request_deduction && (
                      <div className="budget-planned-deduction">
                        <p className="small muted">
                          This creates a pending expense. Another Captain or
                          Finance member must approve it before the account
                          balance changes.
                        </p>
                        <label>
                          Deduct from
                          <select
                            aria-label={`Deduct ${plan.name} from`}
                            value={plan.fund_id}
                            onChange={(e) =>
                              changePlan(plan.id, { fund_id: e.target.value })
                            }
                          >
                            <option value="">Choose fund</option>
                            {FUNDS.filter((fund) =>
                              eligibleFund(fund.id, plan.category),
                            ).map((fund) => (
                              <option key={fund.id} value={fund.id}>
                                {fund.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="budget-checkbox">
                          <input
                            type="checkbox"
                            checked={plan.included_in_balance}
                            onChange={(e) =>
                              changePlan(plan.id, {
                                included_in_balance: e.target.checked,
                              })
                            }
                          />
                          Already reflected in the recorded fund balance
                        </label>
                      </div>
                    )}
                  </fieldset>
                  {plan.locked ? (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        const linked = expenses.find(
                          (expense) => expense.id === plan.id,
                        );
                        if (linked) onRemoveLinked(linked);
                        else
                          setClientError(
                            "The linked expense changed. Refresh and try again.",
                          );
                      }}
                    >
                      Remove planned expense and cancel its payment
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        setPlans((current) =>
                          current.filter((item) => item.id !== plan.id),
                        )
                      }
                    >
                      Remove planned expense
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => addPlan("", "")}
            >
              <Plus size={17} /> Add another planned expense
            </button>
            <div className="budget-setup-total">
              <span>Included in {money(Math.round(total * 100))} budget</span>
              <strong>
                {money(
                  Math.round(
                    plans.reduce(
                      (sum, plan) =>
                        sum + (Number(numberValue(plan.amount)) || 0),
                      0,
                    ) * 100,
                  ),
                )}{" "}
                planned
              </strong>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="budget-setup-screen">
            <span className="eyebrow">STEP 5 OF 5</span>
            <h3>Review your budget</h3>
            <p className="muted">
              Check the category amounts before saving. The total below is
              calculated automatically.
            </p>
            <div className="budget-setup-review">
              <strong>{name.trim()}</strong>
              {rows.map((row) => (
                <div key={row.id}>
                  <span>{row.category}</span>
                  <b>
                    {money(
                      Math.round((Number(numberValue(row.amount)) || 0) * 100),
                    )}
                  </b>
                </div>
              ))}
            </div>
            <div className="budget-setup-total">
              <span>Total budget</span>
              <strong>{money(Math.round(total * 100))}</strong>
            </div>
            <div className="budget-setup-review">
              <strong>Current fund balances</strong>
              {fundRows.map((fund) => (
                <div key={fund.fund_id}>
                  <span>{fund.name}</span>
                  <b>
                    {fund.amount
                      ? money(
                          Math.round(Number(numberValue(fund.amount)) * 100),
                        )
                      : "Not entered"}
                  </b>
                </div>
              ))}
            </div>
            {plans.length > 0 && (
              <div className="budget-setup-review">
                <strong>Known expenses within those allocations</strong>
                {plans.map((plan) => (
                  <div key={plan.id}>
                    <span>
                      {plan.name} · {plan.category}
                      {plan.request_deduction
                        ? ` · ${FUNDS.find((fund) => fund.id === plan.fund_id)?.label ?? plan.fund_id} (approval needed)`
                        : ""}
                    </span>
                    <b>
                      {money(
                        Math.round(
                          (Number(numberValue(plan.amount)) || 0) * 100,
                        ),
                      )}
                    </b>
                  </div>
                ))}
              </div>
            )}
            {season && (
              <label>
                Why are you changing this budget?
                <input
                  aria-label="Reason for change"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  required
                  placeholder="Updated travel estimate"
                />
              </label>
            )}
          </div>
        )}
      </fieldset>
      {(clientError || state.error) && (
        <p role="alert" className="notice error">
          {clientError || state.error}
        </p>
      )}
      <div className="budget-setup-actions">
        {step > 0 && (
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={() => {
              setStep((current) => current - 1);
              setClientError("");
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          className="button primary"
          disabled={pending || draft.changed}
          onClick={() => (step < 4 ? next() : formRef.current?.requestSubmit())}
        >
          {pending
            ? "Saving…"
            : step < 4
              ? "Continue"
              : season
                ? "Save revised budget"
                : "Create budget"}
        </button>
      </div>
    </form>
  );
}
