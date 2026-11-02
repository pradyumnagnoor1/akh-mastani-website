# Owner expense self-approval
## G0 · 2026-11-02
Existing review UI and SQL exclude creators and submitters. PARTIAL extension; latest user request explicitly supersedes old owner self-approval prohibition. Verified permanent budget_owners membership remains the identity authority; no new role grants. Scope: Budget review predicate/UI, additive migration, tests, governance/docs. Skills considered: router, security-engineering, modular-architecture, design-system, production-readiness; chose these for permission change. Check full suite/build and desktop/mobile Budget, then independent L4 review.

## Verification
- Server-derived owner role alone bypasses creator/submitter self-review restriction; no role grants or client role claims accepted. UI queue and review buttons share one predicate. Audit, balance and stale revision checks unchanged.
- Independent L4 APPROVE; full check passed 450 tests, typecheck/lint/build. Migration0028 not applied to production by this session.
- Standing delegated review: owner exception is an explicit user policy change, not a Captain/Finance privilege; replay remains rejected; no existing expense is approved automatically.
- Desktop/mobile Budget browser flows pass, including owner review of their own recorded expense. Production app release authorized by ongoing user request; database activation requires applying supplied migration0028.
