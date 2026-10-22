# Daily digest and smart nudges

Home's Today card shows the next schedule item and up to five personal actionable
entries, with an expandable list. Tasks/payments due today or overdue appear
first, then other incomplete assignments (including those without a deadline),
then unread announcements from the last seven days. Formation and assignment
updates do not appear in this card. Read status follows the saved Mark as read
state shown on the announcement page. Announcement previews come directly from the body;
there is no summary field or AI. Reported payments are labeled separately as
awaiting verification. A failed source shows an unavailable notice, not a false
caught-up state. Dates and deadlines use America/Chicago.

Today uses action prompts: Complete to-do, Read announcement, and Review payment.
Task rows use violet checklist icons; announcement rows use mint message icons,
with tinted inset cards distinct from the summary panels below. Tapping opens
the detail page; it does not automatically complete a task or mark a message read.

Admins can optionally add one absolute-time announcement reminder, a short
message, and an acknowledgment/preparation/linked-task stop condition. The
message appears inside the announcement; scheduled smart-nudge lock-screen payloads use
action prompts and counts after migration 0019, with authorized author instructions
following when space permits. A linked-task reminder reaches only dancers assigned both items.
Deleting its task removes that reminder configuration and related queued nudges.
Reminder edits use the same optimistic revision as the announcement. Skipped or
repeated daylight-saving times are rejected rather than silently guessed.

## Scheduling rules

Task nudges become eligible at 6 PM the day before, 9 AM on the due day, and 9 AM
on the following day. Payment nudges use the due day and one following-day
follow-up. These original scheduled stages do not repeat daily. Migration 0019 adds separately
controlled daily followups for older overdue and undated tasks, described below. Reports awaiting verification, verification, waiver,
completion, expiration and removed recipients suppress obsolete nudges.

Quiet hours are 10 PM–9 AM Texas time. Day-based stages expire at 10 PM that day.
Author reminders during quiet hours wait until 9 AM and have a six-hour useful
window ending sooner at quiet hours/announcement expiration. A new settings
revision creates a new occurrence; ordinary text changes do not. Overlapping
scheduler runs reuse the same member/record/stage/deadline occurrence.

Practice reminders use the existing connected-calendar freshness checks, normally
30–60 minutes before start. A late-night reminder may advance to 9:55 PM only
within two hours before the practice; otherwise it is skipped. All-day events
do not send practice reminders. Cancelled/rescheduled/stale occurrences are
rechecked immediately before sending and practice payloads expire at start.

Five-minute windows bundle eligible items for one member. Each bundle reserves
one of three daily slots atomically, then fans out to their opted-in devices.
Retries and additional devices do not consume extra slots. Reservations are
conservative: a failed or subsequently cancelled bundle can consume a slot.
Items suppressed by the cap stay in the digest; the skipped stage does not carry
into tomorrow. Existing immediate change alerts are a separate category.

Bundle counts and destinations are rebuilt before delivery. Empty bundles are
discarded. Provider TTL is bounded by the earliest remaining item's expiry, and
the service worker ignores expired payloads. Device state/provider delivery can
still race with the final check; exactly-once or exact-minute delivery is not
promised. Preserve the existing 40-device batch and concurrency of 10.

## Deploy without activating new nudges

1. Run the full local checks and obtain independent approval on the release
   artifact. Save a verified database/Storage recovery point before schema changes.
2. Apply the complete additive migration
   `supabase/migrations/0012_digest_nudges.sql` once, after 0011. It creates private
   ledgers, reminder settings/RPCs and audit-proven segment metadata. No team
   content is created, deleted or backdated by the migration.
3. New nudges default to **disabled** in `nudge_control`; legacy reminders continue.
   The existing production code remains compatible while disabled. Deploy the
   application only after the migration succeeds.
4. Preview shares production data by the owner's explicit choice. New code
   hard-disables direct, scheduled, and post-mutation dispatch whenever
   `VERCEL_ENV=preview`, even if production keys are present. Preview edits can
   still enqueue database-triggered alerts for the production worker; it is not
   an isolated place for destructive or team-wide notification tests.
5. Keep the existing five-minute Supabase Cron/Vault scheduler pointed at the
   **production** dispatch endpoint. Do not configure a second Preview scheduler.
   Check actual HTTP responses, environment/VAPID configuration and fresh calendar
   snapshots. A configured Cron expression alone is not proof of delivery.

The owner applied migration 0012 on 2026-10-12. On the same day, the owner
explicitly authorized production promotion and team-wide activation. Release
`56c62b0` is deployed at https://akh-mastani.vercel.app, with the Today action
cards and latest filtering refinements. Production build, health and sign-in
page checks passed. Live rollout control is enabled with no pilot restriction.
The existing five-minute production scheduler and Vault secret were verified.
An authenticated worker check returned HTTP200, configured=true, sent=1 and
zero retries/failures/expired jobs. This confirms provider acceptance, not
physical-phone display or tap acceptance. Preview dispatch remains disabled.

## Pilot and activation

Only the database owner changes rollout controls. Browser admins/members and
the service worker cannot read or write the private control/ledger tables.

After compatible production code is deployed, use a verified active test member's
permanent UUID to enable only that member:

