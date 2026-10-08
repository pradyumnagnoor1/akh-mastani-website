# Page updates

Every application page uses the shared root `PageRefresh` component. While the page is visible and online, it requests fresh server-rendered data every 30 seconds. Returning to the app or reconnecting also requests an update, with a five-second cooldown to combine repeated resume events. Only one refresh runs at a time.

On a touch screen, scroll to the top, pull down on the page until the circle indicates “Release to refresh,” then release. Short pulls, sideways gestures, pinch gestures and cancelled touches do not refresh. Controls, dialogs, formation frames and independently scrolling panels keep their own gestures. Reduced-motion settings stop the spinner animation.

Updates use Next.js soft refresh and preserve unaffected client state and scroll position. Refresh pauses while a field is focused, an edited action form remains unsaved, a dialog is open, or an action is submitting. Save/reset the form or leave the page to resume. A pull during editing shows a short explanation. Roster searches are GET filters and do not count as unsaved action forms.

Practice Calendar uses the same page refresh controller. Google synchronization still follows the existing five-minute server cache and failure cooldown, with stale status retained. Pulling refresh does not bypass that upstream limit. The ten-event display limit remains unchanged.

No new environment variables, database migrations, cron jobs or notification permissions are needed. Deploy the updated code to Vercel to enable this behavior in the hosted website and Home Screen app.

Verification: `npm run test:e2e:team -- --grep refresh` exercises cross-account updates, drafts after blur, pull/cancel/completion, roster search, validation-disabled forms, offline/hidden/resume and slow-request overlap on desktop and mobile Chromium layouts. These checks do not establish physical iPhone Safari gesture behavior; test a top-of-page pull on the installed app after deployment.
