# Announcement save debug · 2026-10-11

## G0
- Existing communication/media implementation found; reuse rather than rebuild. Read CURRENT, PLAN/DONE, adapters/loops, wiki index/communication/architecture/operations and implementation notes.
- Scope: production incident, no AI, Next.js→Supabase boundaries and admin/recipient access. Phase10/12.
- Skills considered/chosen: project coding-orchestrator, master, detective, modular-architecture, production-readiness; diagnose before fixing.
- Symptom: image-bearing new announcement produces generic uncertain-save feedback.
- Suspects: draft ID changes across refresh (medium), missing/abandoned upload (medium), database/Storage policy or migration mismatch (medium).
- Live evidence: Postgres raises 'Image unavailable. Choose it again' inside save_communication_media. Latest uploads pending/validated, and no new post committed. Draft preserved in browser.
- Next: distinguish missing object/identity mismatch; reproduce locally and implement proportional regression. Permitted scope src/features/communication, src/components/communication*, tests, docs and checkpoints. Verify focused browser/SQL plus typecheck/test/lint; fresh-context review at exit.

## Root cause and regression
- Hosted recent reservations were validated/pending and actual Storage objects exist; save RPC owned by postgres with BYPASSRLS. Missing migration/object/permission hypotheses ruled out for these uploads.
- Server-generated crypto.randomUUID in CommunicationEditor changed on mounted server refresh while upload path remained in client state. Forced real RSC refresh reproduces exact P0001 image rejection locally. Ordinary dirty-form polling remained protected (baseline passed); session-cookie updates are another documented server rerender trigger, but actual hosted rerender trigger was not captured.
- Fix: capture new draft UUID once in client state, use post.id for existing edits, and use the same effective ID for reservation/publish. Existing security/transaction checks unchanged. Known image rejection has specific reselect guidance; network ambiguity still advises checking before retry.
- G4: npm test268/268, typecheck, lint, build, format:check all exit0. Before fix refreshed image publish failed; after fix2focused desktop/mobile passes and20affected communication/refresh desktop/mobile passes. Expected aborted-stream logs occurred in deliberate offline/visibility tests. Mobile image screenshot visually inspected.
- G5: fresh-context review_announcement APPROVE; independent52focused policy/SQL/action tests passed, no blocking findings.
- Prior delegated quiz policy is recorded in images-expiration checkpoint; answers here are assistant-delegated, not human-understanding evidence:
  1. Reservation and publishing share a mounted UUID because SQL binds each private upload to one post; changing UUID rejects it atomically.
  2. Expired pending images reject the whole save with reselect guidance; no post, audit or recipient changes commit. Message remains in form. Network ambiguity still needs inspection before retry.
  3. post.id is authoritative on edits; only unsaved draft IDs are captured once. No schema/policy change required.
- Local fix verified; Vercel code deployment and hosted retry remain pending. Original live draft untouched and unsubmitted. No production record modifications or test announcement publication performed.
