# Save and refresh reliability

The October 2026 audit covers announcements, to-dos, Set Design segments, saved
groups, payment charges/actions, featured events, and member setup/management.

New editors retain their original UUID for the lifetime of the mounted draft.
An uploaded image reservation and its announcement therefore use the same ID
even after a server refresh. Retrying a creation after a lost committed response
uses that same ID; existing database constraints prevent a second record or batch.

Existing editors retain the revision associated with their original fields.
Incoming revisions show a conflict and disable saving while preserving the draft.
Reloading loads the latest fields and revision. Editor keys use the record ID;
revision keys would remount the editor and erase draft fields and payment notes.
Admin name corrections similarly block after an incoming name change. Member
name updates do not have database compare-and-set protection against a concurrent
correction that the browser has not yet observed.

Mutation forms carry `data-mutation-form` because client-wrapped server actions
can appear as GET forms to the browser. Dirty forms pause polling even after blur
or a rejected save. Editors prevent React's automatic reset from clearing fields,
file selections, confirmations, or that guard after recoverable failures.

Thrown transport failures return safe recovery messages. Authentication and
authorization still run before mutation recovery. Unknown save outcomes preserve
uploaded objects; deleting an attachment after an uncertain commit could damage
a successfully saved record. A failed metadata read before a segment write is
safe to retry. A message saying the save is unconfirmed still requires checking
the refreshed record before retrying: network and service failures remain possible.

Regression tests exercise mounted refreshes, concurrent editors, rejected saves,
and lost committed responses on desktop and mobile. The HTTP/database fixture and
fault-injection routes exist only in the local test server. Local verification
does not verify a Vercel deployment or physical phone behavior. Deploy the code
and verify the live save flows; this audit requires no new migration or settings.
