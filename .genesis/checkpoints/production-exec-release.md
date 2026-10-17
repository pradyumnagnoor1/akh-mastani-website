# Production exec/practice release · 2026-10-16

## G0
- User explicitly requests production deployment of the completed testing feature chain. Existing production main48c2ec5 is an ancestor of preview3a0b35a; fetched origin and found no divergent main commits. Source unchanged since approved354-test/check/build run and desktop/mobile tag flows.
- Skills considered/chosen: coding-orchestrator + production-readiness. Scope: release notes/branch fast-forward, production-environment Vercel build/deployment, public health/sign-in checks. No additional app changes.
-0014–0017 already applied to the shared Supabase and independently reviewed; two explicitly requested AO/Hospitality assignments verified. No data migration or role reassignment required during release.
- Previous production rollback artifact: dpl_Hn3fi9VJctXiZ9nVZpDxKxTBEdxn / akh-mastani-jj4f3xbby-pradyumn-agnoors-projects.vercel.app. Existing legacy RPC compatibility retained. Do not roll back schema or delete team data for a frontend rollback.
- Acceptance: main fast-forward to approved source, new build uses production settings, Vercel READY with canonical production alias, /api/health200 and sign-in rendering verified. Authenticated live CRUD/physical push remain separate acceptance, no synthetic posts or notifications.
- Release c4f9cad fast-forwarded/pushed to main. Production-environment build READY: dpl_5D1tyYmV9Nj6uwF3pvYunE2LDXM1, akh-mastani-ihjxsunj9-pradyumn-agnoors-projects.vercel.app, aliased https://akh-mastani.vercel.app.
- Public smoke: health HTTP200 with {status:ok}; login HTTP200 with Google sign-in; anonymous calendar response contains framework redirect to /login (streamed HTTP200). Production build passed, and src/schema/tests/config match approved3a0b35a exactly. No synthetic live messages/notifications, data changes or configuration changes during release.
- Complete: production deployment and public smoke checks. Existing M7 authenticated two-account/physical push/restore acceptance remains separate.
