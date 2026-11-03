# Faster page navigation
## G0 · 2026-11-03
PARTIAL: existing navigation feedback, dynamic server pages, request-scoped React cache, calendar snapshot and private RLS reused. User prioritizes speed and explicitly asks caching/preloading. Inspected identity, budget, Home and navigation code, installed Next docs for staleTimes and prefetching. Skills: project router, master/security/modular/production workflow and Postman API guidance for authenticated reads. No new external provider or API contract.
## Plan and boundaries
Enable30-second private in-memory router reuse (both dynamic and full-prefetch lifetime), full preload four common navigation destinations, intent preloading other AppLinks with explicit false respected. Existing PageRefresh handles polling, focus and pull-to-refresh with draft protection; do not duplicate. Authentication still fresh per server request, role/membership reads parallel, Budget reuses that same request's permission result. Budget reads run together. Home heading streams before digest finishes. No shared cache of private data, no persistent offline data, no DB changes. Saves retain revalidatePath and database permission/version checks.
## Verification
Full check, auth failure/parallel read tests, production-mode desktop/mobile cache/prefetch and save-refresh tests, Budget browser regression, independent L4 review. Benchmark must distinguish synthetic local fixture from real production latency.

## Results
Independent L4 APPROVE.463unit/SQL tests, typecheck/lint/build pass.56production-mode desktop/mobile cache, prefetch and save/retry/concurrency browser checks pass. Cached navigation about50–70ms with zero destination RSC requests in local synthetic fixture; not a production latency promise. Fixed mobile action bar focus-dependent position jump discovered by production tests. Existing PageRefresh handles freshness and dirty forms. No migration required.
