# Scouter — guided by Glitch

The current focused prototype is in [`scouter-glitch/`](scouter-glitch/): Business discovery, sourced customer-path reports, a first Creator materials-review mode, private lead files, reference uploads, follow-up notes, proposal PDFs, concept starters and review-only outreach drafts.

**Run:** Node.js 24+, `cd scouter-glitch`, `npm ci`, `npm start`, then http://127.0.0.1:4319. See [scope and limits](scouter-glitch/PRODUCT.md) and [publishing requirements](scouter-glitch/DEPLOYMENT.md). YouTube live access requires a valid enabled key; other creator platforms currently use supplied materials. AI briefs are copy/download handoffs. Gmail compose does not send messages or attach files.

**Privacy:** Customer files, pricing records, databases, API keys and local workspace data are not included in this repository. This source upload does not host the private server. GitHub Pages still serves the original static prototype.

---

# Earlier Scouter experiments

The earlier Scouter app is in [`scouter/`](scouter/). It includes the Opportunity Radar, Google Places and YouTube discovery, explainable website opportunity scoring, outreach drafts, a sales pipeline, quotes, payments, expenses, and an Odd Jobs episode journal.

## Run the current app

Use Node.js 24 or newer:

```bash
cd scouter
npm start
```

Open http://127.0.0.1:4317. Add your own API keys in Settings when you want to use live providers. See [the full setup guide](scouter/README.md) for provider setup, limitations, and backups.

Run tests with `npm test` from the `scouter` directory.

This version uses a local Node server and SQLite database. Pushing it to GitHub does not host that server. The GitHub Pages link below still serves the original static prototype.

API keys, the local database, and saved workspace data are excluded from this repository.

---

## Original prototype

# Local Business Scout

A browser-based prospecting tool for finding local businesses that may need a stronger web presence.

[Open the live demo](https://hyperwumpus.github.io/business-scout-app/)

## Why I built it

While designing a website concept for a local auto repair shop, I saw a repeatable problem: it takes time to identify businesses with missing or outdated websites and keep the best opportunities organized. Local Business Scout turns that manual research into a simple workflow.

The project demonstrates how I move from observation to a practical tool. It also became the foundation for a broader Scouter app concept.

## What it does

- Searches Google Places by business type and location
- Highlights businesses without a listed website
- Saves promising leads in a local sales pipeline
- Stores settings and saved prospects in the browser
- Provides quick access to business details and outreach research

## Built with

- HTML
- JavaScript
- Tailwind CSS
- Google Places API
- Browser local storage
- GitHub Pages

## Run locally

1. Download or clone this repository.
2. Serve the folder with a local web server.
3. Open the site and add your own Google Places API key.

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Project status

This is an early working prototype. Planned improvements include clearer lead scoring, export tools, stronger API-key handling, and a more complete outreach workflow.

## About the creator

Built by Misael Payan as part of the HyperWumpus portfolio: practical experiments in creative problem solving, local business tools, web design, and content creation.
