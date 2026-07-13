# Sol Edition Reference

## Edition boundary

Sol is the single-experience edition of Piano Atlas on `sol-edition`. The
preserved `main` branch remains the baseline with the five comparison prototypes
and Version 5 as its selected default. Sol removes the prototype switcher from
its own branch and reserves these local addresses:

| Service | URL | Purpose |
| --- | --- | --- |
| Web | <http://127.0.0.1:5186/> | Vite development app |
| API | <http://127.0.0.1:5187/> | Express data and report service |
| Health | <http://127.0.0.1:5187/api/health> | Process health check |
| Status | <http://127.0.0.1:5187/api/status> | Cache and source status |

This port pair is separate from the baseline app and its prototype ports.

## Product surface

Sol combines the locator, directory, and contribution flows into one map-first
screen:

- Map markers, list rows, and the selected detail panel stay synchronized.
- Text search covers city, venue, and country fields.
- City, access, availability, confidence, and source filters can be combined and reset together.
- Browser geolocation sorts records by straight-line distance, displays the
  browser-provided accuracy radius, and selects the nearest matching record;
  it is not walking or transit routing.
- Detail panels expose status, access, confidence, directions, and the record's
  source when available.
- Query parameters preserve active filters and the selected piano in the URL.
- Mobile users can switch between map and list while desktop users get both.
- Theme preference persists locally, and the interface includes accessible
  labels, pressed states, a skip link, dialog focus containment, and Escape close.
- The sync action asks the API to refresh from Overpass and retains cached or
  curated fallback records when the upstream service is unavailable.
- Add/report submissions cover new locations, presence confirmation, missing or
  damaged pianos, and changed access. They collect no contact details and enter
  a review queue only.

## Data contract and limitations

The bulk-ingestion source is OpenStreetMap. The Overpass query accepts
the explicit `amenity=piano` tag. Curated
seed records provide a small fallback when the API or Overpass is unavailable.

The atlas should never be described as containing "every public piano" in a
literal or guaranteed sense:

- OpenStreetMap is community-maintained and incomplete; some records may be
  missing, duplicated, stale, imprecise, private, removed, or mistagged.
- Related instrument tags are intentionally lower-confidence candidates and do
  not prove public access or current playability.
- Names, addresses, opening hours, indoor directions, access restrictions, and
  verification timestamps are optional and unevenly populated.
- The API currently caps a response at 1,000 records. The upstream refresh can
  discover more candidates than a client receives in one request.
- Fallback records are a resilience sample, not a worldwide inventory.
- Availability and condition labels are informational. Users should confirm
  venue rules and current conditions before relying on a listing.
- Geolocation remains in the browser, but nearest-first order is geometric
  distance and does not account for roads, borders, accessibility, or transit.
- Reports are stored separately and do not mutate public records automatically.

OpenStreetMap attribution must remain visible anywhere its map tiles or data are
shown. Record-level source links should remain available wherever the source is
known.

## Design evidence

These references establish the design lineage; they are evidence, not claims of
affiliation or permission to copy code or assets.

### Tavalo

- Evidence: [Awwwards: Tavalo](https://www.awwwards.com/sites/tavalo)
- Supporting element: [Awwwards: Interactive Map from Tavalo](https://www.awwwards.com/inspiration/interactive-map-tavalo)
- Recorded recognition: Awwwards Honorable Mention, April 6, 2023.
- Applied idea: a restrained green/cream visual system, a map as a designed
  product surface, illustrated cues, and warm residential-scale typography.

### Atlas Obscura

- Evidence: [22nd Annual Webby Award winners](https://www.webbyawards.com/press/press-releases/22nd-annual-webby-award-winners-announced/)
- Recorded recognition: 2018 Webby People's Voice Award for Travel websites.
- Applied idea: an atlas as an editorial discovery system, with places treated
  as individually explorable entries rather than anonymous search results.

### On the Grid

- Evidence: [Communication Arts Webpick: On the Grid](https://www.commarts.com/webpicks/on-the-grid)
- Published observation: Communication Arts describes a minimalist city guide
  that lets visitors browse places through either a map or a list.
- Applied idea: direct city browsing, numbered entries, compact place metadata,
  and a map/list relationship suited to repeated local exploration.

## Development commands

Install exactly from the lockfile and start both services:

```bash
npm ci
npm run dev
```

Start one service at a time when debugging:

```bash
npm run dev:api
npm run dev:web
```

Run repository checks:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run test:e2e
```

Serve the generated frontend locally:

```bash
npm run preview
```

The preview command serves `dist` on `127.0.0.1:5186`; it does not turn the
Express server into a production deployment.

## Production backend migration

The current backend is a development-sized Node/Express service. It binds to
loopback, reads and writes JSON under `server/cache`, fetches Overpass on demand,
and accepts reports without a production moderation system. Vite proxies `/api`
to port `5187` only during development.

Before deploying Sol:

1. Deploy the Express API as a managed process and expose it through a reverse
   proxy or gateway. Keep the browser contract at `/api/pianos`,
   `/api/pianos/:id`, `/api/reports`, `/api/health`, and `/api/status`.
2. Route same-origin `/api` requests to that service. If the frontend and API
   must use separate origins, add an environment-driven API base URL and replace
   permissive CORS with an explicit allowlist.
3. Move the piano cache and report queue to durable database or object storage;
   ephemeral container filesystems can lose both on restart or deployment.
4. Refresh and normalize Overpass data in a scheduled worker with retries,
   backoff, provenance, observability, and a last-known-good dataset. Avoid
   making public user requests responsible for expensive global refreshes.
5. Add authentication or abuse controls, rate limits, moderation state, audit
   history, and privacy/retention rules before accepting public reports.
6. Serve the built `dist` directory through static hosting, but deploy and
   monitor the API separately. A successful frontend build does not include the
   backend runtime.

Keep the fallback dataset and source attribution during migration so an upstream
outage degrades to an explicit limited mode instead of an empty map.
