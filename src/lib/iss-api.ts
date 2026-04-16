import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong,
} from "satellite.js";

// --- Types ---

export interface ISSPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: string;
  timestamp: number;
}

export interface CrewMember {
  name: string;
  craft: string;
  country: string;
  flagCode: string;
  agency: string;
  position: string;
  image: string | null;
  url: string | null;
  instagram: string | null;
  twitter: string | null;
  daysInSpace: number;
  launched: number;
}

export interface ISSPass {
  start: number;
  duration: number;
}

export interface Location {
  name: string;
  lat: number;
  lon: number;
}

// --- Predefined Locations ---

export const LOCATIONS: Record<string, Location> = {
  melnik: { name: "Mělník, CZ", lat: 50.3505, lon: 14.4742 },
  augsburg: { name: "Augsburg, DE", lat: 48.3665, lon: 10.8986 },
};

// --- API Fetchers ---

const ISS_ID = 25544;
const WHERETHEISS = "https://api.wheretheiss.at/v1";
const OPEN_NOTIFY = "http://api.open-notify.org";

export async function fetchISSPosition(): Promise<ISSPosition> {
  const res = await fetch(`${WHERETHEISS}/satellites/${ISS_ID}`);
  if (!res.ok) throw new Error(`Position API: ${res.status}`);
  const data = await res.json();
  return {
    latitude: parseFloat(data.latitude),
    longitude: parseFloat(data.longitude),
    altitude: parseFloat(data.altitude),
    velocity: parseFloat(data.velocity),
    visibility: data.visibility ?? "unknown",
    timestamp: data.timestamp,
  };
}

export async function fetchCrew(): Promise<CrewMember[]> {
  // Primary: corquaid API with rich profile data
  try {
    const res = await fetch(
      "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json"
    );
    if (res.ok) {
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.people ?? []).map((p: any) => ({
        name: p.name ?? "Unknown",
        craft: p.spacecraft ?? p.craft ?? "Unknown",
        country: p.country ?? "",
        flagCode: p.flag_code ?? "",
        agency: p.agency ?? "",
        position: p.position ?? "",
        image: p.image ?? null,
        url: p.url ?? null,
        instagram: p.instagram ?? null,
        twitter: p.twitter ?? null,
        daysInSpace: p.days_in_space ?? 0,
        launched: p.launched ?? 0,
      }));
    }
  } catch {
    // fall through to fallback
  }

  // Fallback: Open Notify (minimal data)
  const res = await fetch(`${OPEN_NOTIFY}/astros.json`);
  if (!res.ok) throw new Error(`Crew API: ${res.status}`);
  const data = await res.json();
  return (data.people ?? []).map((p: { name: string; craft: string }) => ({
    name: p.name,
    craft: p.craft,
    country: "",
    flagCode: "",
    agency: "",
    position: "",
    image: null,
    url: null,
    instagram: null,
    twitter: null,
    daysInSpace: 0,
    launched: 0,
  }));
}

// --- Haversine helper ---

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Pass Estimation ---

export async function fetchPasses(
  location: Location,
  maxPasses = 5
): Promise<ISSPass[]> {
  const now = Math.floor(Date.now() / 1000);
  const timestamps: number[] = [];
  // Sample every 60s for ~3.3 hours (200 samples)
  for (let i = 0; i < 200; i++) timestamps.push(now + i * 60);

  const positions: { ts: number; lat: number; lon: number }[] = [];

  // Batch requests (API allows up to 10 timestamps per call)
  for (let b = 0; b < timestamps.length; b += 10) {
    const batch = timestamps.slice(b, b + 10).join(",");
    try {
      const res = await fetch(
        `${WHERETHEISS}/satellites/${ISS_ID}/positions?timestamps=${batch}&units=kilometers`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const entry of data) {
        positions.push({
          ts: entry.timestamp,
          lat: entry.latitude,
          lon: entry.longitude,
        });
      }
    } catch {
      continue;
    }
  }

  // Find passes: ISS within ~800km ground distance
  const threshold = 800;
  const passes: ISSPass[] = [];
  let inPass = false;
  let passStart = 0;
  let passDur = 0;

  for (const p of positions) {
    const dist = haversine(location.lat, location.lon, p.lat, p.lon);
    if (dist <= threshold) {
      if (!inPass) {
        inPass = true;
        passStart = p.ts;
        passDur = 60;
      } else {
        passDur += 60;
      }
    } else if (inPass) {
      passes.push({ start: passStart, duration: passDur });
      inPass = false;
      if (passes.length >= maxPasses) break;
    }
  }

  if (inPass && passes.length < maxPasses) {
    passes.push({ start: passStart, duration: passDur });
  }

  return passes.slice(0, maxPasses);
}

