# Calendar connect extension
## G0 Existence Pre-Flight
- Calendar wiki/source inspected: private snapshot refresh exists; connection is manual environment refresh token. No website OAuth authorization routes or encrypted connection persistence exists. Verdict PARTIAL: extend M5 adapter.
- User explicitly requests Connect Google Calendar. Authorized scope amendment: admin connection management, new migration0006, OAuth routes/UI/docs/tests. Dancer sign-in stays separate.
- Skills considered/chosen: existing canon, security-engineering, production-readiness, design-system, TDD and independent review.
- Threats: non-admin connection changes, login-CSRF, callback replay, revoked admins, token disclosure, stale callbacks replacing newer connections. Controls: same-origin POST start/disconnect; server-only credentials; encrypted HttpOnly state cookie + state/PKCE/admin binding/10min lifetime; DB one-time attempts; current DB admin checks; connection version CAS; encrypted token, restricted RPCs and no-store redirects.
- Plan: encrypted connection+attempt schema, OAuth adapter/routes, admin form/reconnect/disconnect, adapter source integration, focused SQL/crypto/route/provider tests and browser checks, docs+fresh independent review.
- Freeze: calendar feature/routes/admin UI, migration0006, tests/docs/env/checkpoints. Local implementation only; Google setup still required.

## Verification and exit
- Red phase: OAuth test suite failed missing module before implementation. Route tests exposed immutable Response.redirect headers; changed redirect construction and tests pass. Typecheck caught test-only annotation issues; corrected. Browser expected307 for denied POST, observed303 Next redirect; now checks supported redirect and /home destination.
- Full check exit0,160 unit/SQL tests, typecheck/lint/production build pass. Format check exit0. Four desktop/mobile calendar browser flows pass, including admin-only start, PKCE redirect/cookie, cancelled consent, replay rejection, disconnect/unconfigured state and prior saved-schedule behavior.
- Mobile connection screenshot inspected; primary button updated to existing design token and long calendar IDs wrap. Independent fresh reviewer verify_calendar_connect APPROVE;19focused tests independently passed. No liveGoogle/Supabase callback performed.
- User-delegated review answers (assistantselected): encrypted browsercookie proves initiating browser/admin/verifier; one-use DBattempt stops replay. VersionCAS blocks oldcallbacks; sourceguard+connectionlock+snapshotclear fence obsolete refreshes. Required setup is migration0006, calendar OAuthclient+callback, Supabase serversecret, encryptionkey and APP_ORIGIN, testuser/publishing policy, followed by hosted validation.
- Extension COMPLETE locally; M7 live setup remains pending. No cloud deployment, realtoken, or account changes claimed.
- Final migration hardening clears the legacy snapshot at initialization and rejects missing singleton claims. Focused database suite5/5 pass; independent reviewer rechecked and APPROVE stands.
