# Identity
Every member is a dancer. Admin is an additional database permission granted manually by the project owner, never from profile metadata or first signup. Permanent auth UUID links profiles to later assignments.
Google-only verified exact @tamu.edu identities may onboard. Access states: missing name -> onboarding, pending -> approval screen, inactive -> inactive screen, active -> team pages. Non-TAMU identities cannot access data. Names are labels; duplicate names are allowed.
Preapproval by email and live setup are documented operations. Profile names can be completed once; subsequent correction requires admin. No website admin-grant UI is authorized.

2026-10-16 extension (migration0014): members.exec_roles holds any of Captain, Logistics & Finance, Production, Social. ALL roles grant full management through admin_member() and the request-session effective is_admin value. The stored is_admin flag remains manually owner-controlled; only that original permission can assign exec roles through a version-checked owner form/RPC. Every exec remains a dancer. Role badges are distinct from audience groups; no separate exec pages. Details: docs/practice-announcements.md.