// --- Satellite Categories (CelesTrak) ---

export interface SatellitePosition {
  name: string;
  lat: number;
  lon: number;
  alt: number;
}

export interface SatelliteCategory {
  label: string;
  color: string;
  url: string;
}

// CelesTrak does not send Access-Control-Allow-Origin headers on its
// /pub/TLE/ endpoints, so browser fetches are blocked. Route through
// corsproxy.io which adds the missing CORS header transparently.
const CORS = "https://corsproxy.io/?url=";
const TLE = (file: string) => `${CORS}https://celestrak.org/pub/TLE/${file}`;

export const SAT_CATEGORIES: Record<string, SatelliteCategory> = {
  stations: {
    label: "Space Stations",
    color: "#00e5a0",
    url: TLE("stations.txt"),
  },
  weather: {
    label: "Weather",
    color: "#ffc800",
    url: TLE("weather.txt"),
  },
  gps: {
    label: "GPS",
    color: "#00b8ff",
    url: TLE("gps-ops.txt"),
  },
  starlink: {
    label: "Starlink",
    color: "#7F77DD",
    url: TLE("starlink.txt"),
  },
};

export async function fetchSatellitePositions(
  category: SatelliteCategory,
  limit = 200,
  signal?: AbortSignal
): Promise<SatellitePosition[]> {
  const res = await fetch(category.url, { signal });
  if (!res.ok) throw new Error(`TLE fetch: ${res.status}`);

  // Stream the response and cancel early — Starlink.txt is ~1.3 MB but we
  // only need the first `limit` satellites (~3 lines × limit ≈ 60 KB).
  const lines: string[] = [];
  if (res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // We need at most limit * 3 lines (name + 2 TLE lines). Collect
    // 2× that as headroom for any malformed / skipped records.
    const lineTarget = limit * 3 * 2;

    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) lines.push(line);
        if (lines.length >= lineTarget) {
          await reader.cancel();
          break outer;
        }
      }
    }
    // Flush any remaining partial line
    if (buf.trim()) lines.push(buf.trim());
  } else {
    // Fallback for environments without streaming body (e.g. Node test runner)
    const text = await res.text();
    lines.push(...text.trim().split("\n").map((l) => l.trim()).filter(Boolean));
  }

  const now = new Date();
  const results: SatellitePosition[] = [];

  for (let i = 0; i + 2 < lines.length && results.length < limit; i += 3) {
    const name = lines[i];
    const tle1 = lines[i + 1];
    const tle2 = lines[i + 2];

    if (!tle1.startsWith("1 ") || !tle2.startsWith("2 ")) continue;

    try {
      const satrec = twoline2satrec(tle1, tle2);
      const { position } = propagate(satrec, now);
      if (!position || typeof position !== "object") continue;

      const gmst = gstime(now);
      const geo = eciToGeodetic(position, gmst);
      const lat = degreesLat(geo.latitude);
      const lon = degreesLong(geo.longitude);

      if (!isFinite(lat) || !isFinite(lon)) continue;

      results.push({ name: name.trim(), lat, lon, alt: geo.height });
    } catch {
      continue;
    }
  }

  if (results.length === 0) {
    throw new Error("No valid TLE records parsed — response may not be plain-text TLE format");
  }

  return results;
}
