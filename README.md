# 🛰️ ISS Tracker — Web Dashboard

A real-time ISS tracking dashboard built with Next.js, React Leaflet, and TypeScript.

![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- **Live Map** — Real-time ISS position on a dark CartoDB map with animated marker
- **Orbit Trail** — Visual trail of the last 80 ISS positions
- **Telemetry Panel** — Latitude, longitude, altitude, velocity, visibility
- **Crew Info** — All people currently in space, grouped by spacecraft
- **Pass Predictions** — Estimated ISS passes over Mělník (CZ) and Augsburg (DE)
- **Responsive** — Works on desktop and mobile
- **No API Keys** — Uses free public APIs (WhereTheISS.at + Open Notify)

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── globals.css         # Global styles + Leaflet overrides
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Main dashboard (data fetching + UI)
│   └── page.module.css     # Dashboard CSS module
├── components/
│   └── MapView.tsx         # Leaflet map (client-side only)
└── lib/
    └── iss-api.ts          # API client, types, pass estimation
```

## APIs Used

| API | Purpose | Auth |
|-----|---------|------|
| [WhereTheISS.at](https://wheretheiss.at/) | Live position, altitude, velocity | None |
| [Open Notify](http://open-notify.org/) | Crew in space | None |
| WhereTheISS.at (positions) | Pass estimation via future positions | None |

## Adding Locations

Edit `src/lib/iss-api.ts`:

```typescript
export const LOCATIONS: Record<string, Location> = {
  melnik: { name: "Mělník, CZ", lat: 50.3505, lon: 14.4742 },
  augsburg: { name: "Augsburg, DE", lat: 48.3665, lon: 10.8986 },
  // Add your city:
  berlin: { name: "Berlin, DE", lat: 52.52, lon: 13.405 },
};
```

## Deployment

```bash
# Build for production
npm run build

# Start production server
npm start
```

Deploy to Vercel, Railway, or any Node.js host:

```bash
npx vercel
```

## Tech Stack

- **Next.js 14** — App Router, Server Components
- **React Leaflet** — Interactive maps (client-side)
- **TypeScript** — Full type safety
- **CartoDB Dark Tiles** — Space-themed map style
- **DM Sans + JetBrains Mono** — Typography

## License

MIT
