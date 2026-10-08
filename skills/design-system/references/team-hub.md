# AKH Mastani team hub — project-specific design contract

Apply only to the dance-team website discussed in this repository. User changes take precedence over this reference.

## Reference and navigation

The repository's `Talaash HQ.jpg` shows a dark mobile sidebar, violet accent, rounded selected navigation item, icons, and an account area. Use this as visual direction, with legible muted text and a clear selected state. Do not copy the reference team's identity or assume unseen page designs.

Approved navigation: Home, Announcements, To-Dos, Practice Calendar, Set Design, Payments, Roster, and Admin. Attendance is deferred. Exclude Benching, Dues, and Reimbursements. Use a sidebar on larger screens and a keyboard-accessible drawer on narrow screens. Profile and sign-out can live in the account menu.

Suggested starting colors: background #0B0B10, surface #171720, primary text #F5F5FA, muted text #B1B1C2, accent #9690FF with dark text on accent fills. Validate combinations in rendered states before adopting them.

## Identity and permissions

Every approved member is a dancer, including admins. Admin is an additional management permission. Admins have the same personal tasks, payments, segments, and calendar as everyone else, plus management controls.

The user is the only initial admin and will manually authorize future admins. Do not create an automatic admin-selection flow or let members select their own role. Do not infer the initial admin's identity from the first signup or a typed name.

One-time onboarding asks for the member's name and shows the verified TAMU Google email. Permanent member IDs link tasks, payments, and segments. Names are labels, not account identifiers. Preserve the agreed team membership approval policy unless the user changes it.

## Page behavior

- Home: personal tasks, relevant announcements, next practices, assigned segments, and payment status. Admins additionally see management summaries.
- Announcements: admins publish and manage messages. Members can acknowledge messages when requested.
- To-Dos: admin recipient picker supports individuals, selected people, groups/segments, and everyone. Distinguish completion required from each assignee from one shared completion. Show the recipient snapshot before creation; membership edits do not silently change historical assignments.
- Practice Calendar: display the team's Google Calendar, with its time zone, last successful update, and stale/error feedback. Schedule edits take place in Google Calendar in the agreed first release.
- Set Design: segment name, formation PDF, and assigned people. Admins add/remove segments, replace PDFs, and manage assignments. Reflect membership from the same records on the roster.
- Payments: amount, reason, due date when supplied, payment instructions, and state. Unpaid → Reported paid / Awaiting verification → Verified. Rejection returns it to unpaid with an explanation. Verification removes it from outstanding balances while preserving history. Admins issue charges and verify reports. The site tracks payments; it does not itself transfer money.
- Roster: name, TAMU email, admin/dancer label, and segments. No photos or graduation year. Member detail shows all associated information permitted for the viewer: dancers see their own private tasks/payments, admins can manage all members, other dancers see directory information only.
- Admin: management entrypoints for announcements, tasks, charges, verification, segments, membership, and calendar connection. Granting admin access remains the user's manual responsibility; exposing role management to all admins is not implicitly authorized.

## Cross-page consistency

Use one recipient picker pattern across tasks, announcements, and charges. Include clear individual/group/team selection and the number of affected members. Do not expose other dancers' balances in roster badges, tooltips, search results, or dashboard summaries visible to ordinary dancers.

Show clear PDF loading/error states and an open/download fallback. Private files require protected access; a hidden URL is not access control. Use plain status labels and explicit action names such as “Report payment” and “Verify payment.”

## User-authorized frontend refresh
Use the supplied `IMG_3739.jpeg` logo, served as `/team-logo.jpeg`, in shared branding. Keep the dark/violet palette and accessible navigation. Use concise page titles, functional instructions and explicit statuses. The landing page is a compact sign-in card; Home starts directly with personal information and admin summaries. No motivational slogans, decorative hero banners or duplicate brand taglines.

## Mobile interface extension
Preserve the dark/violet tokens and supplied logo. Use bundled Hanken Grotesk for body/form text and Barlow Condensed for major headings/branding. Form text stays at least 16px; primary touch controls are at least 44px. Keep panel borders/spacing clear and decorative treatment restrained.

At 760px and below, expose Home, To-Dos, Calendar and Updates (Announcements) in bottom navigation; More and the top menu open the complete native modal drawer. Keep desktop sidebar navigation. Nested routes select their section; logo/name link to Home. Restore the actual drawer opener on dismissal. Keep short-screen navigation internally scrollable and hide bottom tabs during field focus; reserve content/refresh feedback space above the bar. Home prioritizes personal work and schedule, with additional admin summaries and a compact roster link in membership details. See docs/mobile-ui.md for verification and deployment.
