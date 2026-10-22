# Notification preview labels and outstanding-action nudges

## G0 · 2026-10-22
- PARTIAL: existing transactional push outbox, smart bundles, configured author reminders and due-date stages. Missing delivery-reason labels and automatic followups for unconfigured unread announcements/undated or long-overdue tasks.
- Read notification/communication wiki, latest checkpoint, implementation notes, full 0012–0018 function chain and approved execution plan in docs/notification-preview-labels-plan.md.
- Existing-system extension; no AI product component; database/worker/provider boundary; captured recipients, private operational ledgers and unchanged auth permissions.
- skills considered: coding-orchestrator, agentic-swe-master, modular-architecture, data-systems-engineering, production-readiness, blueprint/writing-plans, TDD, verify. Loaded project router and available master/data/production/modular skills. Optional planning/TDD skills not found in catalog/search; use behavior-focused SQL regression tests and fresh-context independent review.
- Scope: new0019 migration, notification SQL regression tests, notification docs and Genesis records. No frontend/API changes planned. No changes to applied migrations or team records. Fallback starts disabled separately from existing smart nudges.
- Verification: targeted notification suites → npm run check + format:check → independent review. Hosted/phone checks reported separately.

## Iteration 1
- Baseline: 67 tests pass in nudges/practice/push/worker suites.
- New full-chain suite initially failed because0019 was absent. First migration run passes7/8; eighth failure was an assertion counting both recipients' occurrences instead of the tested recipient. Corrected scope to member UUID; no scheduler behavior changed to satisfy the assertion.
- Implementing: daily6PM Chicago followups, independent private rollout, send-time state validation, audit-event-based edit labels and concise action prompts.
- G4/G5 pending. No live application or activation performed.

## Verification iteration 2
- Expanded full-chain regression suite31/31 passes; full `npm run check` exit0:393 tests/43 suites, typecheck/lint/production build pass. No frontend behavior changes; build-generated next-env route imports restored to baseline.
- `npm run format:check` exit1 due only to pre-existing docs/practice-announcements.md formatting. Focused Prettier check of all changed covered TS/docs exit0; unrelated file left intact.
- Independent fresh-context reviewer initially REJECTED future author ownership when source expires before reminder. Fixed source and linked target expiry checks and added regression; final APPROVE after independent31/31 rerun. Other review improvements: configured author instructions retained after action, eligible-only author day ownership, future linked-task duplicate suppression, protected single-linked-task destination.
- G4 pass for code checks; unrelated baseline format exception documented. G5 artifact APPROVE; human Q&A gate pending, no completion claim. Review questions: why separate fallback control; what happens if linked task completes after bundling; how originating audit event distinguishes edit delivery from reminder delivery.
- Hosted SQL dashboard reachable. First read-only query used nonexistent push_jobs.created_at and failed; corrected to aggregate current job status. No mutation/migration or team test send performed yet.

## Review Q&A (existing delegated review convention)
- Existing checkpoints record user-delegated Q&A; assistant answers below are engineering explanations, not evidence of new human/device acceptance.
- Separate fallback control: pilot/pause daily followups without disabling already-active configured smart reminders for teammates.
- Linked task completed after bundling: send-time nudge_valid drops the linked occurrence and task action; remaining bundle actions rebuild, or empty bundle is suppressed.
- Edit vs reminder: communication:<audit ID> plus matching source audit action identifies immediate edited alerts; occurrence/job source identifies reminders independently of the post's current version.
- Independent artifact APPROVE and explanations recorded. Hosted/physical acceptance still pending, so no full rollout completion claimed.

## Production migration and targeted acceptance
- User authorized execution of the detailed plan, then explicitly selected pradyumnagnoor@tamu.edu for the one-person phone test.
- Live baseline verified: smart rollout enabled/no pilot,34 subscriptions,338sent jobs, active five-minute cron. Last5 HTTP responses200/no timeouts. Existing retained smart occurrences show119 provider-accepted practice occurrences and1payment followup; no announcement/task smart occurrences.74outstanding active announcement-recipient rows exist (not74distinct announcements). No outstanding tasks at observation time.
- All4previous function prosrcSHA256 hashes matched0015 exactly. Preserved matching prior definitions in /tmp/notification-preview-function-baseline.sql for forward recovery. No team-data backup/export made or claimed.
- Exact24903-character0019 migration staged and compared via UI clipboard; applied to live shared Supabase, SQL success. New fallback control disabled; existing smart enabled; control private to database owner. Existing production frontend/dispatcher unchanged.
- Verified chosen recipient by exact email: verifiedactive manually assigned admin,1subscribed device. Created+edited1recipient-only test announcement172935bd-afa3-4cd8-b28f-582e1193cbd3 through authenticated save RPC. Reminder acknowledgment mode,15sec delay, expires at end of current Chicago day; exactly1captured recipient and2immediate jobs. No team-wide test audience or membership changes.
- Initial manual dispatcher fetch was sandbox-DNS blocked; reran with required network approval. Dispatch outcome/phone acceptance pending below.
- Manual production dispatch completedHTTP200/configuredtrue/sent3/retry0/expired0/failed0. Live targeted audit verifies exactly2communication jobs +1smart-nudge job, allsent/attempts1; sole registered providerweb.push.apple.com. Smart job stored titleReminder: Notification preview test and expected Read & acknowledge... action/body. All8new/replaced function prosrc hashes exactly match reviewed0019.
- User reports no phone receipt yet. Provider acceptance is NOT phone acceptance. Investigating phone-side enabled status with user; no repeated test blast. New daily fallback remains disabled until targeted acceptance. No claim of hosted concurrency verification.
- User subsequently confirms receipt of all3notifications on their phone. This establishes actual phone delivery after initial delay. Exact visual copy/tap validation was requested; receipt confirmation itself is not an explicit report of each label/tap result. No device setting change or repeat send needed.
- Proceeding with user-authorized team activation of the documented daily fallback schedule, keeping existing three-bundle cap and quiet hours. Physical display/tap specifics remain user-verifiable limitations.

- Activation applied: nudge_fallback_control enabled=true,pilot_members=null, verified returnedtrue/NULL. Existing smart remains enabled; no frontend redeploy or new scheduler needed. No further test sends. First6PMfallback window and exact visual/tap details remain unobserved. Source files saved in working tree; no Git commit/push performed.
