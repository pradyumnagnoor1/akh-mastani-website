import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001";
const finance = "00000000-0000-4000-8000-000000000002";
const captain = "00000000-0000-4000-8000-000000000003";
const exec = "00000000-0000-4000-8000-000000000004";
const dancer = "00000000-0000-4000-8000-000000000005";
const anotherExec = "00000000-0000-4000-8000-000000000006";
const season = "10000000-0000-4000-8000-000000000001";
const expense = "20000000-0000-4000-8000-000000000001";
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
const mutate = (payload: Record<string, unknown>) =>
  db.query("select budget_mutate($1::jsonb)", [JSON.stringify(payload)]);
const saveSetup = (payload: Record<string, unknown>) =>
  db.query("select budget_save_setup($1::jsonb)", [JSON.stringify(payload)]);
const deleteSeason = (payload: Record<string, unknown>) =>
  db.query("select budget_delete_season($1::jsonb)", [JSON.stringify(payload)]);
const removePlanned = (payload: Record<string, unknown>) =>
  db.query("select budget_remove_planned($1::jsonb)", [
    JSON.stringify(payload),
  ]);
const submission = (overrides: Record<string, unknown> = {}) => ({
  operation: "submit",
  id: expense,
  version: 0,
  season_id: season,
  title: "Hotel",
  category: "Hotel",
  fund_id: "goodbull",
  total_cents: 10000,
  reported_cents: 2000,
  included_in_balance: false,
  ...overrides,
});

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
  await db.exec(
    readFileSync("supabase/migrations/0021_private_budget.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/0022_own_expense_edits.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/0023_budget_questionnaire.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/0024_budget_setup_controls.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/0025_budget_known_expense_removal.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/0026_budget_optional_categories.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/0027_budget_optional_funding_source.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/0028_budget_owner_self_approval.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/0029_budget_expected_income.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/0030_budget_add_funds.sql", "utf8"),
  );
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate budget_income_receipts,budget_income,budget_events,budget_receipts,budget_expenses,budget_planned_expenses,budget_allocations,budget_seasons,budget_owners;truncate auth.users cascade;insert into budget_funds(id,name,balance_cents) values ('venmo','Venmo',100000),('goodbull','SOFC Good Bull',100000),('sofc','Main SOFC',100000);",
  );
  for (const [id, roles] of [
    [owner, []],
    [finance, ["Logistics & Finance"]],
    [captain, ["Captain"]],
    [exec, ["Production"]],
    [anotherExec, ["Production"]],
    [dancer, []],
  ] as [string, string[]][]) {
    await db.query(
      'insert into auth.users values($1,$2,now(),\'{"provider":"google"}\')',
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
    name: "Current",
    limit_cents: 900000,
    allocations: categories.map((category) => ({
      category,
      limit_cents: 100000,
    })),
  });
  await user(exec);
});

it("shows an exec only their own submission, never funds, allocations, receipts or history", async () => {
  expect(
    (await db.query("select budget_submission_season() as id")).rows,
  ).toEqual([{ id: season }]);
  for (const table of [
    "budget_funds",
    "budget_seasons",
    "budget_allocations",
    "budget_planned_expenses",
    "budget_expenses",
    "budget_events",
    "budget_receipts",
  ])
    expect((await db.query(`select * from ${table}`)).rows, table).toHaveLength(
      0,
    );
  await mutate({
    ...submission(),
    receipt: {
      filename: "receipt.pdf",
      mime: "application/pdf",
      content: "JVBERi0=",
    },
  });
  for (const table of [
    "budget_funds",
    "budget_seasons",
    "budget_allocations",
    "budget_planned_expenses",
    "budget_events",
    "budget_receipts",
  ])
    expect((await db.query(`select * from ${table}`)).rows, table).toHaveLength(
      0,
    );
  expect(
    (await db.query("select id,status from budget_expenses")).rows,
  ).toEqual([{ id: expense, status: "pending" }]);
  await user(anotherExec);
  expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
    0,
  );
  await user(finance);
  expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
    1,
  );
  expect((await db.query("select * from budget_receipts")).rows).toHaveLength(
    1,
  );
});

