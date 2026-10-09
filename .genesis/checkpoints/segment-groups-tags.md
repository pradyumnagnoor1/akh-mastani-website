# Segment saved groups and compact roster tags

## G0 · 2026-10-09
Existing lineup audience and roster assignment chips exist; saved-group picker/list excludes segments and chips use44px links. Verdict PARTIAL: project existing data supports behavior without duplicate DB rows. Scope communication/payment recipient pickers, saved-group list, roster tag CSS/markup, browser tests/docs/checkpoint. No migrations, copied membership or posting permission changes.
G1: project router/design skills and design reference inspected, existing master workflow applies. Plan: dynamic segment-derived groups with source-kind preserved through existing segment RPCs, editable via Set Design; compact noninteractive roster labels, member detail retains segment links. Verify group selection/lineup changes/deletion, roster narrow layout, existing recipient snapshots, typecheck/lint/build and fresh L4 review.

## BUILD / VERIFY exit · 2026-10-09
- G2: dynamic segment options in communication/payment forms, segment-derived admin groups, compact roster labels. No DB copies or migration.
- G4: npm run check exit0: typecheck/lint,266 tests/31 files, production build. format:check exit0.26 distinct affected browser flows verified across runs:22 non-segment regression flows passed initial run;4 corrected segment flows passed final desktop/mobile run. Initial new test selected shell sign-out form and failed; corrected to communication-form selector. Interrupted cleanup caused mobile fixture pollution in failed run; fresh final run passes.
- Browser evidence: creation as saved group, actual segment audience publication, original1-recipient snapshot after lineup expands2, payment selection, renamed derived list/tags, deletion disappears, tag height<28px. Desktop/mobile roster screenshots inspected.
- G5: fresh-context review_segment_groups APPROVE; independently typecheck, lint,266 tests. No blocking findings.
- Quiz (assistant answers under prior user delegation; not human comprehension evidence): (1) derive assignments to prevent copied memberships drifting; (2) published recipients/progress remain fixed; segment deletion clears source linkage while retaining published recipient snapshot; (3) savedAudience submits segment audience/raw permanent segmentUUID so existing server validation/recipient resolution applies.
- Local milestone COMPLETE. Production pending Vercel code redeploy; no SQL/environment changes. Existing M7 hosted/physical release work unchanged.
