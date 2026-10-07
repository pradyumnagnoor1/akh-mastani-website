import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const admin = "00000000-0000-4000-8000-000000000001";
const dancer = "00000000-0000-4000-8000-000000000002";
const outsider = "00000000-0000-4000-8000-000000000003";
const hash = (n: number) => n.toString(16).padStart(64, "0");
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  for (const migration of [
    "0001_identity",
    "0005_calendar",
    "0006_calendar_connection",
  ])
    await db.exec(readFileSync(`supabase/migrations/${migration}.sql`, "utf8"));
  for (const [id, name, isAdmin] of [
    [admin, "admin", true],
    [dancer, "dancer", false],
  ] as const) {
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}')`,
      [id, `${name}@tamu.edu`],
    );
    await db.query(
      `insert into members(id,email,display_name,status,is_admin) values($1,$2,$3,'active',$4)`,
      [id, `${name}@tamu.edu`, name, isAdmin],
    );
  }
});
afterAll(async () => {
  await db?.close();
});
async function role(name: string, actor = admin) {
  await db.exec(`reset role;set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
}
async function scalar(sql: string, values: unknown[] = []) {
  return (await db.query<{ value: unknown }>(`select ${sql} as value`, values))
    .rows[0].value;
}
const begin = (actor: string, n: number) =>
  scalar("begin_calendar_connection($1,$2)", [actor, hash(n)]);
const consume = (actor: string, n: number) =>
  scalar("consume_calendar_connection($1,$2)", [actor, hash(n)]);
const save = (actor: string, version: number) =>
  scalar(
    "save_calendar_connection($1,$2,'calendar@group.calendar.google.com','client','encrypted-secret')",
    [actor, version],
  );
it("denies direct ciphertext access for all API roles and restricts RPCs", async () => {
  for (const name of ["anon", "authenticated", "service_role"]) {
    await role(name);
    await expect(db.exec("select * from calendar_connection")).rejects.toThrow(
      /permission/,
    );
    await expect(
      db.exec("select * from calendar_connection_attempts"),
    ).rejects.toThrow(/permission/);
  }
  for (const name of ["anon", "authenticated"]) {
    await role(name);
    await expect(scalar("calendar_read_connection()")).rejects.toThrow(
      /permission/,
    );
    await expect(begin(admin, 1)).rejects.toThrow(/permission/);
    await expect(consume(admin, 1)).rejects.toThrow(/permission/);
    await expect(save(admin, 0)).rejects.toThrow(/permission/);
    await expect(
      scalar("disconnect_calendar_connection($1,0)", [admin]),
    ).rejects.toThrow(/permission/);
  }
  await role("authenticated", dancer);
  await expect(scalar("calendar_connection_status()")).rejects.toThrow(/Admin/);
  await role("authenticated", outsider);
  await expect(scalar("calendar_connection_status()")).rejects.toThrow(/Admin/);
  await role("service_role");
  for (const actor of [dancer, outsider]) {
    await expect(begin(actor, 2)).rejects.toThrow(/Admin/);
    await expect(consume(actor, 2)).rejects.toThrow(/Admin/);
    await expect(save(actor, 0)).rejects.toThrow(/Admin/);
    await expect(
      scalar("disconnect_calendar_connection($1,0)", [actor]),
    ).rejects.toThrow(/Admin/);
  }
});
it("binds one-use attempts to actors and rejects collisions, expiry and replay", async () => {
  await role("service_role");
  expect(await begin(admin, 10)).toBe(0);
  await expect(begin(admin, 10)).rejects.toThrow(/duplicate/);
  await expect(consume(dancer, 10)).rejects.toThrow(/Admin/);
  expect(await consume(admin, 10)).toBe(0);
  await expect(consume(admin, 10)).rejects.toThrow(/Invalid/);
  await begin(admin, 11);
  await role("postgres");
  await db.exec(
    "update calendar_connection_attempts set expires_at=now()-interval '1 second'",
  );
  await role("service_role");
  await expect(consume(admin, 11)).rejects.toThrow(/expired/);
  await begin(admin, 12);
  await role("postgres");
  expect(
    await scalar("(select count(*) from calendar_connection_attempts)"),
  ).toBe(1);
});
it("persists encrypted configuration, sanitizes status and fences stale callbacks", async () => {
  await role("service_role");
  expect(await save(admin, 0)).toBe(1);
  await expect(save(admin, 0)).rejects.toThrow(/version changed/);
  expect(await scalar("calendar_read_connection()")).toMatchObject({
    version: 1,
    encrypted_token: "encrypted-secret",
    connected_by: admin,
  });
  await role("authenticated");
  const status = await scalar("calendar_connection_status()");
  expect(Object.keys(status as object).sort()).toEqual([
    "calendar_id",
    "connected_at",
    "version",
  ]);
});
it("disconnect preserves version and clears snapshots, fencing in-flight workers", async () => {
  await role("service_role");
  const source = (await scalar(
    "encode(sha256(convert_to('connected:1:client:calendar@group.calendar.google.com','UTF8')),'hex')",
  )) as string;
  const token = await scalar("calendar_claim_refresh($1,$2)", [source, dancer]);
  expect(token).toBeTruthy();
  expect(await scalar("disconnect_calendar_connection($1,1)", [admin])).toBe(2);
  expect(
    await scalar(
      "calendar_finish_refresh($1,$2,'[]','2026-09-01','2027-01-01')",
      [source, token],
    ),
  ).toBe(false);
  expect(await scalar("calendar_read_connection()")).toMatchObject({
    version: 2,
    calendar_id: null,
    encrypted_token: null,
  });
  await expect(save(admin, 1)).rejects.toThrow(/version changed/);
  expect(
    await scalar("calendar_claim_refresh($1,$2)", [source, dancer]),
  ).toBeNull();
  expect(await save(admin, 2)).toBe(3);
  expect(
    await scalar("calendar_claim_refresh($1,$2)", [source, dancer]),
  ).toBeNull();
  const currentSource = await scalar(
    "encode(sha256(convert_to('connected:3:client:calendar@group.calendar.google.com','UTF8')),'hex')",
  );
  expect(
    await scalar("calendar_claim_refresh($1,$2)", [currentSource, dancer]),
  ).toBeTruthy();
});
it("rechecks current verified admin eligibility at every mutation", async () => {
  await role("service_role");
  await begin(admin, 20);
  for (const change of [
    "is_admin=false",
    "status='inactive'",
    "display_name=null",
  ]) {
    await role("postgres");
    await db.exec(
      `update members set ${change} where is_admin or id='${admin}'`,
    );
    await role("service_role");
    await expect(begin(admin, 21)).rejects.toThrow(/Admin/);
    await expect(consume(admin, 20)).rejects.toThrow(/Admin/);
    await expect(save(admin, 3)).rejects.toThrow(/Admin/);
    await expect(
      scalar("disconnect_calendar_connection($1,3)", [admin]),
    ).rejects.toThrow(/Admin/);
    await role("postgres");
    await db.query(
      "update members set is_admin=true,status='active',display_name='admin' where id=$1",
      [admin],
    );
  }
  for (const change of [
    "email_confirmed_at=null",
    "raw_app_meta_data='{}'",
    "email='admin@example.com'",
  ]) {
    await role("postgres");
    await db.exec(`update auth.users set ${change} where id='${admin}'`);
    await role("service_role");
    await expect(save(admin, 3)).rejects.toThrow(/Admin/);
    await role("postgres");
    await db.query(
      `update auth.users set email_confirmed_at=now(),raw_app_meta_data='{"provider":"google"}',email='admin@tamu.edu' where id=$1`,
      [admin],
    );
  }
  await role("service_role");
  expect(await consume(admin, 20)).toBe(3);
});
