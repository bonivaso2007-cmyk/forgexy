import React, { useState, useEffect } from "react";

interface Competitor {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description: string;
  vulnerability: string;
  strength?: string;
  traffic: "High" | "Medium" | "Low";
}

interface Center {
  lat: number;
  lng: number;
}

interface LandscapeProps {
  idea: string;
  profile: any;
  onClose: () => void;
}

export default function MarketLandscape({ idea, profile, onClose }: LandscapeProps) {
  const [city, setCity] = useState(profile?.market || "New York");
  const [niche, setNiche] = useState(profile?.niche || "tech hub");
  const [loading, setLoading] = useState(false);
  const [center, setCenter] = useState<Center>({ lat: 40.7128, lng: -74.0060 });
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selectedComp, setSelectedComp] = useState<Competitor | null>(null);
  const [heatToggle, setHeatToggle] = useState(true);
  const [radarSweep, setRadarSweep] = useState(true);

  // Fetch geographical competitor coordinates from backend intel proxy
  const queryCompetitors = async () => {
    setLoading(true);
    setSelectedComp(null);
    try {
      const res = await fetch("/api/market-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, niche })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.ok ? await res.json() : null;
      if (data) {
        setCenter(data.center || { lat: 40.7128, lng: -74.0060 });
        setCompetitors(data.results || []);
      }
    } catch (err: any) {
      console.warn("Places resolution fallback triggered:", err);
      // Fallback local coordinate generation centered around standard locations
      const coordCenter = city.toLowerCase().includes("london") ? { lat: 51.5074, lng: -0.1278 } : 
                          city.toLowerCase().includes("san fran") ? { lat: 37.7749, lng: -122.4194 } : 
                          { lat: 40.7128, lng: -74.0060 };
      setCenter(coordCenter);
      setCompetitors([
        { id: "f1", name: "Inertial Incumbent Corp", lat: coordCenter.lat + 0.004, lng: coordCenter.lng - 0.005, description: "Highly trusted direct provider, established market share.", vulnerability: "Extremely offline setup, no APIs, slow contract loops.", traffic: "High" },
        { id: "f2", name: "Genesis Systems Space", lat: coordCenter.lat - 0.006, lng: coordCenter.lng + 0.003, description: "Premium, modern boutique services catering to elite firms.", vulnerability: "Saturated pricing model, heavy customer friction.", traffic: "Medium" },
        { id: "f3", name: "Legacy & Sons", lat: coordCenter.lat + 0.002, lng: coordCenter.lng + 0.006, description: "Traditional merchant operations, aging user demographic.", vulnerability: "Poor retention metrics, unoptimized support channels.", traffic: "Low" },
        { id: "f4", name: "Hyperion Fast-Firms", lat: coordCenter.lat - 0.002, lng: coordCenter.lng - 0.004, description: "Fast expanding venture-backed agency with high customer burn.", vulnerability: "Lacking custom personalization, heavy churn trends.", traffic: "Medium" }
      ]);
    }
    setLoading(false);
  };

  useEffect(() => {
    queryCompetitors();
  }, [city, niche]);

  // Convert GPS Coordinates to Local 2D Canvas coordinate ratios (0-100)
  const getCanvasCoords = (lat: number, lng: number) => {
    if (competitors.length === 0) return { x: 50, y: 50 };
    
    // Find min-max boundaries dynamically to scale neatly
    const lats = [center.lat, ...competitors.map(c => c.lat)];
    const lngs = [center.lng, ...competitors.map(c => c.lng)];
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

    const latSpan = (maxLat - minLat) || 0.01;
    const lngSpan = (maxLng - minLng) || 0.01;

    // Pad container and return ratios inside 15-85% grid limits
    const x = 15 + ((lng - minLng) / lngSpan) * 70;
    const y = 85 - ((lat - minLat) / latSpan) * 70; // Invert latitude coordinate for standard cartological orientation

    return { x, y };
  };

  const LIME = "#c8ff00";
  const PURPLE = "#b87fff";
  const PINK = "#ff3c78";
  const CYAN = "#00f0ff";

  return (
    <div style={{ animation: "fadeIn .25s ease", marginTop: "1rem" }}>
      <style>{`
        @keyframes sweeper {
          0% { transform: rotate(0deg); opacity: 0.15; }
          50% { opacity: 0.5; }
          100% { transform: rotate(360deg); opacity: 0.15; }
        }
        .radar-sweep-element {
          transform-origin: 50% 50%;
          animation: sweeper 8s infinite linear;
        }
      `}</style>

      {/* Control Input Header panel */}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.85rem", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <span style={{ color: LIME, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", fontWeight: "bold" }}>🗺️ LOCAL GEOGRAPHIC COMPETITOR SPECTRAL LAB</span>
          <h2 style={{ color: "#fff", margin: "0.2rem 0 0", fontSize: "1.15rem", fontWeight: "bold" }}>Google Places Grounding Radar</h2>
        </div>
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
          <input 
            type="text" 
            placeholder="Target Hub City..."
            value={city} 
            onChange={e => setCity(e.target.value)}
            style={{ background: "#0c0c0c", border: "1px solid #222", padding: "0.45rem 0.7rem", color: "#fff", outline: "none", borderRadius: "5px", fontSize: "11px", width: "130px", fontFamily: "monospace" }}
          />
          <input 
            type="text" 
            placeholder="Niche Sector..."
            value={niche} 
            onChange={e => setNiche(e.target.value)}
            style={{ background: "#0c0c0c", border: "1px solid #222", padding: "0.45rem 0.7rem", color: "#fff", outline: "none", borderRadius: "5px", fontSize: "11px", width: "130px", fontFamily: "monospace" }}
          />
          <button 
            onClick={queryCompetitors}
            style={{ background: LIME, color: "#000", border: "none", padding: "0.45rem 0.85rem", fontSize: "10px", fontWeight: "900", fontFamily: "monospace", borderRadius: "5px", cursor: "pointer" }}
          >
            SCAN
          </button>
          <button 
            onClick={onClose}
            style={{ 
              background: "rgba(255, 60, 120, 0.08)", 
              border: "1px solid rgba(255, 60, 120, 0.3)", 
              color: PINK, 
              padding: "0.45rem 1.1rem", 
              fontSize: "10px", 
              fontFamily: "monospace", 
              borderRadius: "5px", 
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            CLOSE RADER
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        
        {/* Responsive Coordinate Map Stage */}
        <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "8px", overflow: "hidden", position: "relative", minHeight: "380px" }}>
          
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.80rem", justifyContent: "center", alignItems: "center", height: "380px" }}>
              <div style={{ width: "24px", height: "24px", border: "2px solid #111", borderTop: `2px solid ${LIME}`, borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.47)", letterSpacing: "1px" }}>PINGING GEOGRAPHIC NEIGHBORHOOD INDEXES...</span>
            </div>
          ) : (
            <>
              {/* GIS Vector Map */}
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "380px", background: "#040404" }}>
                
                {/* Cartography grid background */}
                <defs>
                  <pattern id="gisGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100" height="100" fill="url(#gisGrid)" />

                {/* Radar Concentric Sweep Circles */}
                <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(0, 240, 255, 0.05)" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0, 240, 255, 0.05)" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0, 240, 255, 0.05)" strokeWidth="0.5" />

                {/* Radar Sweeper Line Animation */}
                {radarSweep && (
                  <g className="radar-sweep-element">
                    <line x1="50" y1="50" x2="50" y2="5" stroke={CYAN} strokeWidth="0.75" strokeOpacity="0.45" />
                    <path d="M50 50 L50 5 A45 45 0 0 1 75 12 Z" fill={`radial-gradient(circle, ${CYAN} 0%, rgba(0,0,0,0) 100%)`} opacity="0.15" />
                  </g>
                )}

                {/* Draw density/heat zones around competitor nodes (White spaces highlighting) */}
                {heatToggle && competitors.map(c => {
                  const { x, y } = getCanvasCoords(c.lat, c.lng);
                  const heatOpacity = c.traffic === "High" ? "0.1" : c.traffic === "Medium" ? "0.06" : "0.03";
                  return (
                    <circle key={`heat-${c.id}`} cx={x} cy={y} r="18" fill={PINK} fillOpacity={heatOpacity} />
                  );
                })}

                {/* Center marker (Founder's planned HQ point) */}
                <circle cx="50" cy="50" r="2.5" fill={LIME} />
                <circle cx="50" cy="50" r="6" fill="none" stroke={LIME} strokeWidth="1" strokeDasharray="1.5,1" />

                {/* Competitor Coordinate Nodes */}
                {competitors.map(c => {
                  const { x, y } = getCanvasCoords(c.lat, c.lng);
                  const isCur = selectedComp?.id === c.id;
                  const dotColor = c.traffic === "High" ? PINK : c.traffic === "Medium" ? PURPLE : CYAN;
                  
                  return (
                    <g key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelectedComp(c)}>
                      {isCur && <circle cx={x} cy={y} r="5" fill="none" stroke={LIME} strokeWidth="1" />}
                      <circle cx={x} cy={y} r="2.5" fill={isCur ? LIME : dotColor} />
                    </g>
                  );
                })}
              </svg>

              {/* Float Map Legend */}
              <div style={{ position: "absolute", bottom: "10px", left: "12px", background: "rgba(5,5,5,0.85)", border: "1px solid #1c1c1c", borderRadius: "5px", padding: "8px 12px", display: "flex", gap: "10px", pointerEvents: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ display: "block", width: "6px", height: "6px", background: LIME, borderRadius: "50%" }} />
                  <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>Planned HQ</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ display: "block", width: "6px", height: "6px", background: PINK, borderRadius: "50%" }} />
                  <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>High Traffic Spot</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ display: "block", width: "6px", height: "6px", background: PURPLE, borderRadius: "50%" }} />
                  <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>Med Traffic</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ display: "block", width: "6px", height: "6px", background: CYAN, borderRadius: "50%" }} />
                  <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>Low Traffic</span>
                </div>
              </div>

              {/* Map GIS Filters */}
              <div style={{ position: "absolute", top: "10px", left: "12px", display: "flex", gap: "0.35rem" }}>
                <button 
                  onClick={() => setHeatToggle(!heatToggle)}
                  style={{
                    background: heatToggle ? "rgba(255, 60, 120, 0.15)" : "#0c0c0c",
                    color: heatToggle ? PINK : "rgba(255,255,255,0.4)",
                    border: `1px solid ${heatToggle ? PINK : "#1c1c1c"}`,
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "8.5px",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontWeight: "bold"
                  }}
                >
                  📡 HEAT SENSORS: {heatToggle ? "ON" : "OFF"}
                </button>
                <button 
                  onClick={() => setRadarSweep(!radarSweep)}
                  style={{
                    background: radarSweep ? "rgba(0, 240, 255, 0.12)" : "#0c0c0c",
                    color: radarSweep ? CYAN : "rgba(255,255,255,0.4)",
                    border: `1px solid ${radarSweep ? CYAN : "#1c1c1c"}`,
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "8.5px",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontWeight: "bold"
                  }}
                >
                  🧭 RADAR SWEEP: {radarSweep ? "ON" : "OFF"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Selected Competitor Metadata Drawer */}
        <div style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1rem", display: "flex", flexDirection: "column", height: "380px", overflowY: "auto" }}>
          {!selectedComp ? (
            <div style={{ margin: "auto", textAlign: "center", color: "rgba(255,255,255,0.25)" }}>
              <span style={{ fontSize: "1.5rem", display: "block", marginBottom: "0.5rem" }}>🔍</span>
              <span style={{ fontSize: "10.5px", lineHeight: "1.4", fontFamily: "monospace", display: "block" }}>
                Click on any node pin on the radar map to retrieve regional competitor intelligence.
              </span>
            </div>
          ) : (
            <div style={{ animation: "fadeIn .2s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                <span style={{ fontSize: "8.5px", color: selectedComp.traffic === "High" ? PINK : selectedComp.traffic === "Medium" ? PURPLE : CYAN, textTransform: "uppercase", fontWeight: "bold" }}>Traffic: {selectedComp.traffic}</span>
                <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>ID: {selectedComp.id}</span>
              </div>
              
              <h3 style={{ color: "#fff", fontSize: "12px", fontWeight: "bold", margin: "0 0 0.45rem" }}>{selectedComp.name}</h3>
              
              <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid #181818", padding: "0.55rem", borderRadius: "5px", marginBottom: "0.85rem" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px", textTransform: "uppercase", display: "block", marginBottom: "3px" }}>GEOGRAPHIC FOOTPRINT COORDINATES</span>
                <span style={{ fontSize: "9.5px", color: "#fff", fontFamily: "monospace" }}>lat: {selectedComp.lat.toFixed(4)}, lng: {selectedComp.lng.toFixed(4)}</span>
              </div>

              <div style={{ marginBottom: "0.85rem" }}>
                <span style={{ color: "rgba(255,255,255,0.32)", fontSize: "8.5px", display: "block", marginBottom: "3px" }}>MARKET PRESENCE SUMMARY</span>
                <p style={{ color: "rgba(255,255,255,0.78)", fontSize: "10.5px", margin: 0, lineHeight: "1.5" }}>{selectedComp.description}</p>
              </div>

              <div style={{ background: "rgba(255, 60, 120, 0.05)", border: "1px solid rgba(255, 60, 120, 0.2)", padding: "0.6rem", borderRadius: "5px" }}>
                <span style={{ color: PINK, fontSize: "8.5px", fontWeight: "bold", display: "block", marginBottom: "3px" }}>🎯 UNFAIR MOAT VULNERABILITY</span>
                <p style={{ color: "#fff", fontSize: "10px", margin: 0, lineHeight: "1.5" }}>{selectedComp.vulnerability}</p>
              </div>

              {selectedComp.strength && (
                <div style={{ background: "rgba(0, 240, 255, 0.05)", border: "1px solid rgba(0, 240, 255, 0.2)", padding: "0.6rem", borderRadius: "5px", marginTop: "0.55rem" }}>
                  <span style={{ color: CYAN, fontSize: "8.5px", fontWeight: "bold", display: "block", marginBottom: "3px" }}>🛡️ ACTIVE STRENGTH</span>
                  <p style={{ color: "#fff", fontSize: "10px", margin: 0, lineHeight: "1.5" }}>{selectedComp.strength}</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
