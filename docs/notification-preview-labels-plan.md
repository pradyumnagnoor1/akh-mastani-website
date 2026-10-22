# Notification preview labels

Status: implemented and independently reviewed; migration0019 applied live on2026-10-22. Preview labels and smart action prompts are active. Automatic daily followups are enabled for the team after the user confirmed receipt of all three targeted test notifications. The user authorized execution of the schedule below.

## Requested behavior

Put the notification type first in the push title so it is visible in collapsed previews:

| Delivery                                    | Example title                          |
| ------------------------------------------- | -------------------------------------- |
| New announcement                            | Costume pickup                         |
| Scheduled announcement reminder             | Reminder: Costume pickup               |
| Notification caused by an announcement edit | Edited announcement: Costume pickup    |
| Practice reminder                           | Reminder: Practice: Thursday rehearsal |
| Bundled reminders                           | Reminder: AKH Mastani                  |
| Legacy task/payment reminder                | Reminder: AKH Mastani                  |

Keep current author/body excerpts and authorized practice details where space permits, after the required action prompt for smart nudges. Task/payment content stays generic. A scheduled reminder about a previously edited announcement is labeled Reminder; an immediate resend caused by editing is labeled Edited announcement. Labels describe why this notification is being delivered.

## Smart nudge behavior and concise previews

Verify smart nudges reach eligible recipients who have not marked announcements read or completed their to-dos. Recheck recipient state at delivery so acknowledging or completing an item while its notification is queued removes that item from the preview, or suppresses delivery if nothing remains.

Use short action-first body text, keeping the Reminder title prefix:

| Outstanding action                 | Preview body opening                             |
| ---------------------------------- | ------------------------------------------------ |
| Acknowledge one announcement       | Read & acknowledge this announcement.            |
| Acknowledge multiple announcements | Read & acknowledge 2 announcements.              |
| Complete to-dos                    | Complete 2 pending to-dos.                       |
| Both                               | Acknowledge 2 announcements · Complete 3 to-dos. |

Use singular/plural forms as appropriate. Place the prompt before optional excerpts or custom reminder text so truncation preserves the action. Keep payment details private and retain practice time/location where applicable. Mixed practice bundles must include a concise outstanding-action prompt rather than only “More reminders in your Today plan.” Do not ask users to acknowledge preparation reminders or already-read announcements whose reminder is tied to an incomplete task; those should prompt the actual remaining action instead.

Code inspection finding: current announcement nudges require an author-configured reminder time; acknowledgment mode checks the recipient's completion/read state. They are not automatic reminders for every unread announcement. Task nudges currently use due-date stages around the due date, not every incomplete task indefinitely. The proposed fallback policy below closes these gaps without claiming that the current system already covers them.

Verification must cover unread versus acknowledged recipients, individual and shared task completion, overdue stages, no-due-date tasks, announcements without configured reminders, linked-task versus preparation modes, and mixed bundles. Preserve quiet hours, daily caps and deduplication. Check hosted enablement/pilot scope, scheduler health and delivery outcomes read-only when access is available; report local test evidence separately from hosted delivery and physical-device preview verification. Preview length varies by device, so verify the action remains visible on a collapsed phone notification rather than promising all text always fits.

## Implementation

1. Add the next migration (currently 0019_notification_preview_labels.sql); preserve existing applied migrations. Update the current definitions of `push_prepare_delivery` and `nudge_payload` from migration 0015. Apply prefixes after existing preview assembly, once per delivery, including already-pending jobs and retries.
2. Identify reminders using structured job source/event keys and nudge occurrences, covering standalone author reminders, practice reminders, mixed bundles and legacy task/payment reminders. Do not infer type from message wording.
3. Identify edited-announcement jobs from the `communication:<audit ID>` event key and its matching `communication_audit` action, verifying that the audit record belongs to the announcement. Do not use the post's current version: an original publication job can still be pending after an edit. Preserve existing no-op suppression.
4. Handle practice-linked edits explicitly: retain the shared reminder deduplication for new publications, but let an actual edit-triggered alert carry its Edited announcement label instead of being silently absorbed into a pending practice reminder. Scheduled practice alerts remain labeled Reminder. Cover this case with a regression test.
5. Preserve access/lease/expiry checks, recipient filtering, reminder stop conditions, quiet hours, quotas, deep links and stable tags. Do not replay sent jobs or modify notification timing merely to add labels.
6. Update `docs/notifications.md` and the Genesis notification checkpoint/wiki with final behavior and rollout evidence.

