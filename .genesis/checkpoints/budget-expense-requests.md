# General exec expense requests
## G0 · 2026-11-02
Existing Add Expense submission and approval queue reused; PARTIAL extension. User changes general exec submission into prior approval for spending. Scope: role-derived request UI/nav, additive0031 wrapper/metadata, types and tests/docs. Existing privacy/approval ownership retained. Project router/design and security workflow apply; no external notifications or production financial writes.

## Implementation
- General execs submit unpaid proposals with quote/estimate support and wait-to-spend guidance; no payment-status/included controls. FML/Captains see request label and explicit authorization explanation. Approved requests show permission to proceed; later payment review separately labeled. Paid historical entries remain readable with management correction guidance.
-0031 rejects paid/included submissions and edits of payment-bearing records for execs; no client role bypass. Approval records authorization timestamp; actual payments still use manager report/review flow. Historical rows retained, no money changes on request approval.

## Verification
Independent L4 APPROVE (22 request/privacy tests independently passed); full check passes 457 tests, typecheck, lint and production build. Desktop/mobile Budget browser flows both pass. Final UI wording typecheck/lint pass. Migration0031 supplied for user application; not applied by agent.
