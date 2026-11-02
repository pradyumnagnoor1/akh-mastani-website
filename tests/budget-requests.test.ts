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
  reported_cents: 0,
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
  await db.exec(
    readFileSync(
      "supabase/migrations/0031_budget_expense_requests.sql",
      "utf8",
    ),
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

it("requires execs to request approval before reporting any payment", async () => {
  for (const extra of [
    { reported_cents: 1000 },
    { included_in_balance: true },
    { reported_cents: null },
  ])
    await expect(mutate(submission(extra))).rejects.toThrow(/Request approval/);
  await mutate(submission());
  expect(
    (
      await db.query(
        "select is_request,status,reported_cents,request_approved_at from budget_expenses where id=$1",
        [expense],
      )
    ).rows[0],
  ).toEqual({
    is_request: true,
    status: "pending",
    reported_cents: 0,
    request_approved_at: null,
  });
  await expect(
    mutate({ operation: "approve", id: expense, version: 1 }),
  ).rejects.toThrow();
  await expect(
    mutate({
      operation: "payment",
      id: expense,
      version: 1,
      amount_cents: 1000,
      included_in_balance: false,
    }),
  ).rejects.toThrow();
  await user(captain);
  const before = (
    await db.query("select balance_cents from budget_funds where id='goodbull'")
  ).rows;
  await mutate({ operation: "approve", id: expense, version: 1 });
  expect(
    (
      await db.query(
        "select balance_cents from budget_funds where id='goodbull'",
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await db.query(
        "select request_approved_at from budget_expenses where id=$1",
        [expense],
      )
    ).rows[0],
  ).not.toEqual({ request_approved_at: null });
  await user(exec);
  await expect(mutate(submission({ version: 2 }))).rejects.toThrow(/pending/);
  await user(owner);
  await mutate({
    operation: "payment",
    id: expense,
    version: 2,
    amount_cents: 1000,
    included_in_balance: false,
  });
  await user(captain);
  await mutate({ operation: "approve", id: expense, version: 3 });
  expect(
    (
      await db.query(
        "select balance_cents from budget_funds where id='goodbull'",
      )
    ).rows[0],
  ).toEqual({ balance_cents: 99000 });
});
it("allows changes and resubmission while preserving the no-spending boundary", async () => {
  await mutate(submission());
  await user(finance);
  await mutate({
    operation: "changes",
    id: expense,
    version: 1,
    note: "Attach a quote",
  });
  await user(exec);
  await mutate(submission({ version: 2, title: "Updated proposal" }));
  await expect(
    mutate(submission({ version: 3, reported_cents: 1000 })),
  ).rejects.toThrow(/Request approval/);
  await user(anotherExec);
  await expect(mutate(submission({ version: 3 }))).rejects.toThrow(/pending/);
  await user(captain);
  await mutate({ operation: "approve", id: expense, version: 3 });
  expect(
    (
      await db.query("select status from budget_expenses where id=$1", [
        expense,
      ])
    ).rows[0],
  ).toEqual({ status: "approved" });
});
it("keeps management payment reporting available and prevents exec changes to payment reports", async () => {
  await user(owner);
  await mutate(submission({ reported_cents: 1000 }));
  expect(
    (
      await db.query("select is_request from budget_expenses where id=$1", [
        expense,
      ])
    ).rows[0],
  ).toEqual({ is_request: false });
  await user(exec);
  await expect(mutate(submission({ version: 1 }))).rejects.toThrow();
});