## Verification and rollout

- Extend SQL integration tests in `tests/push-database.test.ts`, `tests/nudges-database.test.ts` and `tests/practice-database.test.ts` (or a focused migration test suite) to cover creation versus edit, pending creation after edit, repeated edits/retries, no-op saves, standalone/mixed/legacy reminders, practice-linked edits, unauthorized/expired sources and unchanged deep links.
- Run focused suites, then `npm run check` and formatting checks for changed files. Complete the project's fresh-context implementation review.
- Apply the migration during implementation rollout. No new credentials or scheduler settings are expected.
- Verify real collapsed/Lock Screen previews and tap destinations using an authorized test recipient; local tests cannot prove device rendering. Do not send a team-wide test notification.

## Workflow routing

Existing-system extension; no AI product component; existing database-to-Web-Push boundary and recipient privacy controls; planning for backend payload behavior. Skills considered: coding-orchestrator, agentic-swe-master, blueprint/writing-plans, design-system. Chose project coding-orchestrator and agentic-swe-master; planning skills were not found in the searched installed/supporting skill roots. No frontend layout change is needed. This document is a plan, not a completed BUILD or verification milestone.

## Execution sequence

### 1. Establish the baseline

- Read the latest migration chain through 0018 and the current notification checkpoint. Trace `push_enqueue_reminders` → `nudge_enqueue` → `nudge_valid` → `nudge_payload` → `push_prepare_delivery` → worker → service worker.
- Confirm the authoritative Mark as read field and individual/shared task completion rules using save RPCs, not just UI labels. Determine whether announcement edits currently preserve acknowledgment; preserve that behavior for this change.
- Run existing notification SQL and worker tests before changes. Existing `nudges-database.test.ts` loads only through 0013; add a focused suite that loads the complete migration chain, so later practice/custom-practice overrides are exercised.
- Record current local behavior separately from read-only hosted observations: rollout flag/pilot membership, scheduler HTTP outcomes, aggregate queue age/errors, and subscription eligibility. Historical activation evidence is not proof of current delivery.

### 2. Adopt this proposed fallback schedule

All times are America/Chicago. A fallback is one daily bundle opportunity per recipient, not a separate notification per item.

| Item                         | Proposed fallback eligibility                                                              | Stop condition                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Unread ordinary announcement | Daily at 6 PM, at least 24 hours after publication, while published within the last 7 days | Marked read, recipient removed, expired/deleted, or older than 7 days                 |
| Task without a deadline      | Daily at 6 PM once at least 24 hours old                                                   | Recipient/shared completion, recipient removed, or expired/deleted                    |
| Overdue task                 | Daily at 6 PM starting after the existing day-after-due stage                              | Same task stop conditions                                                             |
| Task with a future deadline  | Existing day-before, due-day and day-after stages                                          | Same task stop conditions                                                             |
| Practice-linked announcement | Existing occurrence-linked practice reminder                                               | Existing cancellation/start/freshness rules; no generic daily fallback after practice |

