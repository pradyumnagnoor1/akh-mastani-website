# Version 2.1 release procedure

Implementation is local until the following release work is performed. Member/admin release notes deliberately show an upcoming release until shipment.

1. Back up the existing database and confirm migrations through0032 are applied.
2. Review0033_practice_reference.sql and0034_communication_priority.sql together with the application diff. Apply0033, then0034 before deploying the matching application. Google operational reminders are retired by0033; Google reference browsing remains available. Old clients must refresh because their Google-linking publication flow is retired.
3. Deploy the matching code through the existing Vercel project. If using CLI, install it with `npm i -g vercel`; it enables environment pulls, deployment and logs.
4. Perform hosted checks with a manager, targeted recipient and nonrecipient: general publication, practice publication with Google disconnected, Today visibility, pin/unpin, priority edit, featured events above the selected date, and member/admin Updates access. Verify queued reminder eligibility without sending a team-wide synthetic notification.
5. Set the release note date only after shipment and record the deployed commit and migration results in the Genesis checkpoint.

Database changes are additive, but restoring old code does not restore Google operational behavior or old notification jobs. A rollback must preserve the new privacy rules and avoid replaying retired jobs. Existing custom events without an announcement owner remain legacy standalone events. Payments, fund balances, member identity and task completion history are not rewritten by these migrations.