it("allows own pending corrections but prevents other, approved and privileged changes", async () => {
  await mutate(submission());
  await mutate(
    submission({ version: 1, title: "Corrected hotel", total_cents: 9000 }),
  );
  expect(
    (await db.query("select title,total_cents,version from budget_expenses"))
      .rows,
  ).toEqual([{ title: "Corrected hotel", total_cents: 9000, version: 2 }]);
  await user(anotherExec);
  await expect(mutate(submission({ version: 2 }))).rejects.toThrow(
    /Only your pending expenses/,
  );
  await user(exec);
  await expect(mutate(submission({ version: 1 }))).rejects.toThrow(
    /Only your pending expenses/,
  );
  for (const operation of ["payment", "refund", "delete", "approve", "changes"])
    await expect(
      mutate({ ...submission(), operation, version: 2 }),
    ).rejects.toThrow(/only submit expenses/);
  await expect(
    db.query("select budget_mutate_impl($1::jsonb)", [
      JSON.stringify(
        submission({ id: "20000000-0000-4000-8000-000000000002" }),
      ),
    ]),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.exec("update budget_funds set balance_cents=1"),
  ).rejects.toThrow();
  await user(captain);
  await mutate({ operation: "approve", id: expense, version: 2 });
  expect((await db.query("select status from budget_expenses")).rows).toEqual([
    { status: "approved" },
  ]);
  await user(exec);
  await expect(mutate(submission({ version: 3 }))).rejects.toThrow(
    /Only your pending expenses/,
  );
  await user(owner);
  await expect(
    mutate(submission({ version: 3, total_cents: 8000 })),
  ).rejects.toThrow(/correction review/);
});

it("shows reviewer feedback and allows the creator to resubmit changes", async () => {
  await mutate(submission());
  await user(captain);
  await mutate({
    operation: "changes",
    id: expense,
    version: 1,
    note: "Please correct the hotel total",
  });
  await user(exec);
  expect(
    (await db.query("select status,review_note from budget_expenses")).rows,
  ).toEqual([
    { status: "changes", review_note: "Please correct the hotel total" },
  ]);
  await mutate(submission({ version: 2, total_cents: 8000 }));
  expect(
    (
      await db.query(
        "select status,review_note,total_cents from budget_expenses",
      )
    ).rows,
  ).toEqual([{ status: "pending", review_note: null, total_cents: 8000 }]);
});

it("does not let execs submit to an old season or use Good Bull for unrelated categories", async () => {
  await expect(mutate(submission({ category: "Mix" }))).rejects.toThrow(
    /Good Bull/,
  );
  await expect(
    mutate(submission({ season_id: "10000000-0000-4000-8000-000000000009" })),
  ).rejects.toThrow(/current budget season/);
  await user(dancer);
  await expect(db.query("select budget_submission_season()")).rejects.toThrow(
    /Exec access/,
  );
  await expect(mutate(submission())).rejects.toThrow(/Budget access/);
});

it("shows full records to Finance, Captains and owner", async () => {
  await mutate(submission());
  for (const id of [finance, captain, owner]) {
    await user(id);
    expect((await db.query("select * from budget_funds")).rows).toHaveLength(3);
    expect((await db.query("select * from budget_expenses")).rows).toHaveLength(
      1,
    );
  }
});

