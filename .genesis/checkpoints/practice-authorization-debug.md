# Practice publication authorization debug · 2026-10-28

Scope: existing incident, conventional app; browser/server/Google/Supabase boundaries; authenticated team data. Reuse announcement action, trusted calendar adapter and fixture database. No production test posts or notifications.

Skills considered: coding-orchestrator, agentic-swe-master, detective, design-system; chose router/master/detective plus design-system for recovery feedback. Source copies read from project and relocated Desktop/Projects kits.

Suspects: stale snapshot despite refresh (high); selection identity mismatch (medium); client selection crash (low). Existing desktop/mobile practice publication passes. User confirms failure occurs on Publish. Existing stale-cache fix commit has successful Vercel deployment. Read-only check of existing connection confirms matching OAuth client but Google token endpoint returns HTTP 400 invalid_grant. Direct service-role snapshot read correctly denied by table grants.

Outcome: reproduce rejected Google authorization in isolated browser test, stop misleading practice-unavailable error, preserve draft and give actionable reconnect guidance. Keep SQL source/freshness/permission checks. Freeze: communication action/types/form feedback, test fixtures and regression tests, this checkpoint. Verify focused browser desktop/mobile regression, action/calendar tests, full check, independent fresh-context L4.

## Evidence and repair
- User confirmed exact error after Publish: “Practice unavailable. Refresh the calendar and choose a practice”.
- Read-only live OAuth verification: existing saved connection/client match, token endpoint HTTP 400 `invalid_grant`. No token values logged. Live snapshot table denies service reads as designed; no permissions changed.
- Isolated browser fixture ages snapshot, returns Google `invalid_grant`, executes real SQL validation, and reproduced the exact P0001 message. Action regression failed on old misleading text before repair.
- Action now interprets returned calendar health only when SQL rejects a practice. Expired/disconnected authorization gets actionable admin recovery; refreshing/transient failures get retry guidance. Healthy missing/deleted event validation remains authoritative.
- Admin reconnect link opens separate tab. Reconnection changes fingerprint; returned updated choices force explicit reselection while preserving draft. Latest trusted choices persist across unrelated validation errors. Never automatically substitute the submitted source or weaken SQL guards.
- Independent review initially rejected two draft recovery gaps (source change and unrelated-error state loss); both repaired. Final fresh-context L4 APPROVE; reviewer independently passed 12 action tests and diff check.
- `npm run check` passed: 403 tests/43 suites, typecheck/lint/build. After final client state preservation adjustment, typecheck/lint passed again. Final six desktop/mobile Google/custom/reconnect browser tests passed, including subsequent unrelated validation failure; desktop/mobile recovery screenshots inspected.
- Framework dev startup repeatedly reported an existing Next.js security advisory and required retry; security upgrade is outside this repair. No dependency changes.
- Live restoration requires owner/admin Google reauthorization. User has been given the reconnect page; completion not yet confirmed. Code changes are local, not deployed. No migration required.
