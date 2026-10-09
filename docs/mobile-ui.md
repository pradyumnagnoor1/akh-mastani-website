# Mobile interface

The shared interface keeps the dark/violet theme and supplied team logo. Hanken Grotesk body text and Barlow Condensed headings are bundled with `next/font/local`; browsers and builds do not need a Google Fonts connection. Font files and their SIL Open Font Licenses are in `src/app/fonts/`.

On phones (760px and below), bottom tabs open Home, To-Dos, Calendar and Updates (Announcements). More opens the complete navigation drawer, including Set Design, Payments, Roster and the admin entry for authorized admins. The top menu opens the same drawer. Desktop keeps the sidebar. The logo and name link to `/home`; nested pages keep their parent section selected.

The native modal contains keyboard focus. Escape, the close button and backdrop dismiss it and restore its opener. Page links dismiss it as they navigate. The menu's links scroll within the drawer on short screens; the account/sign-out area stays accessible. Changing to a desktop width closes the drawer.

Body/form text is 16px. Primary controls and mobile tabs have at least 44px touch targets. Page padding reserves space below the bottom bar and uses safe-area insets where the browser supplies them. Tabs hide while a text field, textarea or select is focused, leaving room for editing; they return after blur. Refresh feedback appears above the bar. Draft/refresh protection remains in the existing shared refresh controller.

Home starts with personal to-dos/announcements, featured events and practices, followed by payments and additional admin summaries. Membership details include the roster count/link instead of a separate count card. All permission and data workflows are unchanged.

## Deployment and checking

Deploy the code to Vercel through the existing deployment workflow. This UI extension requires no new environment variables or database migration. Previous feature migrations still apply independently.

Run `npm run check`, `npm run format:check`, `npm run test:e2e:team` and `npm run test:e2e`. Navigation checks cover phone/desktop branding, nested selection, menu focus/close, draft preservation, width changes, 320px layouts, touch targets, dancer-only permissions and content clearance above the bottom bar. Browser screenshots cover populated screens. Chrome phone emulation is not a physical iPhone Safari/Home Screen check; verify keyboard, notch/home-indicator spacing and touch gestures there after deploying.

## Navigation responsiveness

A shared loading boundary inside the team layout lets destination pages load while the header and navigation stay available. Navigation links use Next.js-owned pending feedback until the route changes; tapping links/buttons also gives an immediate pressed state. Existing default prefetch prepares route loading shells in production. Server checks and dynamic fetching remain in place, so content and save operations can still take network time. This changes feedback and perceived responsiveness; it is not evidence of lower production server latency. No upgrade, new environment variable or migration is required. Redeploy code, reopen the installed app, and verify on the physical iPhone/network.
