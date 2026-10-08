# Admin management and featured events

## Enable this update

1. In Supabase → SQL Editor, run [0008_management_featured_events.sql](../supabase/migrations/0008_management_featured_events.sql) once, after migrations0001–0007. Take a recovery point first and record the applied migration. Do not rerun earlier migrations that already succeeded; interrupted0008 recovery is covered below.
2. Apply [0009_permanent_deletion.sql](../supabase/migrations/0009_permanent_deletion.sql) after0008, then deploy. Configure the Storage cleanup retry scheduler below and [Choreo connection](choreo.md).
3. As an admin, create/edit/delete a test featured event from Practice Calendar. Check another approved dancer sees it and has no management controls. Create a small test charge, edit it, delete it with an explanation and confirm the outstanding balance clears and the deleted charge/detail/history disappear from both accounts. Owner database inspection must still find the retained payment audit.
4. Send a targeted test announcement to an opted-in dancer. Confirm its title appears on their notification. The body remains generic and tapping still requires team access.

Apply migrations0008 then0009 before deploying this code: Home and Calendar now read the featured-event table. Existing deployment remains compatible with the new schema during rollout. Roll back the application deployment if necessary; do not reverse financial/audit data.

## Operations by record

| Record                     | Create                                                        | Read                                              | Update                                                                                    | Delete/removal                                                                                     |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Announcements              | Admin: New announcement                                       | Captured recipients and admins                    | Admin: Edit announcement                                                                  | Admin: Delete announcement; permanently removed with recipient progress/history                    |
| To-dos                     | Admin: Create to-do                                           | Captured recipients and admins                    | Admin: Edit to-do or reopen; dancers complete assigned work                               | Admin: Delete to-do; permanently removed with recipient progress/history                           |
| Payments                   | Admin: Issue charges to dancer/group/segment/team             | Own payments for dancers; all for admins          | Admin: Edit charge while unpaid/reported; verify/reject/waive as appropriate              | Admin: Delete with explanation; hidden everywhere in app, original UUID/history retained privately |
| Segments and formation PDF | Admin: Add segment and upload PDF                             | Active members                                    | Admin: rename, change assignment, replace PDF                                             | Admin: Permanently remove segment, assignments, history and current/historical PDFs                |
| Saved recipient groups     | Admin: Create group                                           | Admin management and recipient picker             | Admin: Edit group                                                                         | Admin: Delete group; permanently removes group/history; live post recipient snapshots remain       |
| Featured events            | Admin: Calendar → Add featured event                          | Approved active team                              | Admin: Edit event                                                                         | Admin: Permanently delete event and related audit/notification jobs                                |
| Membership/roster          | Verified Google sign-in plus one-time name and admin approval | Approved active team, private payments restricted | Admin: correct name, approve/reactivate; admin privileges still manually granted by owner | Admin: Deactivate; access stops, permanent IDs/history remain                                      |
| Google connection          | Admin: Connect Google Calendar                                | Approved team sees schedule                       | Admin: Reconnect; schedule edits remain in Google                                         | Admin: Disconnect                                                                                  |
| Device notifications       | Dancer: enable on their device                                | Own device status                                 | Permission is controlled by browser/device settings                                       | Dancer: disable/unregister their device                                                            |

Home, summaries and roster segments derive from these records; they do not have independent duplicated entries to manage. History for live records is retained; deleting non-payment items removes their history as well. Deleted payment evidence remains private in the database.

## Payment corrections

Editing an outstanding charge requires a change explanation. Original amount, instructions, due date, payment report and new details are retained in the audit. The dancer assignment stays the same. If payment was reported, the corrected charge becomes unpaid, clears the current report and requires a new report before verification. Stale forms cannot verify an earlier revision.

Verified/waived charges cannot be edited. Admins can delete an erroneous charge; deletion records the previous state and explanation and does not erase evidence of a past verification. Deleted charges cannot be reported again or generate unpaid reminders. Migration0009 hides deleted charges and their audits from all authenticated app users, including admins, and from the operational export. Old detail links return404. Owner-controlled database backups retain the financial evidence. The website does not transfer or reverse money.

## Featured events

Custom events are independent of Google Calendar. Add a title, date, optional time in America/Chicago, location, details and http/https event link. They appear above the Google practice schedule and the next three appear on Home. Past events remain manageable by admins under Past featured events. Google synchronization and its ten-event display cap remain unchanged.

Creation and meaningful edits notify opted-in active dancers using a generic calendar update. Deleted events suppress queued featured-event delivery. Featured events currently have no automatic timed reminder; existing practice reminders continue to originate from Google Calendar.

