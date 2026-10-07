import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
let db: PGlite;
const admin = "00000000-0000-0000-0000-000000000001";
const dancer = "00000000-0000-0000-0000-000000000002";
const outsider = "00000000-0000-0000-0000-000000000003";
const pending = "00000000-0000-0000-0000-000000000004";
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(readFileSync("supabase/migrations/0001_identity.sql", "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("reset role");
  await db.exec("truncate auth.users cascade");
  for (const [id, email] of [
    [admin, "owner@tamu.edu"],
    [dancer, "dancer@tamu.edu"],
    [outsider, "outsider@gmail.com"],
    [pending, "pending@tamu.edu"],
  ]) {
    await db.query(
      `insert into auth.users values($1,$2,now(),' {"provider":"google"}'::jsonb)`,
      [id, email],
    );
  }
  for (const id of [admin, dancer, pending]) {
    await asUser(id);
    await db.query("select public.ensure_member()");
    await db.query("select public.complete_onboarding($1)", ["Test Dancer"]);
  }
  await db.exec("reset role");
  await db.query(
    "update public.members set status='active',is_admin=(id=$1) where id in ($1,$2)",
    [admin, dancer],
  );
});
describe("identity database permissions", () => {
  it("denies roster access to anonymous visitors", async () => {
    await db.exec("set role anon");
    await expect(db.query("select * from public.members")).rejects.toThrow();
  });
  it("allows approved dancers to see the roster", async () => {
    await asUser(dancer);
    const r = await db.query("select * from public.members");
    expect(r.rows).toHaveLength(2);
  });
  it("shows only the pending member own profile before approval", async () => {
    await asUser(pending);
    const r = await db.query("select id from public.members");
    expect(r.rows).toEqual([{ id: pending }]);
  });
  it("rejects non-TAMU Google identities", async () => {
    await asUser(outsider);
    await expect(db.query("select public.ensure_member()")).rejects.toThrow(
      /TAMU/,
    );
    expect((await db.query("select * from public.members")).rows).toHaveLength(
      0,
    );
  });
  it("does not allow direct self-promotion or status changes", async () => {
    await asUser(dancer);
    await expect(
      db.query("update public.members set is_admin=true"),
    ).rejects.toThrow();
    await expect(
      db.query("update public.members set status='active'"),
    ).rejects.toThrow();
  });
  it("does not let dancers approve pending members", async () => {
    await asUser(dancer);
    await expect(
      db.query("select public.set_member_status($1,'active')", [pending]),
    ).rejects.toThrow(/Admin/);
  });
  it("lets admins approve members without granting admin", async () => {
    await asUser(admin);
    await db.query("select public.set_member_status($1,'active')", [pending]);
    expect(
      (
        await db.query<{ is_admin: boolean }>(
          "select is_admin from public.members where id=$1",
          [pending],
        )
      ).rows[0].is_admin,
    ).toBe(false);
  });
  it("takes away team access immediately on deactivation", async () => {
    await asUser(admin);
    await db.query("select public.set_member_status($1,'inactive')", [dancer]);
    await asUser(dancer);
    expect((await db.query("select id from public.members")).rows).toEqual([
      { id: dancer },
    ]);
  });
  it("cannot rewrite name through the one-time onboarding endpoint", async () => {
    await asUser(dancer);
    await db.query("select public.complete_onboarding('Different Person')");
    expect(
      (
        await db.query<{ display_name: string }>(
          "select display_name from public.members where id=$1",
          [dancer],
        )
      ).rows[0].display_name,
    ).toBe("Test Dancer");
  });
  it("rejects changed email and revoked provider verification", async () => {
    await db.query("update auth.users set email=$1 where id=$2", [
      "dancer@evil.com",
      dancer,
    ]);
    await asUser(dancer);
    expect((await db.query("select id from public.members")).rows).toHaveLength(
      0,
    );
  });
  it("rejects unverified and non-Google identities", async () => {
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [pending],
    );
    await asUser(pending);
    await expect(db.query("select public.ensure_member()")).rejects.toThrow();
    await db.exec("reset role");
    await db.query(
      `update auth.users set email_confirmed_at=now(),raw_app_meta_data='{"provider":"email"}' where id=$1`,
      [pending],
    );
    await asUser(pending);
    await expect(db.query("select public.ensure_member()")).rejects.toThrow();
  });
  it("cannot fill in someone else onboarding name through admin correction", async () => {
    await db.query("update public.members set display_name=null where id=$1", [
      pending,
    ]);
    await asUser(admin);
    await expect(
      db.query("select public.correct_member_name($1,'Chosen by Admin')", [
        pending,
      ]),
    ).rejects.toThrow(/onboarding/);
  });
  it("rejects invalid onboarding names at the database boundary", async () => {
    await asUser(pending);
    await expect(
      db.query("select public.complete_onboarding('   ')"),
    ).rejects.toThrow(/Name/);
    await expect(
      db.query("select public.complete_onboarding($1)", ["x".repeat(81)]),
    ).rejects.toThrow(/Name/);
  });
  it("protects audit history from dancer reads and admin writes", async () => {
    await asUser(dancer);
    expect(
      (await db.query("select * from public.member_audit")).rows,
    ).toHaveLength(0);
    await asUser(admin);
    expect(
      (await db.query("select * from public.member_audit")).rows.length,
    ).toBeGreaterThan(0);
    await expect(db.query("delete from public.member_audit")).rejects.toThrow();
  });
});
