"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  ISSPosition,
  Location,
  SatellitePosition,
  SatelliteCategory,
} from "@/lib/iss-api";

// --- Custom Icons ---

const issIcon = L.divIcon({
  className: "iss-icon",
  html: `<svg width="36" height="36" viewBox="0 0 36 36">
    <circle cx="18" cy="18" r="16" fill="rgba(0,229,160,0.15)" stroke="#00e5a0" stroke-width="1.5"/>
    <circle cx="18" cy="18" r="4" fill="#00e5a0"/>
    <line x1="4" y1="18" x2="14" y2="18" stroke="#00e5a0" stroke-width="2"/>
    <line x1="22" y1="18" x2="32" y2="18" stroke="#00e5a0" stroke-width="2"/>
    <line x1="18" y1="8" x2="18" y2="14" stroke="#00e5a0" stroke-width="1.5"/>
    <line x1="18" y1="22" x2="18" y2="28" stroke="#00e5a0" stroke-width="1.5"/>
  </svg>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const observerIcon = L.divIcon({
  className: "",
  html: `<svg width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="6" fill="rgba(0,184,255,0.2)" stroke="#00b8ff" stroke-width="1.5"/>
    <circle cx="10" cy="10" r="2.5" fill="#00b8ff"/>
  </svg>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const userLocationIcon = L.divIcon({
  className: "",
  html: `<svg width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="rgba(255,200,0,0.15)" stroke="#ffc800" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="rgba(255,200,0,0.4)" stroke="#ffc800" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="2" fill="#ffc800"/>
    <line x1="12" y1="2" x2="12" y2="6" stroke="#ffc800" stroke-width="1.5"/>
    <line x1="12" y1="18" x2="12" y2="22" stroke="#ffc800" stroke-width="1.5"/>
    <line x1="2" y1="12" x2="6" y2="12" stroke="#ffc800" stroke-width="1.5"/>
    <line x1="18" y1="12" x2="22" y2="12" stroke="#ffc800" stroke-width="1.5"/>
  </svg>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// --- Map position updater (child component to access map instance) ---

function ISSMarkerUpdater({
  position,
}: {
  position: ISSPosition | null;
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!position) return;

    const latLng = L.latLng(position.latitude, position.longitude);

    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, { icon: issIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(
          `<div style="color:#0b0e17;font-family:monospace;font-size:12px">
            <b>ISS</b><br/>
            ${Math.abs(position.latitude).toFixed(2)}° ${position.latitude >= 0 ? "N" : "S"},
            ${Math.abs(position.longitude).toFixed(2)}° ${position.longitude >= 0 ? "E" : "W"}<br/>
            Alt: ${position.altitude.toFixed(0)} km
          </div>`
        );
    } else {
      markerRef.current.setLatLng(latLng);
      markerRef.current.setPopupContent(
        `<div style="color:#0b0e17;font-family:monospace;font-size:12px">
          <b>ISS</b><br/>
          ${Math.abs(position.latitude).toFixed(2)}° ${position.latitude >= 0 ? "N" : "S"},
          ${Math.abs(position.longitude).toFixed(2)}° ${position.longitude >= 0 ? "E" : "W"}<br/>
          Alt: ${position.altitude.toFixed(0)} km
        </div>`
      );
    }
  }, [position, map]);

  return null;
}

// --- Day/night terminator ---
// Computes the solar terminator polygon using the standard low-precision
// solar position algorithm (accuracy ~1°). No external dependency needed.

function _julianDay(date: Date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function _terminatorLatLngs(date: Date): [number, number][] {
  const jDay = _julianDay(date);
  const n = jDay - 2451545;

  // Sun's mean longitude + mean anomaly
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180);

  // Ecliptic longitude → declination
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180);
  const epsilon = (23.439 - 0.0000004 * n) * (Math.PI / 180);
  const delta = Math.asin(Math.sin(epsilon) * Math.sin(lambda));

  // Greenwich hour angle (radians)
  const GMST = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
  const gw = (GMST / 24) * 2 * Math.PI;

  // Sample the terminator great circle at 1° longitude steps
  const pts: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng++) {
    const lngRad = (lng * Math.PI) / 180;
    const lngDiff = lngRad - gw;
    const lat =
      Math.abs(delta) < Math.PI / 2
        ? Math.atan(-Math.cos(lngDiff) / Math.tan(delta))
        : delta > 0
        ? Math.PI / 2
        : -Math.PI / 2;
    pts.push([(lat * 180) / Math.PI, lng]);
  }

  // Close the polygon over the night pole
  if (delta < 0) {
    pts.push([90, 180], [90, -180]);
  } else {
    pts.push([-90, 180], [-90, -180]);
  }
  return pts;
}

function TerminatorLayer() {
  const map = useMap();
  const polyRef = useRef<L.Polygon | null>(null);

  useEffect(() => {
    const update = () => {
      const latLngs = _terminatorLatLngs(new Date());
      if (!polyRef.current) {
        polyRef.current = L.polygon(latLngs as L.LatLngExpression[], {
          stroke: true,
          color: "#4477cc",
          weight: 1.5,
          opacity: 0.7,
          fillColor: "#010a1e",
          fillOpacity: 0.55,
          interactive: false,
        }).addTo(map);
      } else {
        polyRef.current.setLatLngs(latLngs);
        polyRef.current.redraw();
      }
    };

    update();
    const interval = setInterval(update, 60_000); // sun moves ~0.25°/min, 1 min is plenty
    return () => {
      clearInterval(interval);
      polyRef.current?.remove();
      polyRef.current = null;
    };
  }, [map]);

  return null;
}

// --- Satellites layer ---

function SatellitesLayer({
  satPositions,
  satCategories,
}: {
  satPositions: Record<string, SatellitePosition[]>;
  satCategories: Record<string, SatelliteCategory>;
}) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map);
    }
    groupRef.current.clearLayers();

    const total = Object.values(satPositions).reduce((s, a) => s + a.length, 0);
    console.log(`[SatellitesLayer] rendering ${total} satellites across ${Object.keys(satPositions).length} categories`);

    for (const [key, positions] of Object.entries(satPositions)) {
      const color = satCategories[key]?.color ?? "#ffffff";
      for (const pos of positions) {
        L.circleMarker([pos.lat, pos.lon], {
          radius: 3,
          color,
          fillColor: color,
          fillOpacity: 0.85,
          weight: 0,
        })
          .addTo(groupRef.current!)
          .bindPopup(
            `<div style="color:#0b0e17;font-family:monospace;font-size:12px">
              <b>${pos.name}</b><br/>
              Alt: ${pos.alt.toFixed(0)} km
            </div>`
          );
      }
    }
  }, [satPositions, satCategories, map]);

  useEffect(() => {
    return () => {
      groupRef.current?.remove();
      groupRef.current = null;
    };
  }, []);

  return null;
}

// --- Main Map Component ---

interface MapViewProps {
  position: ISSPosition | null;
  trail: [number, number][];
  locations: Record<string, Location>;
  currentLoc: string;
  userLocation: Location | null;
  satPositions: Record<string, SatellitePosition[]>;
  satCategories: Record<string, SatelliteCategory>;
}

export default function MapView({
  position,
  trail,
  locations,
  currentLoc,
  userLocation,
  satPositions,
  satCategories,
}: MapViewProps) {
  const locationEntries = useMemo(
    () => Object.entries(locations),
    [locations]
  );

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      maxZoom={8}
      worldCopyJump={true}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxZoom={19}
        subdomains={["a", "b", "c", "d"]}
      />

      {/* Day/night terminator */}
      <TerminatorLayer />

      {/* ISS marker (managed imperatively for smooth updates) */}
      <ISSMarkerUpdater position={position} />

      {/* Satellite layers */}
      <SatellitesLayer satPositions={satPositions} satCategories={satCategories} />

      {/* Trail */}
      {trail.length > 1 && (
        <Polyline
          positions={trail}
          pathOptions={{
            color: "#00e5a0",
            weight: 2,
            opacity: 0.4,
            dashArray: "4 6",
          }}
        />
      )}

      {/* Observer locations */}
      {locationEntries.map(([key, loc]) => (
        <Marker
          key={key}
          position={[loc.lat, loc.lon]}
          icon={observerIcon}
        >
          <Popup>
            <div
              style={{
                color: "#0b0e17",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            >
              <b>{loc.name}</b>
              <br />
              {loc.lat.toFixed(4)}°N, {loc.lon.toFixed(4)}°E
            </div>
          </Popup>
        </Marker>
      ))}

      {/* User location */}
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lon]}
          icon={userLocationIcon}
        >
          <Popup>
            <div
              style={{
                color: "#0b0e17",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            >
              <b>My Location</b>
              <br />
              {Math.abs(userLocation.lat).toFixed(4)}° {userLocation.lat >= 0 ? "N" : "S"},&nbsp;
              {Math.abs(userLocation.lon).toFixed(4)}° {userLocation.lon >= 0 ? "E" : "W"}
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
