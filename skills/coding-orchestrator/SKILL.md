---
name: coding-orchestrator
description: Route software implementation, debugging, and review tasks to the appropriate engineering skills in an agentic-swe-master or Genesis workflow. Use when selecting the next development step; this skill coordinates work rather than creating product features of its own.
---

# Coding Orchestrator

Use the current user request, repository instructions, and active milestone to choose the smallest useful set of skills. Keep the user's product scope and chosen stack authoritative.

## Establish the task

Read repository governance first. If a Genesis spine exists, read its current checkpoint, milestone, definition of done, and relevant wiki entries. Inspect actual source files before classifying work as unbuilt, partial, or complete. A plan is not evidence of implementation.

Use `agentic-swe-master` as the lifecycle orchestrator when available. Its AI-specific phases apply only to products with those capabilities; building a conventional web app with an AI coding assistant does not make the product an AI system.

For a new project, record the master diagnostic: scope, AI components, network boundaries, trust boundaries, and current phase. Reuse answers already established with the user.

## Route by the work being performed

| Task | Skills to load when available | Evidence needed |
|---|---|---|
| Architecture or new feature | modular-architecture; blueprint or writing-plans | Boundaries, behavior, acceptance criteria, files to change |
| Frontend or interaction | design-system | Existing visual conventions, responsive states, interaction checks |
| Authentication, authorization, private files | security-engineering; modular-architecture | Permission policy and tests that attempt forbidden operations |
| Database or transactional workflow | data-systems-engineering; production-readiness | Schema, state transitions, migration and retry behavior |
| External API integration | production-readiness; distributed-systems as needed | Authorization, timeouts, freshness, failure recovery |
| Bug or failing check | detective or systematic-debugging | Reproduction, supported cause, regression verification |
| Behavior implementation | test-driven-development when available | Behavior-focused tests proportional to the change |
| Milestone exit | verify or requesting-code-review | Artifact, criteria, affected invariants, actual check results |
| Deployment or operations | production-readiness | Configuration, rollback, monitoring, ownership and backup plan |

Load only skills needed for the current step. An auth screen may need both security and design; a text-label edit does not require a security review. Read a chosen skill's instructions before claiming it was used.

Resolve names through the session catalog and repository's documented skill paths. For Genesis, consult AGENT-ADAPTERS.md and its configured resolution order. Search for a referenced skill before declaring it absent; accept the alternatives named in the workflow. A missing optional skill does not block useful work. If a mandatory capability has no available equivalent, identify the exact requirement and missing resource instead of pretending to satisfy it.

## Execute within the active workflow

Record a short routing decision: `skills considered: [...]; chose: [...]; reason: ...` in the existing checkpoint, or the implementation plan when no checkpoint exists.

Follow the repository's build/debug/research/verify loop without creating a second competing loop. Define a concrete outcome, permitted file scope, and verification command before implementation. Execute dependent changes in order. Delegate only when the user or applicable workflow calls for it; skill routing itself is not a requirement to create multiple agents.

When the workflow requires independent verification, give a fresh reviewer the goal, acceptance criteria, artifact, and invariants. Keep the maker's reasoning out of the review brief. A self-review cannot be reported as independent approval.

Existing workflow gates remain in effect. Do not add approval gates, quizzes, token budgets, model switches, or deployment authorization merely because this router was loaded. Likewise, do not bypass an explicit gate in the workflow being followed.

## Report evidence and remaining work

Run the checks appropriate to the change and record results, including failures or checks that could not run. Do not create tests that merely assert the implementation's wording or structure. Small documentation and styling changes can use focused inspection instead of new test suites.

Distinguish local verification from live integration verification. Missing external credentials can leave deployment checks pending while local work continues. Never report a mocked authentication or calendar flow as a verified production integration.

Update the active checkpoint with what changed, what passed, and the next concrete action. Completion means the milestone's real criteria and applicable workflow gates have passed.
