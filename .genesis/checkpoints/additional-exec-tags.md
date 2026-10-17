# AO and Hospitality tags · 2026-10-16

## G0
- Existing role enum, members and announcement attribution constraints, eligibility RPC, shared role picker and displayed badges. AO/Hospitality unsupported. Extend these; no new permission categories or pages.
- Read current role checkpoint/policy/migrations and inspected named live records: exactly one active manually granted admin for each requested name, both initially without exec roles. User explicitly authorizes assigning AO to Pradyumn Agnoor and Hospitality to Rianna Roy. Use permanent IDs and expected empty roles to prevent wrong-account/stale writes; keep assignments out of schema migrations/repo.
- Skills considered: coding-orchestrator, security/data, design-system. Use existing enum/constraints/RPC and shared badges; preserve0016 caller/target eligibility, current roles, immutable announcement attribution and previews without role tags.
- Scope: enum, additive0017 allowlist/constraint extension, focused SQL/browser tests/docs, independent review; apply migration and two authorized assignments, update testing release. New tags use same exec management behavior.
- Verification: fullcheck passed354 tests/42 suites/typecheck/lint/build; AO/Hospitality desktop and mobile selector/display/posting options passed2/2. Fresh independent APPROVE;13 SQL tests passed independently. Schema/assignment readback and preview READY pending.
- Delegated quiz (assistant answers, not human evidence): tags reuse the canonical exec field and immutable posted attribution; active manual-admin eligibility remains required; two authorized assignments use permanent IDs/expected empty roles and the existing RPC, with no account-status/admin-permission changes.