```sql
update public.nudge_control
set enabled = true,
    pilot_members = array['REPLACE-WITH-VERIFIED-MEMBER-UUID'::uuid]
where id;
```

Verify one real opted-in phone, quiet hours, a mixed bundle, payment reporting,
task completion, and protected tap destinations. Use only explicitly authorized
records/recipients; local tests use synthetic identities and an isolated database.

For the full team:

```sql
update public.nudge_control
set enabled = true, pilot_members = null
where id;
```

Pilot members use smart scheduling; others retain legacy reminders. Enabling
suppresses their old queued reminder stages and skips legacy stages already
confirmed sent. Disabling invalidates new nudge jobs and restores legacy rules,
without repeating due/practice stages confirmed sent by the new system.

```sql
-- Pause only new nudges, preserving immediate alerts and legacy reminders.
update public.nudge_control set enabled = false where id;
```

`NOTIFICATION_DISPATCH_ENABLED=false` is an optional server environment kill
switch for **all** sending; redeploy after changing it. Roll back to the previous
app with new nudges disabled, keeping the additive schema. Do not reverse the
migration or reset the shared database.

## Maintenance and scope

Occurrence/bundle/quota tables are private operational data, separate from payment
audit history. Active scheduling prunes records beyond 30 days and source deletion
removes related occurrences/empty bundle jobs. Monitor aggregate dispatch errors
and backlog; logs must not expose subscription keys or private content.

Weekly goals and practice-relative announcement timing are intentionally deferred.
No new LLM/service dependency or paid-plan upgrade is introduced.

The local database tests execute PostgreSQL functions in PGlite. Its single
connection serializes overlapping calls; independent review checks the advisory
lock, unique keys and transactional quota update, but local tests do not establish
multi-connection hosted contention or real push-provider delivery.

## Automatic outstanding-action followups (migration 0019)

Apply `supabase/migrations/0019_notification_preview_labels.sql` once after 0018. It changes reminder/edit previews immediately through the existing RPC and creates `nudge_fallback_control`, disabled initially. It preserves `nudge_control`, the existing scheduler, subscriptions and notification settings. No new environment variables or frontend deployment are required.

When separately enabled, fallback candidates are considered daily from **6 PM until 10 PM America/Chicago**, then bundled by the existing five-minute scheduler:

| Item                         | Eligibility                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| Unread ordinary announcement | At least 24 hours old and no more than 7 days old                      |
| Undated incomplete task      | At least 24 hours old                                                  |
| Overdue incomplete task      | At least 24 hours old, starting after the original day-after-due stage |
| Future-deadline task         | Original deadline stages only                                          |
| Practice-linked announcement | Existing occurrence-linked practice reminder only                      |

Mark as read stops acknowledgment followups. Individual completion stops only that dancer's task followup; shared completion stops all assignees. Expiration, deletion, removed recipients, inactive membership and disabled smart/fallback rollout suppress obsolete delivery. Newly added recipients use the item's age; ordinary edits do not reset it or create an extra daily fallback.

An eligible configured author reminder owns its effective Chicago day, including a future reminder that day. A linked-task author reminder owns the corresponding task action too. Already-sent or pending scheduled reminders prevent another daily followup for that item. A missed author window without a pending/sent job does not block the evening fallback; an impossible reminder after source/linked-task expiration does not block it either. Preparation, acknowledgment and linked-task stop conditions remain distinct.

Fallbacks reuse existing private occurrences, per-member locks, unique daily keys and the **three-bundle daily cap**. Multiple devices/retries share the reservation. Skipped days are not replayed, and cap-suppressed stages do not carry over; still-eligible items can enter tomorrow's opportunity. The seven-day announcement limit prevents a large historical unread backlog. Old incomplete tasks can join the next daily bundle after activation.

Only the database owner can read/change the separate control. To pilot without changing existing team smart reminders:

```sql
update public.nudge_fallback_control
set enabled = true, pilot_members = array['REPLACE-WITH-VERIFIED-MEMBER-UUID'::uuid]
where id;
```

After targeted acceptance, activate for all existing smart-nudge members:

```sql
update public.nudge_fallback_control set enabled = true, pilot_members = null where id;
```

To pause only automatic followups, including queued fallback actions:

```sql
update public.nudge_fallback_control set enabled = false where id;
```

Configured author/deadline/practice reminders continue using their existing control. Mixed queued bundles rebuild with only remaining valid actions. Do not drop ledgers, reverse applied migrations or replay sent jobs to roll back copy changes; use a reviewed forward migration for payload fixes.

Verification: full-migration-chain local tests cover action previews, originating edit classification, practice merging/privacy, read/individual/shared completion, linked-task action deduplication/destinations, configured reminder collisions, expiry, quiet hours/DST, daily caps, multiple devices, rollout pause and cleanup. Hosted scheduler/provider acceptance and physical-phone rendering require separate evidence. No synthetic team-wide notification test is required.

Production activation on2026-10-22: migration0019 applied and function hashes verified; daily fallback enabled with no pilot restriction after the owner confirmed receipt of all three recipient-only test notifications. Existing smart control remains enabled. All393local tests/typecheck/lint/build and independent31-test review pass. The first6PMfallback window and exact phone label/tap results have not been independently observed.
