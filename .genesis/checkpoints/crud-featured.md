# CRUD and featured calendar extension · 2026-10-07

## G0 Existence Pre-Flight
- Read wiki/index, payments, communication, notifications, calendar, architecture and current source/routes/migrations.
- PARTIAL: communication and segments/groups already create/read/update/archive; payments issue/read/verify/waive but no edit/delete; no featured events; notification payload currently generic.
- User explicitly authorizes title disclosure for announcement notifications, payment CRUD and custom featured events. Preserve permanent dancerIDs, admin-only mutations, payment verification/history, old links, read-only Google source and10Google-event cap.
- Skills considered/chosen: master/router, modular-architecture, design-system, data-systems-engineering, security-engineering, production-readiness and independent verify. Reason: additive database/schema and private financial management plus interface extension. Relevant installed Next revalidatePath guide read.
- Scope: src/**, additive migration0008, tests/fixture/config, docs and Genesis notes; no live database/hosting writes.
- Plan: explicit soft-delete communication/groups controls, payment editing of outstandingcharges and auditable deletion, featured-event CRUD with Central date/optionaltime/location/details/link and display above Google+Home preview, transactional title-bearing announcement pushes, security/version/history tests and browser flows, full quality checks/fresh reviewer.
- Payment edit invalidates an existing reported claim and requires a new dancer report; settled amount remains immutable. Delete clears balance while retaining audit and sameUUID. Roster removal remains deactivation; manually granted admin permission stays out of app.
- Verification: npm run check; focused SQL+browser then fullconfigured/public regression. M7 deployment/liveiPhone acceptance remains separate.

## BUILD and VERIFY exit
- Changes: additive migration0008 with versioned admin payment-management RPC, deleted status and before/after audit; featured-event tables/RLS/audit/adminRPCs and notification trigger; announcement title payloads and queued-job update; shared CRUD controls/routes/Home/Calendar/export integration. New editable forms retain controlled drafts and prevent automatic reset after errors; shared refresh honors canceled resets.
- G2: 8 new unit/SQL assertions/scenarios (212 total) and4 new browser scenarios in both layouts;3 new protected-route checks in both layouts. New0environment variables.
- Debug evidence: direct-RPC credential-bearing URL initially matched a host prefix before colon; authority regex tightened and security regression passed. PGlite DATE objects serialized as timestamps; fixture now emits PostgREST YYYY-MM-DD. Browser payment check captured list URL before navigation and expected a transient action message after its form unmounted; checks now wait for detail URL and stable reported status. New reminder test explicit UUID cast resolves PostgreSQL parameter deduction. No production credentials/network used.
- G4: npm run check exit0,212/212tests; typecheck/lint0 after final controlledforms; finalbuild0 andformatcheck0. Fullteam44/44 andpublic28/28 browser flows pass; finalaffectedmanagement/refresh18/18 pass after draft-preservation change. git diff --check0.
- Visual: desktop/mobile featured Calendar screenshots inspected; finalspacing adds gap before Google status. Physical hosted notification delivery remains unverified.
- G5: fresh-context /root/review_management APPROVE; independently executed8 focusedtests andtypecheck. Re-review of controlleddrafts/canceledreset approved. No blocking findings.
- Budget: within10BUILD iterations; exact token telemetry unavailable. No invented telemetry.

## Delegated workflow Q+A
Prior user authorization to choose answers used; not human comprehension evidence.
1. Why report again after an edit? The earlier report covered an earlier charge revision, so it cannot verify the corrected amount/instructions automatically. The original receipt remains in audit.
2. How does delete clear balance and retain history? Status becomes deleted; outstanding calculation includes only unpaid/reported. SameUUID and all audit events remain, including prior verification evidence.
3. What blocks direct dancer RPC calls? SECURITY DEFINER functions explicitly check current verifiedactive admin membership, lock/version-check target rows; table RLS restricts reads and direct writes are revoked. Hiding buttons is only presentation.

Local extension complete. Next: user applies0008 once after0007 before Vercel deployment, then hostedtwo-account checks andphysicaliPhone title-preview test. No liveSQL/hosting mutation performed. M7 release acceptance remains pending.
