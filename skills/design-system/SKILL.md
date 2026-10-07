---
name: design-system
description: Establish or extend a coherent web interface using reusable visual tokens, components, responsive layouts, and accessible interaction states. Use for frontend implementation and visual review; preserve existing branding, user requirements, and framework choices.
---

# Design System

Create a usable visual and interaction language for the requested application. Apply it through the project's existing frontend stack. This skill does not select hosting, add product pages, or require a new UI library.

## Establish the visual contract

Inspect existing screens, styles, components, and any supplied reference image. Preserve established conventions unless the user requests a redesign. Separate visible evidence from assumptions: a navigation screenshot provides layout and color direction but does not establish the behavior of unseen pages.

Read project-specific design requirements from repository governance or design documents. For the AKH Mastani team hub, read [the team-hub reference](references/team-hub.md); do not apply that reference to unrelated products.

When no system exists, choose a small initial token set for background, surface, text, muted text, border, accent, semantic statuses, spacing, typography, radius, and focus. Store these in the project's normal CSS or theme configuration. Treat initial values as adjustable design choices, not user-approved branding.

## Build reusable behavior

Prefer the project's existing components. Create shared primitives only when their repeated use warrants it: navigation, buttons, labeled inputs, dialogs, cards, lists/tables, status badges, file controls, and empty/error states.

Give each data-driven view appropriate loading, empty, populated, error/retry, and permission-denied states. Mutation controls need submitting, success, and failure behavior. Preserve entered form data on recoverable failures and prevent duplicate submissions.

Express status changes honestly. A submitted payment report is pending verification; a failed task update is not completed; cached calendar data is not a successful fresh synchronization. Keep authorization checks separate from presentation, while ensuring the UI matches the server's permissions.

## Responsive and accessible interaction

- Start with narrow screens and expand the same information hierarchy for larger screens. Avoid whole-page horizontal scrolling. Use intentional contained scrolling only where necessary, such as a PDF or genuinely wide data table.
- Use semantic links, buttons, headings, labels, and landmarks. Ensure keyboard focus is visible and controls have accessible names; placeholder text is not an input label.
- Aim for WCAG AA contrast: 4.5:1 for normal text and 3:1 for large text. Check meaningful control boundaries and focus indicators against adjacent colors. Status needs text or icons as well as color.
- Use comfortable touch targets, preferably at least 44 CSS pixels for primary controls. Keep focus within modal dialogs, support closing them, and restore focus to the opener.
- Respect reduced-motion preferences. Avoid decorative animation that interferes with reading or action feedback.
- For documents, provide an open/download alternative when inline viewing is unavailable. Show file type and an intelligible document label.

## Verify the rendered result

Use an available browser workflow to inspect representative narrow and desktop widths. Follow that browser tool's skill when required. Check actual populated and empty screens, navigation, forms, modal behavior, long names, long titles, and keyboard use.

Run the project's applicable frontend checks. Review contrast and interaction states instead of relying on visual polish alone. A successful build is not a visual verification. If browser execution is unavailable, report that limitation and the checks actually performed.

Record the chosen tokens, reusable components, and important behavior in existing project documentation. Avoid adding a separate design-system application or component gallery unless it serves the requested work.
