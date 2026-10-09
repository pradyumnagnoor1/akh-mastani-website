# Migration0009 recovery

## G0 · 2026-10-09
User reports rerunning0009 fails42P07 on formation_cleanup. Inspected current migration/checkpoint and existing SQL harness; verdict PARTIAL: original0009 has nonrepeatable DDL and lacks explicit transaction. Scope:0009 recovery, SQL tests, rollout docs/checkpoint. No production execution. Plan: resumable known schema with atomic policy/trigger refresh, preserve data and deny downgrade after0010 starts. Verify actual migrations with PGlite and fresh independent review.

G1 skills considered/chosen: project coding-orchestrator and existing database foundation/master workflow; transactional idempotent recovery without restoring deleted records.

## Verification and exit
- G4 npm run check exit0:264tests/31files,typecheck,lint,build;format exit0. Additional atomic-failure rollback test verifies original FK/policy/functions survive an unsupported cleanup table shape; focused final management suite20/20passes.
- Resumable0009 keeps existing cleanup table/rows, uses create-or-replace functions, refreshes triggers/policies and wraps all changes in BEGIN/COMMIT with10-second lock timeout. Guard detects0010 table/function/either expiry column before mutation. Tests cover partial table-only setup, populated financial/live records replay, missing policy/trigger restoration, complete/partial0010 refusal and later failure rollback.
- G5 fresh independent review_0009_recovery APPROVE; independent19SQLchecks and affected lint pass. No blocker. Sequential migrations required; distinct advisory keys do not serialize different numbered migrations. Hosted schema not inspected.
- Prior user-delegated Q+A: functions/triggers/policies refresh known partial state without dropping records;0010 marker refuses early and requires rollback if transaction aborted;deleted payment history and pending cleanup are preserved while obsolete payment jobs are purged.
- Locally complete. User should copy COMPLETE updated0009 into fresh SQL Editor query, run after0008, then0010 once. If0010 already completed, skip0009. Do not drop formation_cleanup. No production action taken; M7 live rollout pending.