- Retain optional author reminders and their preparation/acknowledgment/linked-task semantics. An unread acknowledgment fallback is a separate reason for delivery; it must never convert a preparation or linked-task reminder into a false acknowledgment request.
- Avoid fallback for a member/item on a local day that already has an eligible scheduled author/due-date reminder or a pending/in-flight/provider-accepted reminder for that item. Deduplicate overlapping fallback and scheduled candidates before bundling. Scheduled reminders keep their current priority.
- Acknowledge that an explicit future author reminder can coexist with a fallback on an earlier day: the author reminder still fires on its selected day if its own stop condition remains unmet.
- Eligible fallbacks enter the existing five-minute bundle and three-bundle-per-member-per-day cap. If slots are exhausted, skip that day's fallback; reconsider current state the following day. Do not replay missed days after downtime. Daily fallback windows end at 10 PM.
- New item edits do not reset age or create an extra daily fallback. Reopening a task makes it eligible at its next valid opportunity; it does not bypass same-day deduplication. Recipients newly added to an old item follow the item's age and normal immediate-update behavior; do not infer a new publication time.
- Existing unread announcements older than seven days remain accessible but do not suddenly trigger a backlog of notifications. Existing incomplete undated/overdue tasks can join the next daily bundle after activation.

### 3. Implement durable scheduling and state validation

- Use the next additive migration for private fallback rollout control (disabled initially, with optional test-member scope), any required occurrence-stage constraint changes, and updated functions. Keep fallback rollout separate from the already-enabled smart-nudge control so a pilot does not disable existing team reminders.
- Add explicit fallback stages, for example `unread-follow-up` and `incomplete-follow-up`. Use unique member/source/stage/Chicago-date keys. Ordinary text edits must not change these keys.
- Store enough source identity to invalidate obsolete due-date/reminder revisions, while recognizing fallback stages independently of `reminder_at`. Current announcement validity requires configured reminder settings; simply inserting fallback rows would otherwise fail validation.
- Add fallback candidates before quota reservation and bundle creation in the current `nudge_enqueue`, preserving Google and custom practice scheduling. Keep task/announcement source kinds so deletion cleanup remains compatible, and test that compatibility explicitly.
- Recheck rollout eligibility, membership, recipients, read/completion state, item age, deadline, expiration, practice association and source revision both when generating candidates and immediately before delivery.
- Reuse advisory locks, occurrence uniqueness, transactional quotas, fenced job leases and existing retry behavior. Apply least-privilege grants to new helpers. Add indexes only if the new candidate queries need them based on query inspection.

### 4. Implement final preview assembly

- Classify immediate announcement notifications by the originating audit event; classify scheduled notifications by occurrence stage/source. Never classify using title text, current post version, or a substring in the body.
- Add exactly one Reminder prefix at final assembly for all reminder paths. Use `Edited announcement: <title>` for edit-triggered announcement jobs. Keep ordinary publication titles as they are.
- Build action counts from currently valid occurrences, deduplicated by actual action target. A task and its linked-announcement reminder must not inflate the count of tasks to complete.
- For an acknowledgment nudge, lead with `Read & acknowledge this announcement.`; for multiple items, use counted wording. The existing Mark as read button is the acknowledgment action; opening the page alone does not complete it. No UI rename is needed.
- For task nudges, lead with `Complete 1 pending to-do.` or its plural. For linked-task reminders, prompt task completion and retain an authorized destination that exposes the linked action. Preparation reminders use the configured preparation instruction, not acknowledgment wording.
- For mixed bundles, lead with a compact action summary such as `Acknowledge 2 announcements · Complete 3 to-dos.` Use generic payment wording and preserve practice details after the short action summary where space allows. Multiple targets open Today; single-target reminders retain a protected relevant detail link.
- Target at most 100 characters for the primary action summary and retain the existing 240-character body ceiling. With additional categories, shorten optional excerpts first. Prefix/title truncation must preserve the notification type. Actual visible space is device-dependent.
- Resolve the practice-linked edit merge as described above: an edit-triggered alert remains identifiable even if a shared practice reminder is pending. Do not replay previously sent notifications to apply new copy.

### 5. Verify with a complete migration-chain regression suite

