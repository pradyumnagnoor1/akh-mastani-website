# Home Screen app and push notifications
## Iteration 1 — BUILD
- G0: App exists; no manifest, serviceworker, push subscription store or delivery workflow yet.
- G1: skills considered/master routing: existing extension, no AI runtime, distributed WebPush boundary, verifiedmember/privacy trust boundary; chose design-system, security-engineering, production-readiness and coding-orchestrator.
- User-authorized scope: src/**, public/**, migration0007, notification tests/fixtures, package dependencies, scripts/docs and Genesis records. Existing functionality preserved.
- Plan: installable manifest/icons; no private offline caches; optin usergesture; own device subscription; transactionally captured notifications and durable leased delivery; postmutation dispatch plus authenticated recurring scheduler; retry/expiry/deactivation handling; tests and independent review.
- Policies: target existing recipients, onlyactiveverifieddancers; generic LockScreen copy contains no names/private titles/messages or balances; no automatic permissionprompt, no massnotificationtest.
- Useful events: new/edited announcements/tasks, reopened tasks, new/payment status changes, segment assignments/PDF changes; daily due reminders and upcoming practices when scheduler runs. No completion spam.
- Gate commands: npm run check, format check, browser public/configured tests; SQL forbiddenaccess/retries/targeting plus workerunit tests. iPhone realpush verification remains device/provider setup check.
- Delivery: transaction outbox + Next after; scheduler every5minutes required for retries and timed reminders; no Hobby-incompatible built-in Vercel schedule added.

## Iteration 1 — verification and correction
- G2: 44 new behavior tests; install assets, client controls, durable SQL outbox, worker, scheduler and runbook implemented; previous160 tests preserved.
- G3: Exact token telemetry unavailable; one build iteration plus bounded review correction.
- G4: npm run check exit0 (204 tests, typecheck, lint, production build); format check exit0. 26 configured and22 public desktop/mobile flows exit0; final focused PWA6/6 and screenshot2/2 exit0. Focused44 new tests exit0.
- Visual: notification-panel screenshots inspected desktop/mobile; real SW/offline privacy tested; private content is never cached.
- G5: Initial independent REJECT: browserunsubscribe false/throw could re-register onmount. Fixed mount to read verifiedserver registration without mutations; explicitEnable only; regressiontests cover false/throw cleanup andreload. Fresh reviewer APPROVE.
- Reviewer wording corrections applied: snapshot15min graceafterfailedrefresh documented; failedbrowsercleanup instructsretryDisable.
- Runtime dependency audit: npm audit --omit=dev exit0, zero vulnerabilities. Full audit reports existing dev-only Next ESLint->braces advisory; no forced framework downgrade attempted.
- Localcredentials: npm run push:setup exit0 generated/preserved ignored.env.local pair/CRONsecret without printingsecrets. No production environment/migration/scheduler write or push blast performed.

## User-delegated quiz
Prior user delegated answer choices; answers below are assistant-selected, not evidence of human understanding.
1. Why is granted browser permission insufficient? Browserpermission mayremainafterdisable; actual delivery requires current ownedactive registration, matching device subscription and supported serverconfig.
2. What prevents stale results affecting transfers? Transfer replaces subscriptionUUID and removes oldjobs; worker operations require matching currentlease token and subscription/source eligibility.
3. Why test on a locked physicaliPhone? SyntheticChrome/SQLtransport tests cannotprove Apple's push delivery, HomeScreen installation, userpermission, Focus/LockScreen settings or deployedcredentials/scheduler.

## Exit
Locally complete with independent APPROVE and delegated Q+A. Production activation remains: migration0007, four Vercel variables, redeploy/Fluidcompute, SupabaseCron/Vault every5min, targeted realiPhone acceptance. Other M7 hosted acceptance/restore remains separate. See docs/notifications.md.
