# Piano Atlas

React + TypeScript public-piano directory with a Node/Express API. The default
experience is Version 5, the AYLA-inspired map-first locator.

## What is included

- Searchable, filterable public-piano listing interface.
- Desktop map/list split and mobile list/map toggle.
- Dark mode with manual toggle and darkened map tiles.
- Flag icon flow for reporting a piano or adding a new one.
- OpenStreetMap/Overpass refresh path with JSON cache and seed fallback.
- Visible OSM attribution and source/confidence labels.
- Vitest unit tests, Playwright smoke tests, and production build.

## Data

The backend treats OpenStreetMap as the only bulk-ingested source. The main tag is `amenity=piano`, with lower-confidence discovery support for related piano tags. Public-piano-specific websites were used as research references, but not scraped into this project.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`. The default route opens the selected Version 5
map locator.

To compare the five design prototypes at once:

```bash
npm run dev:variants
```

- Version 1: `http://127.0.0.1:5181/`
- Version 2: `http://127.0.0.1:5182/`
- Version 3: `http://127.0.0.1:5183/`
- Version 4: `http://127.0.0.1:5184/`
- Version 5: `http://127.0.0.1:5185/`

## Prototype references

- Version 1 copies the structure of On The Grid, recognized by Awwwards as Site of the Day.
- Version 2 copies the calm travel-listing grammar of Welcome Beyond, cited by The Guardian in its best travel websites list.
- Version 3 copies the map-first guide behavior of TasteAtlas, recognized by Awwwards with an Honorable Mention.
- Version 4 copies the map/archive pattern of National Parks by Joe Lee, recognized by Awwwards with an Honorable Mention.
- Version 5 copies the illustrated destination-map pattern of AYLA Interactive Map, recognized by Awwwards as a nominee.

## Verify

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The local API runs on `http://127.0.0.1:5174/`.
