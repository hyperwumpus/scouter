# Creator analytics

SCOUTER Business and Creator remain two workspaces in the existing app. LeadFlow and the production apps remain independent; no other repository is changed.

## One workflow

1. Open Creator and upload an authorized YouTube Studio content CSV. Supply its report dates, format and goal. The importer does not connect an account or send files to external services.
2. Read **What is working** and **What may be holding the creator back**. Detailed metrics are collapsed below the summary. Optional comparison settings are editable.
3. Pick one proposed experiment and save to a new or existing Creator lead file. You can also save evidence without selecting an experiment.
4. In Lead files, set deliverables, the success measure and follow-up date; explicitly mark the experiment Approved. Download the production handoff JSON or AI work brief for the separate editing/asset application.
5. After delivery, record a sourced follow-up measurement and comparability notes. Differences are observations, not causal claims.

## Import contract

English headings, UTF-8, comma-separated CSV; quoted commas, escaped quotes and multiline values are supported. Up to 700 KB and 3,000 video rows. No bundled channel data.

Required: `Video title`, `Views`.

Optional: `Content` (video ID), `Video publish time`, `Content type`, `Promotion`, `Subscribers gained`, `Subscribers`, `Watch time (hours)`, `Thumbnail impressions` / `Impressions`, `Thumbnail click-through rate (%)` / `Impressions click-through rate (%)`, `Average percentage viewed (%)`, `Stayed to watch (%)`, `Likes`, `Comments added`, `Shares`.

Use `Content type`: `Long-form`, `Short`, `Live / VOD`, `Unknown`. The form's format applies to rows without a recognized type. Do not mark a mixed-format report as a single format. Duration/title do not determine format.

Use `Promotion`: `Promoted`, `Unpromoted`, `Unknown` (Yes/No also accepted). Unknown is never labelled organic. No title signatures or channel-specific rules.

YouTube Total rows are excluded. Invalid required views reject the import; missing/invalid optional metrics remain missing with a warning. CTR is a percentage from 0 to 100; average percentage viewed may exceed 100 for looping/replayed content. Zero-view ratios remain missing.

Comparisons stay within format and promotion status. The optional defaults are 100 views, 100 thumbnail impressions and three comparable metric observations. These are screening settings, not universal success thresholds. Strengths report above-median performance. Packaging hypotheses require below-median CTR with at least median percentage viewed, for long-form only. Pacing hypotheses require below-median percentage viewed and explicitly request inspection of the actual recording/retention curve. Different duration, exposure age and traffic mix can still explain differences.

## App handoff contract

`GET /api/projects/:id/handoff` returns JSON with `schemaVersion: 1`, project ID, title, scope, proposed price, source-labelled evidence, report period, goal, selected experiment, baseline metric, production type, deliverables, success measure, review date and any results. It contains no credentials or attachments. A separate app can consume this contract later; this update provides a downloadable handoff, not a live connection to those apps.

`POST /api/creator/analytics` analyzes without saving. `POST /api/projects/:id/analytics` imports evidence with the current project `version` and optional `experimentId`. `PUT /api/projects/:id/experiment` updates the experiment with optimistic version checks. All API routes require the existing local session token.

The status path is Proposed → Approved → Delivered → Completed, with cancellation available. Approved/delivered evidence cannot be replaced mid-experiment. Replacing a proposed or finished baseline archives the previous evidence and result, downloadable from the lead. Ten archived reports per lead are supported; create another lead file thereafter. Existing lead notes, prices, files, and contact details are preserved.

## Reuse and boundaries

Adapted the content enrichment, per-1,000-view conversion, format separation, and relative packaging/retention comparisons from `hyperwumpus/youtube-analytics-toolkit/streamlit/app.py` (reviewed at 89169dac892588f57ae5eaca46679cdea5ca9314). Removed its personal title rules, bundled metrics, topic classifier, mixed-format score and unconditional channel advice. LeadFlow was inspected but no LeadFlow implementation was imported; Muse can work on that app independently.

This first integration supports YouTube content exports. Existing supplied-material profile reviews remain available for Twitch, Instagram and TikTok. It does not infer retention-curve exits, thumbnail quality, returning-viewer behavior, or revenue from absent evidence. It does not build PNGTubers or edit videos.

## Validation

Run `npm ci` and `npm test` using Node 24+. Automated checks cover parser edge cases, missing/zero data, format/promotion separation, configurable evidence gates, authentication, HTTP validation, optimistic writes, saved evidence, approval/delivery/result transitions, history and handoff exports. Existing business and workspace tests also pass.

In the implementation environment, registry downloads were blocked, so tests used the runtime's existing pdf-lib package. Browser QA was attempted but Chromium was unavailable and its download was blocked; browser layout and interactions still need a local smoke test. No live customer data, provider connection or deployment was tested.