it("derives budget total from standard and custom allocations without revealing amounts to execs", async () => {
  await user(owner);
  const anotherSeason = "10000000-0000-4000-8000-000000000002";
  const allocationList = [
    ...categories.map((category) => ({ category, limit_cents: 10000 })),
    { category: "Team meals", limit_cents: 25000 },
  ];
  await expect(
    mutate({
      operation: "season",
      id: anotherSeason,
      version: 0,
      name: "2027–2028 season",
      limit_cents: 90000,
      allocations: allocationList,
    }),
  ).rejects.toThrow(/total must equal/);
  await mutate({
    operation: "season",
    id: anotherSeason,
    version: 0,
    name: "2027–2028 season",
    limit_cents: 115000,
    allocations: allocationList,
  });
  await expect(
    mutate({
      operation: "season",
      id: anotherSeason,
      version: 1,
      name: "Changed case",
      limit_cents: 115000,
      note: "Try changing category case",
      allocations: allocationList.map((item) =>
        item.category === "Team meals"
          ? { ...item, category: "Team Meals" }
          : item,
      ),
    }),
  ).rejects.toThrow(/original spelling/);
  expect(
    (
      await db.query("select limit_cents from budget_seasons where id=$1", [
        anotherSeason,
      ])
    ).rows,
  ).toEqual([{ limit_cents: 115000 }]);
  await user(exec);
  expect(
    (
      await db.query<{ categories: string[] }>(
        "select budget_submission_categories() as categories",
      )
    ).rows[0].categories,
  ).toContain("Team meals");
  expect(
    (await db.query("select * from budget_allocations")).rows,
  ).toHaveLength(0);
  await mutate(
    submission({
      id: "20000000-0000-4000-8000-000000000002",
      season_id: anotherSeason,
      category: "Team meals",
      fund_id: "venmo",
    }),
  );
  await expect(
    mutate(
      submission({
        id: "20000000-0000-4000-8000-000000000003",
        season_id: anotherSeason,
        category: "Team meals",
        fund_id: "goodbull",
      }),
    ),
  ).rejects.toThrow(/Good Bull/);
});

it("allows one category and removes unused allocations but protects expense history", async () => {
  await user(owner);
  await mutate({
    operation: "season",
    id: "10000000-0000-4000-8000-000000000003",
    version: 0,
    name: "Custom only",
    limit_cents: 25000,
    allocations: [{ category: "Team meals", limit_cents: 25000 }],
  });
  await mutate({
    operation: "season",
    id: season,
    version: 1,
    name: "Current",
    limit_cents: 100000,
    note: "Keep only hotel",
    allocations: [{ category: "Hotel", limit_cents: 100000 }],
  });
  expect(
    (
      await db.query(
        "select category from budget_allocations where season_id=$1",
        [season],
      )
    ).rows,
  ).toEqual([{ category: "Hotel" }]);
  await mutate(submission());
  await expect(
    mutate({
      operation: "season",
      id: season,
      version: 2,
      name: "Current",
      limit_cents: 100000,
      note: "Try removing hotel",
      allocations: [{ category: "Travel", limit_cents: 100000 }],
    }),
  ).rejects.toThrow(/expense history cannot be removed/);
});

