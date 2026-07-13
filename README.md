# Piano Atlas: Sol Edition

Sol is the standalone, map-first edition of Piano Atlas. It turns the original
prototype collection into one focused public-piano finder while keeping the
existing React, Leaflet, Express, and OpenStreetMap data boundary.

The original five-prototype application remains preserved on `main`. Sol lives
on the separate `sol-edition` branch and uses its own local ports, so it can run
alongside the baseline without replacing it.

## Run locally

Requires a current Node.js release with npm.

```bash
npm ci
npm run dev
```

- Web app: <http://127.0.0.1:5186/>
- API: <http://127.0.0.1:5187/>
- API health check: <http://127.0.0.1:5187/api/health>
- API status: <http://127.0.0.1:5187/api/status>

`npm run dev` starts both processes. To run them in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

## What Sol includes

- Full-height interactive map with clustered markers, synchronized listings, and richer detail views.
- Search by city, venue, or country, plus city, access, availability, confidence, and source filters.
- Browser geolocation with nearest-first discovery and an accuracy radius.
- Directions and source links for individual records.
- Mobile map/list switcher and responsive desktop explorer panel.
- Persisted light/dark theme, keyboard navigation, focus management, and a skip link.
- OpenStreetMap/Overpass refresh with cached or curated fallback records.
- Privacy-minimized forms for adding a piano or reporting availability, access, damage, or removal without collecting contact details.
- URL-backed filters and selected-piano state for shareable views.

## Data scope

Piano Atlas is a discovery aid, not a literally complete registry or a guarantee
that a piano is present, playable, public, or available now. Bulk records come
from the explicit OpenStreetMap `amenity=piano` tag;
coverage, names, access details, hours, and verification dates vary by place.
The current API returns at most 1,000 records per request, and the curated fallback
is intentionally a small resilience dataset. Check the linked source and venue
conditions before making a trip.

Submitted reports are saved for review. They do not automatically rewrite the
public listing data.

## Commands

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run test:e2e
```

`npm run preview` serves the built frontend on port `5186`. The Vite `/api`
proxy is a development feature, so a production-style preview needs an external
route for `/api` or it will use the bundled fallback data.

## Design references

Sol is an original implementation informed by three published references; it
does not reuse their code or visual assets.

- [Tavalo on Awwwards](https://www.awwwards.com/sites/tavalo): Awwwards records
  an Honorable Mention dated April 6, 2023 and highlights its interactive map,
  illustration, typography, and green/cream palette.
- [Atlas Obscura at the Webby Awards](https://www.webbyawards.com/press/press-releases/22nd-annual-webby-award-winners-announced/):
  Atlas Obscura received the 2018 Webby People's Voice Award for Travel websites;
  its editorial discovery model informed the atlas framing.
- [On the Grid at Communication Arts](https://www.commarts.com/webpicks/on-the-grid):
  the Webpick documents a minimalist city guide that supports both map and list
  browsing, reflected here in the synchronized explorer layout.

See [docs/sol-reference.md](docs/sol-reference.md) for the detailed edition,
data, design, and production notes.

## Production note

The Express service is currently a local backend: it binds to `127.0.0.1:5187`
and stores cache/report JSON on local disk. Writes are serialized and atomic,
but the files remain development-sized storage. Before deployment, move them to
durable storage, run refreshes as a managed job, add report moderation and
abuse controls, and route same-origin `/api` traffic to the Node service. The
static `dist` output does not include or deploy the API.
