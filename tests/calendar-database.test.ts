import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const dancer = "00000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(readFileSync("supabase/migrations/0001_identity.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0005_calendar.sql", "utf8"));
  await db.query(
    `insert into auth.users values($1,'dancer@tamu.edu',now(),'{"provider":"google"}');`,
    [dancer],
  );
  await db.query(
    `insert into members(id,email,display_name,status) values($1,'dancer@tamu.edu','Dancer','active')`,
    [dancer],
  );
});
afterAll(async () => {
  await db?.close();
});
async function role(name: string) {
  await db.exec(`reset role;set role ${name}`);
}
async function claim(source = "source") {
  return (
    await db.query<{ token: string | null }>(
      "select calendar_claim_refresh($1,$2) token",
      [source, dancer],
    )
  ).rows[0].token;
}
it("denies anonymous and member writes, allows only active member reads", async () => {
  await role("authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    dancer,
  ]);
  await expect(claim()).rejects.toThrow(/permission/);
  await expect(
    db.exec("update calendar_snapshot set last_error='changed'"),
  ).rejects.toThrow(/permission/);
  await role("anon");
  await expect(db.exec("select * from calendar_snapshot")).rejects.toThrow(
    /permission/,
  );
});
it("serializes refreshes, fences old workers and preserves completed data on failure", async () => {
  await role("service_role");
  const token = await claim();
  expect(token).toBeTruthy();
  expect(await claim()).toBeNull();
  await db.query("select calendar_finish_refresh($1,$2,$3,$4,$5)", [
    "source",
    token,
    JSON.stringify([]),
    "2026-09-07T00:00:00Z",
    "2027-04-05T00:00:00Z",
  ]);
  expect(await claim()).toBeNull();
  await role("postgres");
  await db.exec(
    "update calendar_snapshot set next_attempt_at=now()-interval '1 second',last_success_at=now()-interval '10 minutes'",
  );
  await role("service_role");
  const second = await claim();
  expect(second).toBeTruthy();
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select calendar_finish_refresh($1,$2,$3,$4,$5) ok",
        ["source", token, "[]", "2026-09-07T00:00:00Z", "2027-04-05T00:00:00Z"],
      )
    ).rows[0].ok,
  ).toBe(false);
  await db.query("select calendar_fail_refresh($1,$2,$3)", [
    "source",
    second,
    "upstream",
  ]);
  await role("postgres");
  const row = (
    await db.query<{ last_success_at: string; last_error: string }>(
      "select * from calendar_snapshot",
    )
  ).rows[0];
  expect(row.last_success_at).toBeTruthy();
  expect(row.last_error).toBe("upstream");
  await role("service_role");
  expect(await claim()).toBeNull();
});
it("clears old source data and prevents expired finalization", async () => {
  await role("service_role");
  const token = await claim("new-source");
  expect(token).toBeTruthy();
  await role("postgres");
  expect(
    (
      await db.query<{ last_success_at: null; events: unknown[] }>(
        "select * from calendar_snapshot",
      )
    ).rows[0],
  ).toMatchObject({ last_success_at: null, events: [] });
  await role("postgres");
  await db.exec(
    "update calendar_snapshot set lease_until=now()-interval '1 second'",
  );
  await role("service_role");
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select calendar_finish_refresh($1,$2,$3,$4,$5) ok",
        [
          "new-source",
          token,
          "[]",
          "2026-09-07T00:00:00Z",
          "2027-04-05T00:00:00Z",
        ],
      )
    ).rows[0].ok,
  ).toBe(false);
});
it("revoked membership prevents both snapshot reads and server refresh claims", async () => {
  await role("postgres");
  await db.query("update members set status='inactive' where id=$1", [dancer]);
  await role("authenticated");
  expect(
    (await db.exec("select * from calendar_snapshot"))[0].rows,
  ).toHaveLength(0);
  await role("service_role");
  await expect(claim()).rejects.toThrow(/Active/);
});
