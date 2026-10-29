# Identity
Every member is a dancer. Admin is an additional database permission granted manually by the project owner, never from profile metadata or first signup. Permanent auth UUID links profiles to later assignments.
Google-only verified exact @tamu.edu identities may onboard. Access states: missing name -> onboarding, pending -> approval screen, inactive -> inactive screen, active -> team pages. Non-TAMU identities cannot access data. Names are labels; duplicate names are allowed.
Preapproval by email and live setup are documented operations. Profile names can be completed once; subsequent correction requires admin. No website admin-grant UI is authorized.

2026-10-16 extension (migration0014): members.exec_roles holds any of Captain, Logistics & Finance, Production, Social. ALL roles grant full management through admin_member() and the request-session effective is_admin value. The stored is_admin flag remains manually owner-controlled; only that original permission can assign exec roles through a version-checked owner form/RPC. Every exec remains a dancer. Role badges are distinct from audience groups; no separate exec pages. Details: docs/practice-announcements.md.


Migrations0016/0017 restrict nonempty exec assignments to active members with existing manually granted admin access, and add AO/Hospitality. Shared selection collapses after save into Change exec role; pending input/cancel is disabled. Two explicitly requested assignments verified through RPC; no implicit admin grants.

Budget (migration0020) uses narrower permissions than the legacy full-admin interpretation of exec roles: any active exec can view/submit, Captains and Logistics & Finance can review another person's expense, Finance can manage balances/limits, and the verified original owner has full Budget access. These decisions are enforced in database RPCs/RLS; a visible button is not permission.
