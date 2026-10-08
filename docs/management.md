# Admin management and featured events

## Enable this update

1. In Supabase → SQL Editor, run [0008_management_featured_events.sql](../supabase/migrations/0008_management_featured_events.sql) once, after migrations0001–0007. Take a recovery point first and record the applied migration. Do not rerun migrations that already succeeded.
2. Deploy this code to Vercel. No new environment variables or cron jobs are needed.
3. As an admin, create/edit/delete a test featured event from Practice Calendar. Check another approved dancer sees it and has no management controls. Create a small test charge, edit it, delete it with an explanation and confirm the outstanding balance clears while activity remains.
4. Send a targeted test announcement to an opted-in dancer. Confirm its title appears on their notification. The body remains generic and tapping still requires team access.

Apply migration0008 before deploying this code: Home and Calendar now read the featured-event table. Existing deployment remains compatible with the new schema during rollout. Roll back the application deployment if necessary; do not reverse financial/audit data.

## Operations by record

| Record                     | Create                                                        | Read                                              | Update                                                                                    | Delete/removal                                                                                    |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Announcements              | Admin: New announcement                                       | Captured recipients and admins                    | Admin: Edit announcement                                                                  | Admin: Delete announcement; removed for dancers, retained under Deleted and restorable            |
| To-dos                     | Admin: Create to-do                                           | Captured recipients and admins                    | Admin: Edit to-do or reopen; dancers complete assigned work                               | Admin: Delete to-do; same retained/restorable behavior                                            |
| Payments                   | Admin: Issue charges to dancer/group/segment/team             | Own payments for dancers; all for admins          | Admin: Edit charge while unpaid/reported; verify/reject/waive as appropriate              | Admin: Delete charge with explanation; clears outstanding balance and keeps original UUID/history |
| Segments and formation PDF | Admin: Add segment and upload PDF                             | Active members                                    | Admin: rename, change assignment, replace PDF                                             | Admin: Remove segment; archive retains historical PDF and assignments                             |
| Saved recipient groups     | Admin: Create group                                           | Admin management and recipient picker             | Admin: Edit group                                                                         | Admin: Delete group; future selection excludes it, original recipient snapshots remain            |
| Featured events            | Admin: Calendar → Add featured event                          | Approved active team                              | Admin: Edit event                                                                         | Admin: Delete event with confirmation; audit/export retains history                               |
| Membership/roster          | Verified Google sign-in plus one-time name and admin approval | Approved active team, private payments restricted | Admin: correct name, approve/reactivate; admin privileges still manually granted by owner | Admin: Deactivate; access stops, permanent IDs/history remain                                     |
| Google connection          | Admin: Connect Google Calendar                                | Approved team sees schedule                       | Admin: Reconnect; schedule edits remain in Google                                         | Admin: Disconnect                                                                                 |
| Device notifications       | Dancer: enable on their device                                | Own device status                                 | Permission is controlled by browser/device settings                                       | Dancer: disable/unregister their device                                                           |

Home, summaries and roster segments derive from these records; they do not have independent duplicated entries to manage. Audit records are retained, not editable or deletable through the application.

## Payment corrections

Editing an outstanding charge requires a change explanation. Original amount, instructions, due date, payment report and new details are retained in the audit. The dancer assignment stays the same. If payment was reported, the corrected charge becomes unpaid, clears the current report and requires a new report before verification. Stale forms cannot verify an earlier revision.

Verified/waived charges cannot be edited. Admins can delete an erroneous charge; deletion records the previous state and explanation and does not erase evidence of a past verification. Deleted charges cannot be reported again or generate unpaid reminders. Payment history remains visible under the same protected link. The website does not transfer or reverse money.

## Featured events

Custom events are independent of Google Calendar. Add a title, date, optional time in America/Chicago, location, details and http/https event link. They appear above the Google practice schedule and the next three appear on Home. Past events remain manageable by admins under Past featured events. Google synchronization and its ten-event display cap remain unchanged.

Creation and meaningful edits notify opted-in active dancers using a generic calendar update. Deleted events suppress queued featured-event delivery. Featured events currently have no automatic timed reminder; existing practice reminders continue to originate from Google Calendar.

## Notification titles

Announcement notifications now show the announcement title, including jobs already queued when migration0008 runs. The announcement body and names, payment reasons/amounts and task details stay out of the payload. Only targeted active recipients with subscriptions receive the announcement. Admins should write a title appropriate for a Lock Screen preview. No extra authorization from each dancer is required.

## Verification limits

SQL tests exercise actual migrations/RLS with synthetic identities. Browser tests exercise create/edit/delete, confirmations, access and cross-page consistency in desktop/mobile Chromium layouts. Real hosted migration/deployment and physical iPhone push delivery require the setup checks above.
