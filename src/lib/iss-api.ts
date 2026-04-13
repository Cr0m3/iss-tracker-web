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
