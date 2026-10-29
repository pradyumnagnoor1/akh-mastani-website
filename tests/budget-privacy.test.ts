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
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate budget_events,budget_receipts,budget_expenses,budget_planned_expenses,budget_allocations,budget_seasons,budget_owners;truncate auth.users cascade;insert into budget_funds(id,name,balance_cents) values ('venmo','Venmo',100000),('goodbull','SOFC Good Bull',100000),('sofc','Main SOFC',100000);",
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
  ).rejects.toThrow(/Existing categories must remain/);
  await expect(
    mutate({
      operation: "season",
      id: "10000000-0000-4000-8000-000000000003",
      version: 0,
      name: "Changed case",
      limit_cents: 115000,
      allocations: allocationList.map((item) =>
        item.category === "Production"
          ? { ...item, category: "production" }
          : item,
      ),
    }),
  ).rejects.toThrow(/standard categories/);
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