it("keeps planned costs within allocations and queues requested fund deductions for independent approval", async () => {
  await user(owner);
  const plannedId = "30000000-0000-4000-8000-000000000001";
  const baseAllocations = categories.map((category) => ({
    category,
    limit_cents: 10000,
  }));
  const planned = [
    {
      id: plannedId,
      name: "Competition fee",
      category: "Competition",
      amount_cents: 5000,
      request_deduction: true,
      fund_id: "venmo",
      included_in_balance: false,
    },
  ];
  await expect(
    mutate({
      operation: "season",
      id: season,
      version: 1,
      name: "Current",
      note: "Fee plan",
      limit_cents: 90000,
      allocations: baseAllocations,
      planned_expenses: [{ ...planned[0], amount_cents: 11000 }],
    }),
  ).rejects.toThrow(/exceed their category/);
  await expect(
    mutate({
      operation: "season",
      id: season,
      version: 1,
      name: "Current",
      note: "Fee plan",
      limit_cents: 90000,
      allocations: baseAllocations,
      planned_expenses: [
        { ...planned[0], category: "Mix", fund_id: "goodbull" },
      ],
    }),
  ).rejects.toThrow(/Invalid planned expense/);
  await mutate({
    operation: "season",
    id: season,
    version: 1,
    name: "Current",
    note: "Fee plan",
    limit_cents: 90000,
    allocations: baseAllocations,
    planned_expenses: planned,
  });
  expect(
    (
      await db.query(
        "select status,reported_cents from budget_expenses where id=$1",
        [plannedId],
      )
    ).rows,
  ).toEqual([{ status: "pending", reported_cents: 5000 }]);
  expect(
    (await db.query("select balance_cents from budget_funds where id='venmo'"))
      .rows,
  ).toEqual([{ balance_cents: 100000 }]);
  await user(exec);
  expect(
    (await db.query("select * from budget_planned_expenses")).rows,
  ).toHaveLength(0);
  await expect(
    mutate({ operation: "approve", id: plannedId, version: 1 }),
  ).rejects.toThrow(/only submit expenses/);
  await user(captain);
  await mutate({ operation: "approve", id: plannedId, version: 1 });
  expect(
    (await db.query("select balance_cents from budget_funds where id='venmo'"))
      .rows,
  ).toEqual([{ balance_cents: 95000 }]);
  await user(owner);
  await expect(
    mutate({
      operation: "season",
      id: season,
      version: 2,
      name: "Current",
      note: "Change fee",
      limit_cents: 90000,
      allocations: baseAllocations,
      planned_expenses: [{ ...planned[0], amount_cents: 4000 }],
    }),
  ).rejects.toThrow(/must remain unchanged/);
  await mutate({
    operation: "season",
    id: season,
    version: 2,
    name: "Current",
    note: "Keep plan",
    limit_cents: 90000,
    allocations: baseAllocations,
    planned_expenses: planned,
  });
  expect(
    (await db.query("select * from budget_expenses where id=$1", [plannedId]))
      .rows,
  ).toHaveLength(1);
  await mutate({
    operation: "delete",
    id: plannedId,
    version: 2,
    note: "Fee was canceled",
  });
  expect(
    (await db.query("select * from budget_planned_expenses")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select balance_cents from budget_funds where id='venmo'"))
      .rows,
  ).toEqual([{ balance_cents: 100000 }]);
  await db.exec("reset role");
  expect(
    (
      await db.query<{ deleted_at: Date | null }>(
        "select deleted_at from budget_expenses where id=$1",
        [plannedId],
      )
    ).rows[0].deleted_at,
  ).not.toBeNull();
  await user(owner);
  await mutate({
    operation: "season",
    id: season,
    version: 3,
    name: "Current",
    note: "Remove canceled fee",
    limit_cents: 90000,
    allocations: baseAllocations,
    planned_expenses: [],
  });
});

it("records initial fund balances atomically and hides a deleted unused budget", async () => {
  await user(owner);
  const second = "10000000-0000-4000-8000-000000000004";
  const setup = {
    operation: "season",
    id: second,
    version: 0,
    name: "Future season",
    limit_cents: 90000,
    allocations: categories.map((category) => ({
      category,
      limit_cents: 10000,
    })),
    planned_expenses: [],
    fund_balances: [
      { fund_id: "venmo", amount_cents: 25000, version: 1 },
      { fund_id: "goodbull", amount_cents: 50000, version: 1 },
      { fund_id: "sofc", amount_cents: null, version: 1 },
    ],
  };
  await expect(
    saveSetup({
      ...setup,
      fund_balances: [{ fund_id: "venmo", amount_cents: 25000, version: 1 }],
    }),
  ).rejects.toThrow(/all three/);
  expect(
    (await db.query("select id from budget_seasons where id=$1", [second]))
      .rows,
  ).toHaveLength(0);
  await saveSetup(setup);
  expect(
    (
      await db.query<{ balance_cents: number }>(
        "select balance_cents,updated_at from budget_funds where id='venmo'",
      )
    ).rows[0].balance_cents,
  ).toBe(25000);
  await user(exec);
  expect(
    (await db.query<{ id: string }>("select budget_submission_season() as id"))
      .rows[0].id,
  ).toBe(second);
  await mutate(submission({ season_id: second }));
  await user(owner);
  await expect(
    deleteSeason({ id: second, version: 1, note: "Too soon" }),
  ).rejects.toThrow(/active expenses/);
  await mutate({
    operation: "delete",
    id: expense,
    version: 1,
    note: "Cancel test expense",
  });
  await deleteSeason({ id: second, version: 1, note: "Created by mistake" });
  expect(
    (
      await db.query<{ deleted_at: Date | null }>(
        "select deleted_at from budget_seasons where id=$1",
        [second],
      )
    ).rows[0].deleted_at,
  ).not.toBeNull();
  await expect(
    saveSetup({ ...setup, version: 2, note: "Reopen" }),
  ).rejects.toThrow(/deleted/);
  await user(exec);
  expect(
    (await db.query<{ id: string }>("select budget_submission_season() as id"))
      .rows[0].id,
  ).toBe(season);
  await expect(mutate(submission({ season_id: second }))).rejects.toThrow(
    /deleted/,
  );
});

it("removes a planned-only cost from allocated budget while keeping its allocation and an audit event", async () => {
  await user(owner);
  const planId = "30000000-0000-4000-8000-000000000009";
  await mutate({
    operation: "season",
    id: season,
    version: 1,
    name: "Current",
    note: "Add known fee",
    limit_cents: 900000,
    allocations: categories.map((category) => ({
      category,
      limit_cents: 100000,
    })),
    planned_expenses: [
      {
        id: planId,
        category: "Mix",
        name: "Mix fee",
        amount_cents: 2000,
        request_deduction: false,
        fund_id: null,
        included_in_balance: false,
      },
    ],
  });
  await user(exec);
  await expect(removePlanned({ id: planId, version: 2 })).rejects.toThrow(
    /Finance or owner/,
  );
  await user(owner);
  await removePlanned({ id: planId, version: 2 });
  expect(
    (
      await db.query("select id from budget_planned_expenses where id=$1", [
        planId,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select limit_cents from budget_allocations where season_id=$1 and category='Mix'",
        [season],
      )
    ).rows,
  ).toEqual([{ limit_cents: 100000 }]);
  expect(
    (
      await db.query(
        "select action from budget_events where season_id=$1 and action='planned_removed'",
        [season],
      )
    ).rows,
  ).toEqual([{ action: "planned_removed" }]);
});

it("accepts recorded payments without a source and approves without changing balances", async () => {
  await user(exec);
  await mutate(submission({ fund_id: "", included_in_balance: true }));
  await user(captain);
  const before = (
    await db.query<{ id: string; balance_cents: number }>(
      "select id,balance_cents from budget_funds order by id",
    )
  ).rows;
  await mutate({ operation: "approve", id: expense, version: 1 });
  expect(
    (
      await db.query<{ id: string; balance_cents: number }>(
        "select id,balance_cents from budget_funds order by id",
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await db.query(
        "select fund_id,paid_cents from budget_expenses where id=$1",
        [expense],
      )
    ).rows[0],
  ).toEqual({ fund_id: null, paid_cents: 2000 });
  await expect(
    mutate({
      operation: "payment",
      id: expense,
      version: 2,
      amount_cents: 1000,
      included_in_balance: false,
    }),
  ).rejects.toThrow(/funding source/);
  await mutate({
    operation: "payment",
    id: expense,
    version: 2,
    amount_cents: 1000,
    included_in_balance: false,
    fund_id: "venmo",
  });
  await user(finance);
  await mutate({ operation: "approve", id: expense, version: 3 });
  const after = (
    await db.query<{ id: string; balance_cents: number }>(
      "select id,balance_cents from budget_funds order by id",
    )
  ).rows;
  expect(after).toEqual(
    before.map((row) =>
      row.id === "venmo"
        ? { ...row, balance_cents: Number(row.balance_cents) - 1000 }
        : row,
    ),
  );
});

it("rejects missing funding sources for unpaid or unrecorded payments", async () => {
  await user(exec);
  for (const fund_id of ["", null]) {
    await expect(mutate(submission({ fund_id }))).rejects.toThrow(
      /funding source/,
    );
    await expect(
      mutate(
        submission({ fund_id, reported_cents: 0, included_in_balance: true }),
      ),
    ).rejects.toThrow(/funding source/);
  }
});

it("retains second-person review and cancels source-free recorded payments without fund changes", async () => {
  await user(exec);
  await mutate(
    submission({
      fund_id: null,
      reported_cents: 10000,
      included_in_balance: true,
    }),
  );
  await user(captain);
  const before = (
    await db.query<{ id: string; balance_cents: number }>(
      "select id,balance_cents from budget_funds order by id",
    )
  ).rows;
  await mutate({ operation: "approve", id: expense, version: 1 });
  await mutate({
    operation: "refund",
    id: expense,
    version: 2,
    amount_cents: 1000,
    included_in_balance: true,
  });
  await expect(
    mutate({ operation: "approve", id: expense, version: 3 }),
  ).rejects.toThrow();
  await user(finance);
  await mutate({ operation: "approve", id: expense, version: 3 });
  await mutate({
    operation: "delete",
    id: expense,
    version: 4,
    note: "Cancel recorded expense",
  });
  expect(
    (
      await db.query<{ id: string; balance_cents: number }>(
        "select id,balance_cents from budget_funds order by id",
      )
    ).rows,
  ).toEqual(before);
});

it("allows only the verified owner to self-approve with the normal audit and balance update", async () => {
  await user(owner);
  await mutate(submission());
  await mutate({ operation: "approve", id: expense, version: 1 });
  expect(
    (
      await db.query(
        "select status,reviewed_by,paid_cents from budget_expenses where id=$1",
        [expense],
      )
    ).rows[0],
  ).toEqual({ status: "approved", reviewed_by: owner, paid_cents: 2000 });
  expect(
    (
      await db.query(
        "select balance_cents from budget_funds where id='goodbull'",
      )
    ).rows[0],
  ).toEqual({ balance_cents: 98000 });
  await expect(
    mutate({ operation: "approve", id: expense, version: 1 }),
  ).rejects.toThrow();
  await mutate({
    operation: "payment",
    id: expense,
    version: 2,
    amount_cents: 1000,
    included_in_balance: true,
  });
  await mutate({ operation: "approve", id: expense, version: 3 });
  expect(
    (
      await db.query(
        "select actor_id from budget_events where expense_id=$1 and action='approve'",
        [expense],
      )
    ).rows,
  ).toEqual([{ actor_id: owner }, { actor_id: owner }]);
});

it("keeps Captain and Finance self-approval blocked for both creators and report submitters", async () => {
  for (const [index, actor] of [captain, finance].entries()) {
    const id = `30000000-0000-4000-8000-00000000000${index}`;
    await user(actor);
    await mutate(submission({ id }));
    await expect(
      mutate({ operation: "approve", id, version: 1 }),
    ).rejects.toThrow(/Someone else/);
    await user(owner);
    await mutate({ operation: "approve", id, version: 1 });
    await mutate({
      operation: "payment",
      id,
      version: 2,
      amount_cents: 1000,
      included_in_balance: true,
    });
    await user(actor);
    await expect(
      mutate({ operation: "approve", id, version: 3 }),
    ).rejects.toThrow(/Someone else/);
  }
  await user(exec);
  await mutate(submission());
  await expect(
    mutate({ operation: "approve", id: expense, version: 1, role: "owner" }),
  ).rejects.toThrow();
});

const incomeId = "50000000-0000-4000-8000-000000000001";
const incomeMutate = (payload: Record<string, unknown>) =>
  db.query("select budget_income_mutate($1::jsonb)", [JSON.stringify(payload)]);
const incomeSave = (extra: Record<string, unknown> = {}) =>
  incomeMutate({
    operation: "income_save",
    id: incomeId,
    version: 0,
    season_id: season,
    name: "Football remaining",
    category: "Football",
    expected_cents: 50000,
    ...extra,
  });

it("keeps forecasts separate and applies partial income receipts exactly once", async () => {
  await user(owner);
  await db.exec("reset role;update budget_funds set updated_at=now()");
  await user(owner);
  await incomeSave();
  expect(
    (await db.query("select balance_cents from budget_funds where id='venmo'"))
      .rows[0],
  ).toEqual({ balance_cents: 100000 });
  const receipt = {
    operation: "income_receive",
    id: incomeId,
    version: 1,
    receipt_id: "60000000-0000-4000-8000-000000000001",
    amount_cents: 20000,
    fund_id: "venmo",
    included_in_balance: false,
  };
  await incomeMutate(receipt);
  await expect(incomeMutate(receipt)).rejects.toThrow();
  expect(
    (await db.query("select balance_cents from budget_funds where id='venmo'"))
      .rows[0],
  ).toEqual({ balance_cents: 120000 });
  await expect(
    incomeSave({ version: 2, expected_cents: 10000 }),
  ).rejects.toThrow(/already received/);
  await incomeMutate({
    ...receipt,
    version: 2,
    receipt_id: "60000000-0000-4000-8000-000000000002",
    amount_cents: 30000,
    included_in_balance: true,
  });
  expect(
    (
      await db.query(
        "select received_cents,expected_cents from budget_income where id=$1",
        [incomeId],
      )
    ).rows[0],
  ).toEqual({ received_cents: 50000, expected_cents: 50000 });
  expect(
    (await db.query("select balance_cents from budget_funds where id='venmo'"))
      .rows[0],
  ).toEqual({ balance_cents: 120000 });
});
it("limits income access, preserves received money on cancellation and supports custom categories", async () => {
  await user(owner);
  await db.exec("reset role;update budget_funds set updated_at=now()");
  await user(owner);
  await incomeSave({ category: "Custom fundraiser" });
  for (const actor of [captain, exec, dancer]) {
    await user(actor);
    await expect(incomeSave()).rejects.toThrow(/access/);
  }
  await user(exec);
  expect((await db.query("select * from budget_income")).rows).toHaveLength(0);
  await expect(
    db.exec("update budget_income set expected_cents=1"),
  ).rejects.toThrow();
  await user(finance);
  await incomeMutate({
    operation: "income_receive",
    id: incomeId,
    version: 1,
    receipt_id: "60000000-0000-4000-8000-000000000001",
    amount_cents: 10000,
    fund_id: "venmo",
    included_in_balance: false,
  });
  await incomeMutate({ operation: "income_cancel", id: incomeId, version: 2 });
  expect(
    (await db.query("select canceled,received_cents from budget_income"))
      .rows[0],
  ).toEqual({ canceled: true, received_cents: 10000 });
  expect(
    (await db.query("select balance_cents from budget_funds where id='venmo'"))
      .rows[0],
  ).toEqual({ balance_cents: 110000 });
  await expect(incomeSave({ version: 3 })).rejects.toThrow(/changed/);
});
it("rejects income overpayments, invalid accounts and receipts on deleted seasons", async () => {
  await user(owner);
  await incomeSave();
  const receipt = {
    operation: "income_receive",
    id: incomeId,
    version: 1,
    receipt_id: "60000000-0000-4000-8000-000000000001",
    amount_cents: 50001,
    fund_id: "venmo",
    included_in_balance: false,
  };
  await expect(incomeMutate(receipt)).rejects.toThrow(/outstanding/);
  await expect(
    incomeMutate({ ...receipt, amount_cents: 1000 }),
  ).rejects.toThrow(/recorded balance/);
  await db.exec(
    "reset role;update budget_funds set updated_at=now();update budget_seasons set deleted_at=now()",
  );
  await user(owner);
  await expect(
    incomeMutate({ ...receipt, amount_cents: 1000 }),
  ).rejects.toThrow(/deleted/);
});

it("adds funds once, rejects unauthorized or stale credits and records an additive event", async () => {
  await db.exec("reset role;update budget_funds set updated_at=now()");
  const payload = {
    id: "70000000-0000-4000-8000-000000000001",
    version: 1,
    fund_id: "venmo",
    amount_cents: 2500,
    note: "Fundraiser",
  };
  const add = (extra: Record<string, unknown> = {}) =>
    db.query("select budget_add_funds($1::jsonb)", [
      JSON.stringify({ ...payload, ...extra }),
    ]);
  for (const actor of [exec, captain, dancer]) {
    await user(actor);
    await expect(add()).rejects.toThrow(/access/);
  }
  await user(owner);
  const fund = (
    await db.query<{ version: number }>(
      "select version from budget_funds where id='venmo'",
    )
  ).rows[0];
  await expect(
    add({ version: fund.version, amount_cents: -1 }),
  ).rejects.toThrow(/positive/);
  await add({ version: fund.version });
  await expect(add({ version: fund.version + 1 })).rejects.toThrow(
    /already recorded/,
  );
  await expect(
    add({ id: "70000000-0000-4000-8000-000000000002", version: fund.version }),
  ).rejects.toThrow(/changed/);
  expect(
    (await db.query("select balance_cents from budget_funds where id='venmo'"))
      .rows[0],
  ).toEqual({ balance_cents: 102500 });
  expect(
    (
      await db.query(
        "select action,delta_cents from budget_events where action='funds_added'",
      )
    ).rows,
  ).toEqual([{ action: "funds_added", delta_cents: 2500 }]);
});