## Notification titles

Announcement notifications now show the announcement title, including jobs already queued when migration0008 runs. The announcement body and names, payment reasons/amounts and task details stay out of the payload. Only targeted active recipients with subscriptions receive the announcement. Admins should write a title appropriate for a Lock Screen preview. No extra authorization from each dancer is required.

## Verification limits

SQL tests exercise actual migrations/RLS with synthetic identities. Browser tests exercise create/edit/delete, confirmations, access and cross-page consistency in desktop/mobile Chromium layouts. Real hosted migration/deployment and physical iPhone push delivery require the setup checks above.

## Permanent deletion rollout

Migration `0009_permanent_deletion.sql` implements the latest deletion policy. Deleted announcements, to-dos, saved groups, segments and featured events are physically removed from application tables, together with their dependent recipients/assignments/audits and queued notifications. Existing archived/deleted non-payment records are purged when the migration runs. This cannot be reversed by a frontend rollback. Deleted payment charges are the explicit exception: preserve the charge, batch and financial audit privately, but hide them from every app role, page and export and suppress all notifications. Membership deactivation remains an access change rather than deletion.

Deleting a group or segment preserves already-published posts and their captured recipients. Their removed source is replaced with Selected dancers, and the post version increments so stale edit forms cannot overwrite the change. There is no Deleted/Archive tab or restore action.

Apply0009 after0008 in Supabase SQL Editor, then deploy the application. Take a provider-supported recovery backup beforehand if required by the team recovery policy. Existing archive RPC names remain callable for compatible rollout but perform permanent deletion. No live migration/deployment is claimed by local tests.

Segment deletion immediately removes the segment/detail/document routes and all authenticated access to its PDFs. Storage bytes are removed through Supabase Storage API in post-response cleanup; temporary failures retain a service-only cleanup queue for retry. The server needs `SUPABASE_SECRET_KEY`. Never delete `storage.objects` metadata directly. Files still referenced by another live segment/history are retained; immutable object paths and transaction locks prevent reattaching a file queued for deletion.

For reliable retries and previously archived PDFs, schedule `/api/maintenance` every five minutes using the same private Bearer `CRON_SECRET` as notifications. This endpoint works independently of notification/VAPID setup, processes at most40 paths, and returns200 only after processing succeeds; retry503. In Supabase Cron use the existing Vault secret from [notification setup](notifications.md):

```sql
select cron.schedule(
  'mastani-file-cleanup-five-minutes',
  '*/5 * * * *',
  $$select net.http_get(
    url := 'https://akh-mastani.vercel.app/api/maintenance',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets
       where name='mastani_push_cron_secret' limit 1)),
    timeout_milliseconds := 30000
  );$$
);
```

Check the HTTP response, not just the cron enqueue result. Pending object keys are internal operational state and never shown in the app. Provider backups, previously downloaded files and already-delivered device alerts are separate copies; application deletion does not recall them.

## Recover an interrupted0008 run

If SQL Editor reports `42723: function "manage_payment_charge" already exists with same argument types`,0008 has installed at least that function. The error alone does not prove the remaining tables/policies/triggers are present. Replace the editor contents with the **complete current** [0008 migration](../supabase/migrations/0008_management_featured_events.sql) and run it as the project owner. The corrected file uses create-or-replace functions and conditional table/index creation, refreshes its own policies/trigger, and keeps existing member/event/payment/audit rows and UUIDs. It is a single transaction; an error rolls back the entire attempt. If an editor session says the transaction is aborted, run `rollback;` before starting a fresh attempt. Existing0001–0007 migrations are still required; do not rerun them.

Once0008 succeeds, apply0009 once. If0009 has already started, even if interrupted during its first foreign-key change, corrected0008 refuses before changing any schema or behavior, so it cannot revive soft deletion or expose deleted payments. In that case do not force the old migration through or drop existing functions/tables; use the applied migration ledger and0009 recovery status. This repair supports known original/partial0008 schemas, not arbitrary hand-edited schema drift. Run migrations sequentially. A10-second lock timeout returns a failure instead of waiting indefinitely on active writes; retry during a quiet interval if that occurs. Local regression tests cover function-only interruption, populated replay, missing policy/function/trigger recovery, permissions, and refusal after0009. No live database was inspected or modified by the repair.

[PostgreSQL function replacement](https://www.postgresql.org/docs/current/sql-createfunction.html), [transactions](https://www.postgresql.org/docs/current/sql-begin.html).
