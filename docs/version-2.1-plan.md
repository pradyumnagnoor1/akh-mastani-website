# Version 2.1 — Practices, pinned communication, and release updates

Status: proposed plan, November 4, 2026. No application or database changes made.

## Workflow and existing behavior

Existing-system extension; no AI features; existing Next.js/Supabase/Google network boundaries; member audiences and management permissions remain trust boundaries. Current phase: product and architecture planning. Follow Genesis implementation and independent verification when implementation begins.

Skills considered: coding-orchestrator, agentic-swe-master, design-system, writing-plans. Chose the project router/design skills and the master at `/Users/prady/Desktop/Projects/agentic-swe-kit/skills/orchestrator/agentic-swe-master/SKILL.md` for repository-grounded planning. Existing Genesis milestone structure supplies decomposition.

The app already creates custom practices inside practice announcements. However, `calendarData` merges Google and custom events, Home consumes that schedule, and reminders refresh Google. The form still selects existing Google occurrences. Featured events participate in the date-filtered schedule. Communication records have neither pin nor task-priority fields. Mobile navigation currently labels Announcements as “Updates.”

## 1. Reference calendar and website practices

- Keep Practice Calendar as a reference page, with active upcoming featured events in a dedicated top section, above date controls and the Google schedule. The featured section stays visible regardless of selected date. “Pinned” means ordered at the top, not a sticky panel covering mobile content.
- Keep the existing authenticated Google calendar connection and read-only reference display, including freshness/error states and an open-in-Google link. No new Google provider or calendar writes.
- Google events do not populate Today, Next practices, action digests, or practice reminders. Failure to connect to Google must not block posting a practice or viewing website events.
- The announcement composer defaults to **General announcement**: write the announcement, select its audience, and publish without an event.
- Choosing **Practice announcement** changes the flow to **create a practice event and include its announcement**. Enter the practice title, date, start/end time, and location in Central time, then write the announcement for that practice and select its audience. Present these as one event-first form with one publish action; reuse existing custom-practice functionality internally.
- Remove Google-event selection and linking entirely from announcement creation and editing. A practice announcement creates its own website practice event; users do not select or attach an existing Google occurrence. General announcements do not create events.
- Save the practice event and its included announcement together, with retry protection. Neither half is published if the other fails. Show the included announcement on Announcements with its practice details; its website event can appear in Today/Next practices and have reminders. Featured events retain their existing Home eligibility.
- Confirmed visibility rule: all active members can view practice event details, including targeted practices. Announcement text and reminders retain their selected audience. Inactive accounts cannot read practice records.
- Manage a newly created practice event and its included announcement as one unit. Editing practice details or announcement text uses the same event-first form; time changes update Home and pending reminders. Deleting that practice announcement removes the owned event and associated jobs as well, with the effect stated in the delete confirmation. Do not offer a detach/link workflow. Preserve existing deletion rules for unrelated records.
- Existing Google-linked announcements keep their text, recipients, read state, and last-known practice details as historical information. Do not silently turn every Google occurrence into a live website event or replay reminders. Existing standalone custom practices remain; reconcile shared custom events before applying new ownership/deletion behavior.

## 2. Pins and task importance

- Interpret the request as pinning announcement posts on Announcements and task posts on To-Dos; do not duplicate announcements into the task list.
- Existing authorized communication managers can pin/unpin. Pins apply to the post’s existing audience and never broaden visibility.
- Show a labeled Pinned section before the normal list without duplicate cards. Order pins newest-pinned first, with a stable tie-breaker. Reading an announcement does not unpin it. Completed tasks move out of active pins; expired/deleted records never remain visible.
- Add one priority field to tasks: Low, Normal (default), High, Urgent. Use text plus accessible color/icon badges; leave due dates and overdue status independent.
- Within the ordinary active task list, order by priority, then earliest due date, then a stable tie-breaker. Add a priority filter. Carry priority into task detail, linked-task creation, and Home task presentation while retaining existing audience/completion behavior.
- Pinning or changing priority alone does not send a new notification blast.

## 3. Updates pages and versioning

Assumption: “Updates” means website release notes, rather than another team-announcement feed.

- `/updates`: all active members, including admins, see member-facing release notes.
- `/admin/updates`: a separate management-protected page for admin workflow changes. Use the established management permission policy; ordinary members cannot retrieve its content through routes or underlying data.
- Start at **v2.1**, newest release first, showing release date, summary, new features, improvements, and fixes. Publish the release date only when shipped.
- Keep release entries in version-controlled content initially; no separate publishing CMS in this scope. Load admin-only entries server-side after authorization.
- Add Updates to the full navigation and Admin Updates to management navigation. Rename the current mobile “Updates” shortcut to “Announcements” so both destinations are distinct.
- Set package version to `2.1.0` at implementation/release and display `v2.1` consistently. Do not invent historical release notes.

## Implementation slices and verification

1. **Separate reference and operational schedules.** Scope: calendar/custom-practice/communication/digest/notification features, related components/routes, additive migration, exports, focused tests. Remove Google-driven operational reminders, including already queued jobs and send-time eligibility. Preserve existing posts and avoid duplicate events or replayed jobs. Demo: `npm run check` and `npm run test:e2e:team -- --grep 'calendar|communication|digest'`.
2. **Pins and priority.** Scope: communication types, protected mutations/queries, additive migration, list/detail/composer/Home components, focused tests. Verify permissions, stable sorting, completion, expiry, stale edits, and pin persistence after refresh. Demo: `npm run check` and `npm run test:e2e:communication`.
3. **Release pages and v2.1.** Scope: new update content/routes, application navigation, package metadata, documentation, route-access tests. Verify member/admin separation, direct URL denial, mobile labels, and version consistency. Demo: `npm run check` and `npm run test:e2e:team` with added Updates coverage.
4. **Release review.** Inspect desktop and narrow mobile layouts, keyboard controls, empty/error states, draft preservation, Central-time boundaries, and duplicate-submit behavior. Run an independent Genesis review of the implementation. Record local versus live validation separately; release notes must describe shipped behavior only.

Before implementation, read installed Next.js guides for affected APIs. Coordinate additive database changes with application deployment and old-client compatibility. Review existing Google/custom associations and queued notifications before any live migration. No production changes or deployment are part of this planning task.

## Acceptance scenarios

- A Google-only practice is visible in the reference calendar but absent from Today and notification queues.
- Opening the composer defaults to General announcement, and publishing it creates no event.
- Choosing Practice announcement requires practice details and its included announcement; publishing creates exactly one website event and announcement together, even while Google is unavailable.
- Announcement create/edit screens have no Google-event picker or linking controls.
- All active members can see targeted practice titles, times, and locations; announcement text and reminders retain their selected audience.
- Featured events are visible above the calendar even when browsing another date.
- Authorized pins survive refresh and retain their original audience; completed tasks and expired posts leave active pinned sections.
- Existing tasks default to Normal, with completion history unchanged.
- Members can read v2.1 member updates, but cannot retrieve admin updates.
