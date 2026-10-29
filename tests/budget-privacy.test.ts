import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
const owner = "00000000-0000-4000-8000-000000000001";
const finance = "00000000-0000-4000-8000-000000000002";
const captain = "00000000-0000-4000-8000-000000000003";
const exec = "00000000-0000-4000-8000-000000000004";
const dancer = "00000000-0000-4000-8000-000000000005";
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

it("lets other execs submit but reveals no budget, funds, expense, receipt or history rows", async () => {
  expect(
    (await db.query("select budget_submission_season() as id")).rows,
  ).toEqual([{ id: season }]);
  for (const table of [
    "budget_funds",
    "budget_seasons",
    "budget_allocations",
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
    "budget_expenses",
    "budget_events",
    "budget_receipts",
  ])
    expect((await db.query(`select * from ${table}`)).rows, table).toHaveLength(
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

it("prevents exec edits, payment, refund, deletion, review and implementation bypass", async () => {
  await mutate(submission());
  for (const operation of [
    "submit",
    "payment",
    "refund",
    "delete",
    "approve",
    "changes",
  ])
    await expect(
      mutate({ ...submission(), operation, version: 1 }),
    ).rejects.toThrow(/only add new expenses/);
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
  await mutate({ operation: "approve", id: expense, version: 1 });
  expect((await db.query("select status from budget_expenses")).rows).toEqual([
    { status: "approved" },
  ]);
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
