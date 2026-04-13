# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

No test framework is configured.

## Architecture

Next.js 14 App Router project with TypeScript. The entire dashboard is client-side rendered (`"use client"`) — there are no server components or API routes.

**Source layout:**
- `src/app/page.tsx` — Main dashboard (430 lines). Manages all state (position, crew, passes, trail). Polls ISS position every 5 seconds via `setInterval`. Fetches crew once on mount. Fetches pass predictions when the observer location changes.
- `src/components/MapView.tsx` — Leaflet map, dynamically imported with `{ ssr: false }`. Renders ISS marker, 80-point orbital trail, and observer location pins.
- `src/lib/iss-api.ts` — All external API calls and TypeScript types (`ISSPosition`, `CrewMember`, `ISSPass`, `Location`). Contains a custom haversine-based ISS pass prediction algorithm that samples historical positions.

**External APIs (no auth required):**
- WhereTheISS.at — live position, altitude, velocity
- corquaid.github.io — crew profiles with photos/social links (primary)
- Open Notify — crew fallback

**Key patterns:**
- `MapView` is always dynamically imported (`next/dynamic` + `ssr: false`) because Leaflet requires `window`
- The orbital trail is a fixed-size array of the last 80 positions maintained in `page.tsx`
- Observer locations (Mělník CZ, Augsburg DE) are hardcoded in `iss-api.ts` as a `Location[]` array
- Path alias `@/*` maps to `./src/*`