| Area               | Required evidence                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Label correctness  | New post, actual edit, no-op save, queued creation followed by edit, repeated edits, retries and practice-linked edit                                  |
| Announcement state | Unread recipient receives nudge; another recipient who marked read does not; page open alone is insufficient; queued acknowledgment removes the action |
| Automatic fallback | No configured reminder, 24-hour boundary, 7-day cutoff, 6 PM/10 PM boundary, existing old items, configured reminder collision                         |
| Task state         | Individual/shared completion, undated task, overdue continuation, future deadline, changed deadline, reopening, queued completion                      |
| Reminder modes     | Acknowledgment, preparation, linked-task and task/linked-announcement action deduplication                                                             |
| Bundles and limits | Single/mixed/practice bundles, counts rebuilt before send, empty bundle suppressed, three-slot cap, multiple devices, repeated scheduler runs          |
| Time and recovery  | Chicago daylight-saving dates, outages without replay, next-day eligibility, expired job/provider TTL                                                  |
| Access and cleanup | Removed recipient, deactivated member, disabled subscription, deleted/expired item, private helper/table permissions                                   |
| Rollout            | Fallback disabled, pilot member only, existing nudges still active for everyone else, fallback pause invalidates queued fallback-only delivery         |

- Run `npm test -- tests/notification-preview-database.test.ts tests/nudges-database.test.ts tests/practice-database.test.ts tests/push-database.test.ts` after creating the focused suite; include the discovered worker suite in the targeted run.
- Run `npm run check` and `npm run format:check`. Resolve failures attributable to the change; record unrelated baseline failures explicitly.
- Complete a fresh-context review against these acceptance criteria and project invariants. PGlite serializes queries, so do not claim it proves hosted concurrent scheduling; inspect locking/uniqueness and verify hosted contention only in an isolated test environment if available.

### 6. Roll out and observe

1. Prepare the reviewed migration and release notes with the exact copy and fallback cadence. Preserve a recovery point and prepare a forward repair for payload functions if needed.
2. Apply the migration with new fallback scheduling disabled. Existing reminder/edit previews pick up the new wording at send time; already-sent jobs remain untouched. Deploy application changes only if implementation requires them.
3. Inspect production scheduler responses and aggregate processing errors read-only. Do not expose subscription endpoints, secrets or message bodies in logs.
4. Enable fallback only for an authorized test recipient through the separate fallback control. Use authorized test records for unread/read and incomplete/complete cases, including a mixed bundle. Verify provider acceptance, actual phone display and protected taps separately.
5. Activate fallback for the team as an explicit rollout step once the proposed schedule and implementation are accepted. Watch aggregate bundle volume, queue age, failed/retried jobs and cap suppression through at least one 6 PM window.
6. If fallback behavior is wrong, disable only the new fallback control; pending fallback actions must fail send-time validation. Existing scheduled nudges and immediate notifications continue. Correct preview-only problems with a forward migration; do not drop ledgers or restore deleted records.

### 7. Completion criteria

The work is complete when labels and action prompts pass the full-chain tests; configured and automatic nudges follow the documented policy; read/completed/ineligible items are excluded at send time; quota/deduplication/privacy rules are preserved; independent review passes; and deployment evidence is recorded. Mark physical-device or hosted checks pending if they have not actually been performed. Update `docs/notifications.md`, `docs/digest-nudges.md`, `.genesis/wiki/notifications.md` and the feature checkpoint with final policy, evidence and limitations.

## Execution evidence · 2026-10-22

- Full check passes393tests/43suites, typecheck,lint,productionbuild; independent reviewer APPROVE with31/31focused full-chain SQL tests. Changed TS/docs formatting passes; repository-wide formatter finds only the pre-existing practice-announcements.md issue.
  -0019 applied live; all8function hashes match reviewed migration. Existing smart nudges and new daily fallbacks are enabled for the team. Scheduler active every5minutes; last5observed HTTP responses200 without timeouts.
- User-authorized one-person test to pradyumnagnoor@tamu.edu: one private announcement, one captured recipient, one Apple Push subscription;2publication/edit jobs and1smart reminder accepted on first attempt. Test expires tonight. After an initial delay, the user confirmed all three notifications arrived. Team fallback activation was then applied and verified (enabled=true, no pilot restriction). The first6PMdaily window and exact visual/tap details have not been independently observed.
