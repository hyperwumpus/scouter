# Scouter Business deployment

The Node app is the working version. GitHub stores its code. GitHub Pages and Firebase Hosting can serve `public/`, but cannot run `server/main.mjs` by themselves. Publishing only those assets does not publish working scans or reports.

## Firebase

Use your Google account to create a Firebase project. Firebase Hosting can serve the icon-equipped frontend with HTTPS. The Spark plan supports static hosting within its quotas. A full deployment also needs a private API backend; Firebase's Cloud Run / Cloud Functions integration requires billing-enabled Blaze. Obtain approval before enabling billing or deploying paid services. Never put the Places key in public files or commit a local database.

`firebase.json` prepares the frontend assets only. It intentionally does not pretend to provide an API server. Do not demonstrate it as the complete hosted application until the backend and access controls are configured and verified.

## App installation

Once served through a working HTTPS origin with the API connected, open Scouter in Safari on iPhone, choose Share → Add to Home Screen, and open its icon. Android Chrome offers Install / Add to Home screen. This is an installable web app, not an App Store submission. Scans and reports require an internet connection; the service worker caches only app assets, not keys, API responses, or reports.

## Local

Node 24+, `npm start`, then http://127.0.0.1:4319. Set GOOGLE_PLACES_API_KEY or enter a key locally. Source contains no credentials. npm test runs automated checks.
