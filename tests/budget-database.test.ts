import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001",
  finance = "00000000-0000-4000-8000-000000000002",
  captain = "00000000-0000-4000-8000-000000000003",
  exec = "00000000-0000-4000-8000-000000000004",
  dancer = "00000000-0000-4000-8000-000000000005";
const season = "10000000-0000-4000-8000-000000000001",
  expense = "20000000-0000-4000-8000-000000000001";
const categories = [
  "Production",
  "Competition",
  "Legends/Application",
  "Travel",
  "Hotel",
  "Security Deposit",
  "Misc.",
  "Mix",
  "Social",
];
async function user(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
const mutate = (p: Record<string, unknown>) =>
  db.query("select budget_mutate($1::jsonb)", [JSON.stringify(p)]);
const submit = (p: Record<string, unknown> = {}) =>
  mutate({
    operation: "submit",
    id: expense,
    version: 0,
    season_id: season,
    title: "Hotel deposit",
    category: "Hotel",
    fund_id: "goodbull",
    total_cents: 10000,
    reported_cents: 3000,
    included_in_balance: false,
    ...p,
  });
const review = (operation = "approve", version = 1, note = "") =>
  mutate({ operation, id: expense, version, note });
async function snapshot() {
  return (
    await db.query<{ balance_cents: number }>(
      "select balance_cents from budget_funds where id=$1",
      ["goodbull"],
    )
  ).rows[0].balance_cents;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(readFileSync("supabase/migrations/0001_identity.sql", "utf8"));
  await db.exec(
    "alter table members add column exec_roles text[] not null default '{}'",
  );
  await db.exec(readFileSync("supabase/migrations/0020_budget.sql", "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate budget_events,budget_receipts,budget_expenses,budget_allocations,budget_seasons,budget_owners;truncate auth.users cascade;insert into budget_funds(id,name,balance_cents) values ('venmo','Venmo',100000),('goodbull','SOFC Good Bull',100000),('sofc','Main SOFC',100000);",
  );
  for (const [id, roles] of [
    [owner, []],
    [finance, ["Logistics & Finance"]],
    [captain, ["Captain"]],
    [exec, ["Production"]],
    [dancer, []],
  ] as [string, string[]][]) {
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}')`,
      [id, `${id}@tamu.edu`],
    );
    await db.query(
      "insert into members(id,email,display_name,status,is_admin,exec_roles) values($1,$2,$3,'active',false,$4)",
      [id, `${id}@tamu.edu`, id, roles],
    );
  }
  await db.query("insert into budget_owners values($1)", [owner]);
  await user(owner);
  await mutate({
    operation: "season",
    id: season,
    version: 0,
    name: "2026–2027",
    limit_cents: 900000,
    allocations: categories.map((category) => ({
      category,
      limit_cents: 100000,
    })),
  });
  await user(exec);
});
it("denies dancers, anonymous users, direct writes and self-grants", async () => {
  await user(dancer);
  expect((await db.query("select * from budget_funds")).rows).toHaveLength(0);
  await expect(submit()).rejects.toThrow(/access/);
  await expect(
    db.query("insert into budget_owners values($1)", [dancer]),
  ).rejects.toThrow();
  await user(exec);
  await expect(
    db.exec("update budget_funds set balance_cents=1"),
  ).rejects.toThrow();
  await db.exec("set role anon");
  await expect(db.exec("select budget_role()")).rejects.toThrow();
});
it("allows all execs to submit, reserves immediately, and deducts only after review", async () => {
  await submit();
  expect(await snapshot()).toBe(100000);
  expect(
    (
      await db.query(
        "select total_cents-paid_cents as reserved from budget_expenses",
      )
    ).rows,
  ).toEqual([{ reserved: 10000 }]);
  await expect(review()).rejects.toThrow(/approval/);
  await user(captain);
  await review();
  expect(await snapshot()).toBe(97000);
  expect(
    (
      await db.query(
        "select total_cents-paid_cents as reserved from budget_expenses",
      )
    ).rows,
  ).toEqual([{ reserved: 7000 }]);
  await expect(review()).rejects.toThrow(/changed/);
  expect(await snapshot()).toBe(97000);
});
it("prevents owners and reviewers from approving their own submissions", async () => {
  for (const id of [owner, finance, captain]) {
    await user(id);
    await submit({ id });
    await expect(
      mutate({ operation: "approve", id, version: 1 }),
    ).rejects.toThrow(/Someone else/);
  }
});
it("enforces Good Bull category restrictions in the database", async () => {
  for (const category of ["Mix", "Social", "Production"])
    await expect(submit({ category })).rejects.toThrow(/Good Bull/);
  await submit({ category: "Travel" });
  await user(finance);
  await review();
  expect(await snapshot()).toBe(97000);
});
it("requests changes without releasing funds and safely resubmits corrected entries", async () => {
  await submit();
  await user(finance);
  await expect(review("changes")).rejects.toThrow(/Explain/);
  await review("changes", 1, "Wrong invoice");
  expect(await snapshot()).toBe(100000);
  await user(exec);
  await submit({ version: 2, total_cents: 8000, reported_cents: 2000 });
  await user(captain);
  await review("approve", 3);
  expect(await snapshot()).toBe(98000);
  expect(
    (
      await db.query<{ action: string }>(
        "select action from budget_events where expense_id=$1 order by id",
        [expense],
      )
    ).rows.map((x) => x.action),
  ).toEqual(["submitted", "changes", "submitted", "approve"]);
});
it("reviews incremental payments without deducting the first payment again", async () => {
  await submit();
  await user(finance);
  await review();
  await user(exec);
  await mutate({
    operation: "payment",
    id: expense,
    version: 2,
    amount_cents: 7000,
    included_in_balance: false,
  });
  expect(await snapshot()).toBe(97000);
  await user(captain);
  await review("approve", 3);
  expect(await snapshot()).toBe(90000);
  await expect(review("approve", 3)).rejects.toThrow(/changed/);
  expect(await snapshot()).toBe(90000);
});
it("retains original submitter separation when another reviewer reports a payment", async () => {
  await user(finance);
  await submit();
  await user(captain);
  await review();
  await user(owner);
  await mutate({
    operation: "payment",
    id: expense,
    version: 2,
    amount_cents: 1000,
    included_in_balance: false,
  });
  await expect(review("approve", 3)).rejects.toThrow(/Someone else/);
  await user(finance);
  await expect(review("approve", 3)).rejects.toThrow(/Someone else/);
  await user(captain);
  await review("approve", 3);
});
it("keeps historical already-in-balance payments in spending without another deduction", async () => {
  await submit({ included_in_balance: true });
  await user(finance);
  await review();
  expect(await snapshot()).toBe(100000);
  expect(
    (await db.query("select paid_cents from budget_expenses")).rows,
  ).toEqual([{ paid_cents: 3000 }]);
});
it("fences stale reconciliations and requires pending payment reports to be reviewed first", async () => {
  await submit();
  await user(finance);
  const p = {
    operation: "balance",
    id: season,
    version: 1,
    fund_id: "goodbull",
    amount_cents: 80000,
    note: "Checked account",
  };
  await expect(mutate(p)).rejects.toThrow(/Review outstanding/);
  await review();
  await expect(mutate(p)).rejects.toThrow(/changed/);
  await mutate({ ...p, version: 2 });
  expect(await snapshot()).toBe(80000);
  await expect(mutate({ ...p, version: 2 })).rejects.toThrow(/changed/);
});
it("restricts budgets/balance edits and preserves baseline allocations on revisions", async () => {
  const p = {
    operation: "season",
    id: season,
    version: 1,
    name: "2026–2027",
    limit_cents: 950000,
    note: "Travel increased",
    allocations: categories.map((category) => ({
      category,
      limit_cents: 105000,
    })),
  };
  await expect(mutate(p)).rejects.toThrow(/Finance/);
  await user(captain);
  await expect(mutate(p)).rejects.toThrow(/Finance/);
  await user(finance);
  await mutate(p);
  expect(
    (await db.query("select original_cents,limit_cents from budget_seasons"))
      .rows,
  ).toEqual([{ original_cents: 900000, limit_cents: 950000 }]);
  await expect(mutate({ ...p, version: 2, limit_cents: 1 })).rejects.toThrow(
    /exceed/,
  );
});
it("protects receipts, prevents replay and rejects invalid money", async () => {
  for (const value of [null, -1, 0, 100000001])
    await expect(submit({ total_cents: value })).rejects.toThrow();
  await submit({
    receipt: {
      filename: "receipt.pdf",
      mime: "application/pdf",
      content: "JVBERi0=",
    },
  });
  await expect(submit()).rejects.toThrow(/changed/);
  await user(dancer);
  expect((await db.query("select * from budget_receipts")).rows).toHaveLength(
    0,
  );
  await user(finance);
  expect((await db.query("select * from budget_receipts")).rows).toHaveLength(
    1,
  );
});
it("revokes access for inactive accounts including the owner", async () => {
  await submit();
  await db.exec("reset role");
  await db.query("update members set status='inactive' where id=$1", [owner]);
  await user(owner);
  expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
    0,
  );
  await expect(review()).rejects.toThrow(/access/);
});
it("does not move a verified payment to another fund or erase paid history", async () => {
  await submit();
  await user(finance);
  await review();
  await user(exec);
  await expect(submit({ version: 2, fund_id: "venmo" })).rejects.toThrow(
    /original/,
  );
  await user(finance);
  await mutate({
    operation: "delete",
    id: expense,
    version: 2,
    note: "remove",
  });
  expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
    0,
  );
});
it("rejects cross-season edits so expense and audit history agree", async () => {
  await submit({ reported_cents: 0 });
  await user(owner);
  const another = "10000000-0000-4000-8000-000000000002";
  await mutate({
    operation: "season",
    id: another,
    version: 0,
    name: "Next year",
    limit_cents: 0,
    allocations: categories.map((category) => ({ category, limit_cents: 0 })),
  });
  await user(exec);
  await expect(
    submit({ version: 1, season_id: another, reported_cents: 0 }),
  ).rejects.toThrow(/original season/);
  expect(
    (
      await db.query("select season_id from budget_expenses where id=$1", [
        expense,
      ])
    ).rows,
  ).toEqual([{ season_id: season }]);
});
it("reviews refunds, updates available budget and account balance once", async () => {
  await submit({ reported_cents: 10000 });
  await user(finance);
  await review();
  expect(await snapshot()).toBe(90000);
  await user(exec);
  await mutate({
    operation: "refund",
    id: expense,
    version: 2,
    amount_cents: 2500,
    included_in_balance: false,
  });
  expect(await snapshot()).toBe(90000);
  await user(captain);
  await review("approve", 3);
  expect(await snapshot()).toBe(92500);
  expect(
    (await db.query("select paid_cents,refunded_cents from budget_expenses"))
      .rows,
  ).toEqual([{ paid_cents: 10000, refunded_cents: 2500 }]);
  await expect(review("approve", 3)).rejects.toThrow(/changed/);
});
it("imports reviewed rows atomically and blocks duplicate retries", async () => {
  await user(finance);
  const payload = {
    season_id: season,
    category: "Hotel",
    fund_id: "venmo",
    title: "Fee",
    total_cents: 3000,
    reported_cents: 0,
    included_in_balance: false,
  };
  const items = [
    { ...payload, id: expense },
    {
      ...payload,
      id: "20000000-0000-4000-8000-000000000002",
      category: "Mix",
      fund_id: "goodbull",
    },
  ];
  await expect(
    db.query("select budget_import($1::jsonb)", [JSON.stringify(items)]),
  ).rejects.toThrow(/Good Bull/);
  expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
    0,
  );
  items[1].fund_id = "venmo";
  await db.query("select budget_import($1::jsonb)", [JSON.stringify(items)]);
  await expect(
    db.query("select budget_import($1::jsonb)", [JSON.stringify(items)]),
  ).rejects.toThrow();
  expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
    2,
  );
});
it("reverses a deleted paid expense and retains its history privately", async () => {
  await submit();
  await user(finance);
  await review();
  expect(await snapshot()).toBe(97000);
  await mutate({
    operation: "delete",
    id: expense,
    version: 2,
    note: "Removed by admin",
  });
  expect(await snapshot()).toBe(100000);
  expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
    0,
  );
  expect(
    (
      await db.query("select * from budget_events where expense_id=$1", [
        expense,
      ])
    ).rows,
  ).toHaveLength(0);
  await db.exec("reset role");
  expect(
    (await db.query("select * from budget_expenses where id=$1", [expense]))
      .rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "select action,delta_cents,note from budget_events where expense_id=$1 order by id desc limit 1",
        [expense],
      )
    ).rows,
  ).toEqual([
    { action: "deleted", delta_cents: 3000, note: "Removed by admin" },
  ]);
});
it("reverses net approved payments and refunds only once on deletion", async () => {
  await submit({ reported_cents: 10000 });
  await user(finance);
  await review();
  await user(exec);
  await mutate({
    operation: "refund",
    id: expense,
    version: 2,
    amount_cents: 2500,
    included_in_balance: false,
  });
  await user(captain);
  await review("approve", 3);
  expect(await snapshot()).toBe(92500);
  await user(finance);
  await mutate({
    operation: "delete",
    id: expense,
    version: 4,
    note: "Void duplicate",
  });
  expect(await snapshot()).toBe(100000);
  await expect(
    mutate({ operation: "delete", id: expense, version: 4, note: "Again" }),
  ).rejects.toThrow(/changed/);
});
it("does not double-reverse payments already included in a reconciled balance", async () => {
  await submit();
  await user(finance);
  await review();
  await mutate({
    operation: "balance",
    id: season,
    version: 2,
    fund_id: "goodbull",
    amount_cents: 96000,
    note: "Matched account statement",
  });
  await mutate({
    operation: "delete",
    id: expense,
    version: 2,
    note: "Void duplicate",
  });
  expect(await snapshot()).toBe(96000);
});
it("blocks reconciliation during refund review and lets the submitter correct it", async () => {
  await submit({ reported_cents: 10000 });
  await user(finance);
  await review();
  await user(exec);
  await mutate({
    operation: "refund",
    id: expense,
    version: 2,
    amount_cents: 3000,
    included_in_balance: false,
  });
  await user(finance);
  await expect(
    mutate({
      operation: "balance",
      id: season,
      version: 2,
      fund_id: "goodbull",
      amount_cents: 93000,
      note: "checked",
    }),
  ).rejects.toThrow(/Review outstanding/);
  await review("changes", 3, "Check amount");
  await user(exec);
  await mutate({
    operation: "refund",
    id: expense,
    version: 4,
    amount_cents: 2000,
    included_in_balance: false,
  });
  await user(captain);
  await review("approve", 5);
  expect(await snapshot()).toBe(92000);
});
it("allows reconciliation after a pending payment is hidden", async () => {
  await submit({ reported_cents: 1000 });
  await user(finance);
  await mutate({
    operation: "delete",
    id: expense,
    version: 1,
    note: "Duplicate",
  });
  await mutate({
    operation: "balance",
    id: season,
    version: 1,
    fund_id: "goodbull",
    amount_cents: 99000,
    note: "Checked bank",
  });
  expect(await snapshot()).toBe(99000);
});
it("permanently cancels unpaid entries with their receipt/history and frees reservations", async () => {
  await submit({
    reported_cents: 0,
    receipt: {
      filename: "receipt.pdf",
      mime: "application/pdf",
      content: "JVBERi0=",
    },
  });
  await user(finance);
  await mutate({
    operation: "delete",
    id: expense,
    version: 1,
    note: "Duplicate reservation",
  });
  expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
    0,
  );
  expect((await db.query("select * from budget_receipts")).rows).toHaveLength(
    0,
  );
  expect(
    (
      await db.query("select * from budget_events where expense_id=$1", [
        expense,
      ])
    ).rows,
  ).toHaveLength(0);
});
