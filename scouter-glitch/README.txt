SCOUTER / GLITCH — local working prototype

Open http://127.0.0.1:4319 while the local server is running.
To restart, double-click “Launch Scouter.command” and keep its window open.
This is a local preview, not a deployed public backend. The restored original public Scouter is unchanged.

Requires Node.js 24+. No package installation is needed. Alternatively run npm start here. The launcher reuses the existing connection on Misael’s computer when available; another computer needs its own Google Places API key, entered through Connect Google. Existing Google usage/billing still applies. No additional API subscription was added.

WORKFLOW
1. Enter business type/name and town; scan live Google Places results.
2. Review a business report: listing contact information, public homepage, and up to two linked contact pages.
3. Read each observation, possible fix and question to ask the owner. Download the text report.
4. Save a useful business, then keep your own notes/concept link. Mark a contact route tested only after you personally test it.

CHECKS IMPLEMENTED
Missing phone/website/hours fields in Google’s response; website/listing phone mismatches; relevant customer action links; social-profile links; optional second-domain comparison; website HTTP error responses; linked contact-page error responses; HTTP without HTTPS redirect; absence of a mobile viewport declaration; phone/email links and form markup in returned HTML. Errors and absent fields are provisional observations, not proven customer problems. A missing viewport needs a real phone check. Form purpose and contact-page usefulness are unverified.

BOUNDARIES
No phone calls, email or social messages are sent. Contact delivery and owner interest are never automatically verified. No lead score, fabricated findings, revenue estimates, or guaranteed sales. Additional websites can be supplied for comparison; official ownership is unverified. No automatic additional-domain discovery, browser-rendered mobile audit, performance audit, distance calculation or implementation suite. Websites may block automated access or render content in JavaScript; the report explicitly records incomplete checks.

Your key stays server-side. The server binds to this computer’s loopback interface. Only Google place IDs and your own notes/status/concept URL/contact-test flag are saved for this version. Google listing contents and reports stay in memory during use; exported reports are user-controlled files. Refresh a saved shortlist to retrieve current details. Do not upload credentials or local databases.

VERIFICATION
Ten automated tests pass: evidence extraction, honest healthy/error/missing-data reports, private-network address blocking, API write protection, revision conflicts and limited persistence. Live Google Places search for Kainoa’s returned one listing. Its homepage and linked Contact page returned HTTP 200 with no additional issues established. See DEPLOYMENT.md for publishing limits and PRODUCT.md for the Business / Creator plan.
