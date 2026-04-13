"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  ISSPosition,
  CrewMember,
  ISSPass,
  Location,
  LOCATIONS,
  fetchISSPosition,
  fetchCrew,
  fetchPasses,
} from "@/lib/iss-api";
import styles from "./page.module.css";

// Leaflet must be loaded client-side only
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Home() {
  const [position, setPosition] = useState<ISSPosition | null>(null);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [passes, setPasses] = useState<ISSPass[]>([]);
  const [currentLoc, setCurrentLoc] = useState("melnik");
  const [status, setStatus] = useState<"connecting" | "live" | "error">(
    "connecting"
  );
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [countdown, setCountdown] = useState(5);
  const trailRef = useRef<[number, number][]>([]);
  const [hoveredCrew, setHoveredCrew] = useState<{ member: CrewMember; y: number; color: string } | null>(null);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "denied">("idle");

  // Fetch ISS position every 5 seconds
  const updatePosition = useCallback(async () => {
    try {
      const pos = await fetchISSPosition();
      setPosition(pos);
      setStatus("live");

      const newPoint: [number, number] = [pos.latitude, pos.longitude];
      trailRef.current = [...trailRef.current.slice(-79), newPoint];
      setTrail([...trailRef.current]);
    } catch {
      setStatus("error");
    }
  }, []);

  // Fetch crew once
  useEffect(() => {
    fetchCrew()
      .then(setCrew)
      .catch(() => setCrew([]));
  }, []);

  // Fetch passes when location changes
  useEffect(() => {
    const loc = currentLoc === "user" ? userLocation : LOCATIONS[currentLoc];
    if (!loc) return;
    setPasses([]);
    fetchPasses(loc).then(setPasses).catch(() => setPasses([]));
  }, [currentLoc, userLocation]);

  const requestUserLocation = () => {
    if (!navigator.geolocation) return;
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: Location = {
          name: "My Location",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        setUserLocation(loc);
        setCurrentLoc("user");
        setGeoStatus("idle");
      },
      () => setGeoStatus("denied")
    );
  };

  // Position polling
  useEffect(() => {
    updatePosition();
    const interval = setInterval(updatePosition, 5000);
    return () => clearInterval(interval);
  }, [updatePosition]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 5 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatLat = (v: number) => {
    const d = v >= 0 ? "N" : "S";
    return `${Math.abs(v).toFixed(4)}° ${d}`;
  };

  const formatLon = (v: number) => {
    const d = v >= 0 ? "E" : "W";
    return `${Math.abs(v).toFixed(4)}° ${d}`;
  };

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toUTCString().slice(17, 25) + " UTC";
  };

  const formatPassTime = (ts: number) => {
    return new Date(ts * 1000).toUTCString().slice(0, 22);
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  const crewColors = [
    "#7F77DD",
    "#00e5a0",
    "#00b8ff",
    "#D85A30",
    "#D4537E",
    "#639922",
    "#BA7517",
    "#E24B4A",
  ];

  return (
    <div className={styles.dashboard}>
      {/* Top Bar */}
      <header className={styles.topbar}>
        <h1 className={styles.logo}>
          <span className={styles.logoAccent}>ISS</span> TRACKER
        </h1>
        <div
          className={`${styles.statusPill} ${
            status === "live"
              ? styles.statusLive
              : status === "error"
              ? styles.statusError
              : styles.statusConnecting
          }`}
        >
          <div className={styles.dot} />
          <span>
            {status === "live"
              ? "live tracking"
              : status === "error"
              ? "connection error"
              : "connecting..."}
          </span>
        </div>
      </header>

      {/* Map */}
      <div className={styles.mapContainer}>
        <MapView
          position={position}
          trail={trail}
          locations={LOCATIONS}
          currentLoc={currentLoc}
          userLocation={userLocation}
        />
      </div>

      {/* Sidebar */}
      <aside className={styles.sidebar}>
        {/* Telemetry */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            Telemetry
          </h2>
          <div className={styles.telemGrid}>
            <div className={styles.telemItem}>
              <div className={styles.telemLabel}>Lat</div>
              <div className={`${styles.telemValue} ${styles.accent}`}>
                {position ? formatLat(position.latitude) : "--"}
              </div>
            </div>
            <div className={styles.telemItem}>
              <div className={styles.telemLabel}>Lon</div>
              <div className={`${styles.telemValue} ${styles.accent}`}>
                {position ? formatLon(position.longitude) : "--"}
              </div>
            </div>
            <div className={styles.telemItem}>
              <div className={styles.telemLabel}>Altitude</div>
              <div className={`${styles.telemValue} ${styles.blue}`}>
                {position ? `${position.altitude.toFixed(1)} km` : "--"}
              </div>
            </div>
            <div className={styles.telemItem}>
              <div className={styles.telemLabel}>Velocity</div>
              <div className={`${styles.telemValue} ${styles.blue}`}>
                {position
                  ? `${Math.round(position.velocity).toLocaleString()} km/h`
                  : "--"}
              </div>
            </div>
            <div className={styles.telemItem}>
              <div className={styles.telemLabel}>Visibility</div>
              <div className={styles.telemValue}>
                {position?.visibility ?? "--"}
              </div>
            </div>
            <div className={styles.telemItem}>
              <div className={styles.telemLabel}>Last Fix (UTC)</div>
              <div className={styles.telemValue}>
                {position ? formatTime(position.timestamp) : "--"}
              </div>
            </div>
          </div>
        </div>

        {/* Crew */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Crew in space
            {crew.length > 0 && (
              <span className={styles.crewCount}>{crew.length}</span>
            )}
          </h2>
          <div className={styles.crewList}>
            {crew.length === 0 ? (
              <div className={styles.placeholder}>Loading crew data...</div>
            ) : (
              crew.map((member, i) => {
                const initials = member.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2);
                const color = crewColors[i % crewColors.length];
                return (
                  <div
                    key={member.name}
                    className={styles.crewItem}
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setHoveredCrew({ member, y: rect.top + rect.height / 2, color });
                    }}
                    onMouseLeave={() => setHoveredCrew(null)}
                  >
                    {member.image ? (
                      <img
                        src={member.image}
                        alt={member.name}
                        className={styles.crewPhoto}
                        style={{ borderColor: `${color}44` }}
                      />
                    ) : (
                      <div
                        className={styles.crewAvatar}
                        style={{
                          background: `${color}22`,
                          color: color,
                          border: `1px solid ${color}44`,
                        }}
                      >
                        {initials}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.crewName}>{member.name}</div>
                      <div className={styles.crewCraft}>{member.craft}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Passes */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Upcoming passes
          </h2>
          <div className={styles.locTabs}>
            {Object.entries(LOCATIONS).map(([key, loc]) => (
              <button
                key={key}
                className={`${styles.locTab} ${
                  currentLoc === key ? styles.locTabActive : ""
                }`}
                onClick={() => setCurrentLoc(key)}
              >
                {loc.name}
              </button>
            ))}
            <button
              className={`${styles.locTab} ${styles.locTabGeo} ${
                currentLoc === "user" ? styles.locTabActive : ""
              }`}
              onClick={requestUserLocation}
              disabled={geoStatus === "loading"}
              title={geoStatus === "denied" ? "Location access denied" : "Use my current location"}
            >
              {geoStatus === "loading" ? "…" : geoStatus === "denied" ? "✕ Denied" : "⊕ My Location"}
            </button>
          </div>
          <div className={styles.passList}>
            {passes.length === 0 ? (
              <div className={styles.placeholder}>Calculating passes...</div>
            ) : (
              passes.map((pass, i) => (
                <div key={i} className={styles.passItem}>
                  <span className={styles.passTime}>
                    {formatPassTime(pass.start)}
                  </span>
                  <span className={styles.passDur}>
                    {formatDuration(pass.duration)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Bottom Bar */}
      <footer className={styles.bottombar}>
        <span>Orbit: ~408 km · Period: ~92 min</span>
        <span>Next refresh: {countdown}s</span>
      </footer>

      {/* Crew tooltip rendered outside sidebar to avoid overflow clipping */}
      {hoveredCrew && (
        <div
          className={styles.crewTooltip}
          style={{ top: hoveredCrew.y }}
        >
          <div className={styles.tooltipHeader}>
            {hoveredCrew.member.image && (
              <img
                src={hoveredCrew.member.image}
                alt={hoveredCrew.member.name}
                className={styles.tooltipPhoto}
              />
            )}
            <div>
              <div className={styles.tooltipName}>{hoveredCrew.member.name}</div>
              {hoveredCrew.member.country && (
                <div className={styles.tooltipCountry}>
                  {hoveredCrew.member.flagCode && (
                    <img
                      src={`https://flagcdn.com/20x15/${hoveredCrew.member.flagCode}.png`}
                      alt={hoveredCrew.member.country}
                      style={{
                        width: 16,
                        height: 12,
                        borderRadius: 2,
                        verticalAlign: "middle",
                        marginRight: 6,
                      }}
                    />
                  )}
                  {hoveredCrew.member.country}
                </div>
              )}
            </div>
          </div>
          <div className={styles.tooltipGrid}>
            {hoveredCrew.member.agency && (
              <div className={styles.tooltipField}>
                <span className={styles.tooltipLabel}>Agency</span>
                <span>{hoveredCrew.member.agency}</span>
              </div>
            )}
            {hoveredCrew.member.position && (
              <div className={styles.tooltipField}>
                <span className={styles.tooltipLabel}>Role</span>
                <span>{hoveredCrew.member.position}</span>
              </div>
            )}
            {hoveredCrew.member.daysInSpace > 0 && (
              <div className={styles.tooltipField}>
                <span className={styles.tooltipLabel}>Prior days in space</span>
                <span>{hoveredCrew.member.daysInSpace}d</span>
              </div>
            )}
            {hoveredCrew.member.launched > 0 && (
              <div className={styles.tooltipField}>
                <span className={styles.tooltipLabel}>Mission start</span>
                <span>
                  {new Date(hoveredCrew.member.launched * 1000)
                    .toISOString()
                    .slice(0, 10)}
                </span>
              </div>
            )}
          </div>
          <div className={styles.tooltipLinks}>
            {hoveredCrew.member.url && (
              <a
                href={hoveredCrew.member.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tooltipLink}
              >
                Wiki
              </a>
            )}
            {hoveredCrew.member.twitter && (
              <a
                href={hoveredCrew.member.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tooltipLink}
              >
                𝕏
              </a>
            )}
            {hoveredCrew.member.instagram && (
              <a
                href={hoveredCrew.member.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tooltipLink}
              >
                IG
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
