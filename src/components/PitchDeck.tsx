import React, { useState, useEffect } from "react";

interface Slide {
  id: number;
  title: string;
  subtitle: string;
  bullets: string[];
  graphicType: "cover" | "problem" | "solution" | "market" | "tech" | "model" | "roadmap" | "ask";
  askAmount?: string;
  useOfFunds?: string[];
}

interface PitchDeckProps {
  idea: string;
  profile: any;
  blueprintData?: any;
  businessPlanData?: any;
  onClose: () => void;
}

export default function PitchDeck({ idea, profile, blueprintData, businessPlanData, onClose }: PitchDeckProps) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [isPresenting, setIsPresenting] = useState(false);
  const [deckTheme, setDeckTheme] = useState<"charcoal" | "solar" | "deepspace">("charcoal");

  // Dynamically assemble content based on current business data or defaults
  useEffect(() => {
    const defaultSlides: Slide[] = [
      {
        id: 1,
        title: idea ? idea.toUpperCase() : "FORGE VENTURE",
        subtitle: `Disruptive Innovation in the ${profile?.niche || "tech"} Sector`,
        bullets: [
          `Target Founder Constraints: ${profile?.capacity || "Independent Builder"}`,
          `Geographic Hub Focus: ${profile?.market || "Global digital distribution"}`
        ],
        graphicType: "cover"
      },
      {
        id: 2,
        title: "The Critical Friction",
        subtitle: "The market is broken, legacy models waste invaluable resources daily.",
        bullets: [
          "Incumbents are slow, expensive, and rely on legacy manual coordination.",
          "Customers suffer from high setup times and zero workflow extensibility.",
          "High cost barriers exclude early adopters from finding reliable services."
        ],
        graphicType: "problem"
      },
      {
        id: 3,
        title: "The Product Solution",
        subtitle: "A modern, highly optimized engine designed precisely for immediate validation.",
        bullets: [
          "Automated pipelines reducing fulfillment loops from weeks to minutes.",
          "Open, extensible developer platform with built-in core integration widgets.",
          "Unmatched pricing efficiencies saving clients up to 75% on legacy costs."
        ],
        graphicType: "solution"
      },
      {
        id: 4,
        title: "The Market Landscape",
        subtitle: `Entering a massive expansion sector in the ${profile?.niche || "target"} universe.`,
        bullets: [
          "Target Demographic: Early-stage builders, developers, and agile teams.",
          "TAM (Total Addressable Market) is scaling over 20% YOY globally.",
          "Low competitive density in the sub-tier developer integrations space."
        ],
        graphicType: "market"
      },
      {
        id: 5,
        title: "The Core Tech Engine",
        subtitle: "Meticulously structured code architecture with bulletproof horizontal scaling.",
        bullets: [
          "Modern lightweight front-end stack synced with server-side microservices.",
          "Vulnerability sandbox layers minimizing cross-tenant threat footprints.",
          "Pre-populated configurations allowing fast deployment triggers."
        ],
        graphicType: "tech"
      },
      {
        id: 6,
        title: "The Monetization Strategy",
        subtitle: "Built to generate rapid margins via predictable billing channels.",
        bullets: [
          "SaaS Subscription: Tiered usage-limit pricing tailored for builders.",
          "Developer Hub API Access Fees: Transactional API query tokens.",
          "Premium Enterprise Custom Configurations: Sizable contracts."
        ],
        graphicType: "model"
      },
      {
        id: 7,
        title: "The Execution Roadmap",
        subtitle: "A fast, risk-minimized sequence targeting cash-flow positivity.",
        bullets: [
          "Phase 1 (foundation): Core micro-services launch & early private beta.",
          "Phase 2 (scale): High-converting developer loops & pricing system integration.",
          "Phase 3 (dominance): Multi-region deployment & custom enterprise contracts."
        ],
        graphicType: "roadmap"
      },
      {
        id: 8,
        title: "The Ask & Allocation",
        subtitle: "Seeking high-conviction strategic capital to accelerate reach.",
        bullets: [
          "Allocating 50% for core system engineering & security hardening.",
          "Allocating 30% for localized developer ecosystem growth channels.",
          "Allocating 20% to operations & legal infrastructure compliance."
        ],
        graphicType: "ask",
        askAmount: "$750,000 convertible note",
        useOfFunds: ["Core R&D: 50%", "Growth: 30%", "Ops: 20%"]
      }
    ];

    // Align with generated blueprint details if available!
    if (blueprintData) {
      try {
        const sections = blueprintData.sections || [];
        const vision = blueprintData.vision || defaultSlides[0].subtitle;
        defaultSlides[0].subtitle = vision;
        
        // Find Problem section
        const probSection = sections.find((s: any) => s.title?.toLowerCase().includes("problem"));
        if (probSection) {
          defaultSlides[1].subtitle = probSection.content || defaultSlides[1].subtitle;
          if (probSection.bullets) defaultSlides[1].bullets = probSection.bullets.slice(0, 3);
        }

        // Find Solution section
        const solSection = sections.find((s: any) => s.title?.toLowerCase().includes("solution") || s.title?.toLowerCase().includes("concept"));
        if (solSection) {
          defaultSlides[2].subtitle = solSection.content || defaultSlides[2].subtitle;
          if (solSection.bullets) defaultSlides[2].bullets = solSection.bullets.slice(0, 3);
        }

        // Find Market section
        const mktSection = sections.find((s: any) => s.title?.toLowerCase().includes("market"));
        if (mktSection) {
          defaultSlides[3].subtitle = mktSection.content || defaultSlides[3].subtitle;
          if (mktSection.bullets) defaultSlides[3].bullets = mktSection.bullets.slice(0, 3);
        }

        // Find Risks section
        const riskSection = sections.find((s: any) => s.title?.toLowerCase().includes("risk"));
        if (riskSection) {
          defaultSlides[7].bullets[2] = `Mitigate: ${riskSection.content || "Deploy automated monitors"}`;
        }
      } catch (err) {
        console.warn("Could not perfectly bind structured blueprint data to deck slots:", err);
      }
    }

    setSlides(defaultSlides);
  }, [idea, profile, blueprintData]);

  const handleEditBullet = (slideIdx: number, bulletIdx: number, val: string) => {
    const updated = [...slides];
    updated[slideIdx].bullets[bulletIdx] = val;
    setSlides(updated);
  };

  const handleEditTitle = (slideIdx: number, val: string) => {
    const updated = [...slides];
    updated[slideIdx].title = val;
    setSlides(updated);
  };

  const handleEditSubtitle = (slideIdx: number, val: string) => {
    const updated = [...slides];
    updated[slideIdx].subtitle = val;
    setSlides(updated);
  };

  // Theme styles resolver
  const getThemeStyles = () => {
    switch (deckTheme) {
      case "solar":
        return {
          bg: "#0c0d0a",
          border: "2px solid #c8ff00",
          accentColor: "#c8ff00",
          textColor: "#f2f5ea",
          mutedText: "rgba(242, 245, 234, 0.6)"
        };
      case "deepspace":
        return {
          bg: "#08060c",
          border: "2px solid #b87fff",
          accentColor: "#b87fff",
          textColor: "#faf9fc",
          mutedText: "rgba(250, 249, 252, 0.6)"
        };
      case "charcoal":
      default:
        return {
          bg: "#0a0a0a",
          border: "2px solid #2a2a2a",
          accentColor: "#00f0ff",
          textColor: "#f5f5f5",
          mutedText: "rgba(245, 245, 245, 0.5)"
        };
    }
  };

  const theme = getThemeStyles();

  // Render SVG Visualizations to decorate the slide presentation
  const renderSlideGraphic = (type: string) => {
    const accent = theme.accentColor;
    switch (type) {
      case "cover":
        return (
          <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.85 }}>
            <circle cx="50" cy="50" r="30" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="5, 3" />
            <circle cx="50" cy="50" r="20" fill="none" stroke={accent} strokeWidth="1" />
            <line x1="50" y1="10" x2="50" y2="90" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <line x1="10" y1="50" x2="90" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <circle cx="50" cy="50" r="4" fill={accent} />
          </svg>
        );
      case "problem":
        return (
          <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.85 }}>
            {/* Saturated colliding grids representing friction */}
            <rect x="25" y="25" width="50" height="50" rx="5" fill="none" stroke="#ff3c78" strokeWidth="2" />
            <line x1="10" y1="40" x2="90" y2="40" stroke="#ff3c78" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="10" y1="60" x2="90" y2="60" stroke="#ff3c78" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="40" y1="10" x2="40" y2="90" stroke="#ff3c78" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="60" y1="10" x2="60" y2="90" stroke="#ff3c78" strokeWidth="1.5" strokeDasharray="3 3" />
            {/* Warning or block representing pain */}
            <circle cx="50" cy="50" r="10" fill="#ff3c78" fillOpacity="0.25" />
            <path d="M46 44 L54 56 M54 44 L46 56" stroke="#ff3c78" strokeWidth="3" />
          </svg>
        );
      case "solution":
        return (
          <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.85 }}>
            {/* Pure, aligned, beautiful radial node representing the solution */}
            <circle cx="50" cy="50" r="28" fill="none" stroke={accent} strokeWidth="1.5" />
            <circle cx="50" cy="50" r="12" fill={`${accent}22`} stroke={accent} strokeWidth="1.5" />
            <path d="M50 15 L50 38 M50 62 L50 85 M15 50 L38 50 M62 50 L85 50" stroke={accent} strokeWidth="2" />
            <circle cx="50" cy="15" r="4" fill={accent} />
            <circle cx="50" cy="85" r="4" fill={accent} />
            <circle cx="15" cy="50" r="4" fill={accent} />
            <circle cx="85" cy="50" r="4" fill={accent} />
          </svg>
        );
      case "market":
        return (
          <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.85 }}>
            {/* TAM bento breakdown grids */}
            <rect x="15" y="15" width="70" height="70" rx="6" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
            <rect x="25" y="25" width="50" height="50" rx="4" fill="none" stroke={accent} strokeWidth="2" />
            <rect x="40" y="40" width="20" height="20" rx="2" fill={`${accent}33`} stroke={accent} strokeWidth="2" />
            <text x="50" y="34" fill={accent} fontSize="5" fontWeight="black" textAnchor="middle" fontFamily="monospace">TAM</text>
            <text x="50" y="52" fill="#fff" fontSize="5" fontWeight="black" textAnchor="middle" fontFamily="monospace">SAM</text>
            <text x="50" y="76" fill="rgba(255,255,255,0.4)" fontSize="4.5" textAnchor="middle" fontFamily="monospace">Target Niche</text>
          </svg>
        );
      case "tech":
        return (
          <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.85 }}>
            {/* Interlaced microchip system design */}
            <rect x="30" y="30" width="40" height="40" rx="3" fill="none" stroke={accent} strokeWidth="2" />
            <line x1="15" y1="35" x2="30" y2="35" stroke={accent} strokeWidth="1.5" />
            <line x1="15" y1="50" x2="30" y2="50" stroke={accent} strokeWidth="1.5" />
            <line x1="15" y1="65" x2="30" y2="65" stroke={accent} strokeWidth="1.5" />
            <line x1="70" y1="35" x2="85" y2="35" stroke={accent} strokeWidth="1.5" />
            <line x1="70" y1="50" x2="85" y2="50" stroke={accent} strokeWidth="1.5" />
            <line x1="70" y1="65" x2="85" y2="65" stroke={accent} strokeWidth="1.5" />
            <circle cx="50" cy="50" r="10" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="3,1" />
            <circle cx="50" cy="50" r="4" fill={accent} />
          </svg>
        );
      case "model":
        return (
          <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.85 }}>
            {/* Visual monetization engine flow */}
            <circle cx="25" cy="50" r="10" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            <text x="25" y="52" fill="rgba(255,255,255,0.5)" fontSize="5" textAnchor="middle" fontFamily="monospace">Users</text>
            <circle cx="50" cy="55" r="14" fill="none" stroke={accent} strokeWidth="2" />
            <text x="50" y="57" fill={accent} fontSize="6" fontWeight="bold" textAnchor="middle" fontFamily="monospace">VALUE</text>
            <circle cx="75" cy="50" r="10" fill="none" stroke="rgba(200,255,0,0.2)" strokeWidth="1.5" />
            <text x="75" y="52" fill="#c8ff00" fontSize="5" textAnchor="middle" fontFamily="monospace">Cash</text>
            <path d="M35 50 Q50 35 65 50" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="2,2" />
            <path d="M65 52 Q50 68 35 52" fill="none" stroke="#c8ff00" strokeWidth="1.5" />
          </svg>
        );
      case "roadmap":
        return (
          <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.85 }}>
            {/* Interactive timeline checkpoints */}
            <line x1="15" y1="50" x2="85" y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
            <line x1="15" y1="50" x2="50" y2="50" stroke={accent} strokeWidth="3" />
            <circle cx="20" cy="50" r="5" fill={accent} />
            <circle cx="45" cy="50" r="5" fill={accent} />
            <circle cx="70" cy="50" r="5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <text x="20" y="38" fill={accent} fontSize="4" textAnchor="middle" fontFamily="monospace">Beta 1</text>
            <text x="45" y="38" fill={accent} fontSize="4" textAnchor="middle" fontFamily="monospace">Launch</text>
            <text x="70" y="38" fill="rgba(255,255,255,0.4)" fontSize="4" textAnchor="middle" fontFamily="monospace">Scale</text>
          </svg>
        );
      case "ask":
        return (
          <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.85 }}>
            {/* Secure Allocation pie breakdown */}
            <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
            <path d="M50 50 L50 20 A30 30 0 0 1 80 50 Z" fill={accent} fillOpacity="0.4" stroke={accent} strokeWidth="1.5" />
            <path d="M50 50 L80 50 A30 30 0 0 1 50 80 Z" fill="#ff3c78" fillOpacity="0.3" stroke="#ff3c78" strokeWidth="1.5" />
            <path d="M50 50 L50 80 A30 30 0 0 1 20 50 Z" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="6" fill="#fff" />
          </svg>
        );
      default:
        return null;
    }
  };

  const activeSlide = slides[activeSlideIdx];

  const LIME = "#c8ff00";

  return (
    <div style={{ animation: "fadeIn .25s ease", marginTop: "1rem" }}>
      {/* Slide Navigation Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <span style={{ color: LIME, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", fontWeight: "bold" }}>🎨 PITCH DECK SIMULATOR</span>
          <h2 style={{ color: "#fff", margin: "0.2rem 0 0", fontSize: "1.15rem", fontWeight: "bold" }}>Interactive Slide Studio</h2>
        </div>
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
          {/* Deck Preset Themes */}
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase" }}>THEME:</span>
          {["charcoal", "solar", "deepspace"].map(t => (
            <button 
              key={t}
              onClick={() => setDeckTheme(t as any)}
              style={{
                background: deckTheme === t ? LIME : "transparent",
                color: deckTheme === t ? "#000" : "rgba(255,255,255,0.4)",
                border: "1px solid #222",
                padding: "2px 6px",
                fontSize: "8.5px",
                fontFamily: "monospace",
                borderRadius: "3px",
                cursor: "pointer",
                fontWeight: "bold",
                textTransform: "uppercase"
              }}
            >
              {t}
            </button>
          ))}
          <button 
            onClick={() => setIsPresenting(true)}
            style={{ background: LIME, color: "#000", border: 'none', padding: "0.45rem 0.9rem", fontSize: "10px", fontWeight: "900", letterSpacing: "1px", fontFamily: "monospace", borderRadius: "5px", cursor: "pointer", marginLeft: "10px" }}
          >
            📺 PRESENT
          </button>
          <button 
            onClick={onClose}
            style={{ 
              background: "rgba(255, 60, 120, 0.08)", 
              border: "1px solid rgba(255, 60, 120, 0.3)", 
              color: "#FF3C78", 
              padding: "0.45rem 1.1rem", 
              fontSize: "10px", 
              fontFamily: "monospace", 
              borderRadius: "5px", 
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            CLOSE SIMULATOR
          </button>
        </div>
      </div>

      {slides.length === 0 ? (
        <div style={{ padding: "4rem 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>Assembling presentation canvas...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
          
          {/* Slide Deck Catalog Directory */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", background: "#0c0c0c", border: "1px solid #1c1c1c", padding: "0.65rem", borderRadius: "8px", maxHeight: "400px", overflowY: "auto" }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "0.35rem", display: "block" }}>OUTLINE INDEX</span>
            {slides.map((s, idx) => (
              <div 
                key={s.id}
                onClick={() => setActiveSlideIdx(idx)}
                style={{
                  background: activeSlideIdx === idx ? "rgba(255,255,255,0.03)" : "transparent",
                  border: `1px solid ${activeSlideIdx === idx ? theme.accentColor : "transparent"}`,
                  borderRadius: "5px",
                  padding: "0.45rem 0.6rem",
                  cursor: "pointer",
                  transition: "all .15s"
                }}
              >
                <div style={{ fontSize: "7px", color: theme.mutedText, textTransform: "uppercase", fontFamily: "monospace", letterSpacing: "1px" }}>SLIDE {s.id} · {s.graphicType}</div>
                <div style={{ fontSize: "10px", color: activeSlideIdx === idx ? "#fff" : "rgba(255,255,255,0.5)", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: "0.15rem 0 0" }}>{s.title}</div>
              </div>
            ))}
          </div>

          {/* Interactive Slide Builder Canvas */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            
            {/* Slide Body Stage */}
            <div className="p-4 sm:p-8 min-h-[310px] grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-6 relative" style={{ background: theme.bg, border: theme.border, borderRadius: "8px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignSelf: "center", width: "100%" }}>
                {/* Editable Title */}
                <input 
                  type="text" 
                  value={activeSlide.title} 
                  onChange={e => handleEditTitle(activeSlideIdx, e.target.value)}
                  style={{ background: "transparent", border: "none", color: "#fff", fontSize: "1.45rem", fontWeight: "900", fontFamily: "monospace", outline: "none", width: "100%", letterSpacing: "0.5px", marginBottom: "0.5rem" }}
                />
                
                {/* Editable Subtitle */}
                <input 
                  type="text" 
                  value={activeSlide.subtitle} 
                  onChange={e => handleEditSubtitle(activeSlideIdx, e.target.value)}
                  style={{ background: "transparent", border: "none", color: theme.mutedText, fontSize: "0.80rem", fontFamily: "monospace", outline: "none", width: "100%", lineHeight: "1.5", marginBottom: "1.2rem" }}
                />

                {/* Bullets outline list */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {activeSlide.bullets.map((b, bIdx) => (
                    <div key={bIdx} style={{ display: "flex", alignItems: "flex-start", gap: "0.55rem" }}>
                      <span style={{ color: theme.accentColor, fontSize: "11px", marginTop: "2px" }}>→</span>
                      <textarea 
                        value={b} 
                        onChange={e => handleEditBullet(activeSlideIdx, bIdx, e.target.value)}
                        rows={1}
                        style={{ flex: 1, background: "transparent", border: "none", color: "rgba(255,255,255,0.85)", fontSize: "0.78rem", fontFamily: "monospace", outline: "none", resize: "none", padding: "0" }}
                      />
                    </div>
                  ))}
                </div>

                {activeSlide.graphicType === "ask" && activeSlide.askAmount && (
                  <div style={{ marginTop: "1rem", background: "rgba(255, 60, 120, 0.05)", border: "1px solid rgba(255, 60, 120, 0.2)", borderRadius: "5px", padding: "0.5rem 0.8rem", width: "fit-content" }}>
                    <span style={{ fontSize: "8px", textTransform: "uppercase", color: "#ff3c78", display: "block" }}>TARGET INVESTMENT CRITERIA</span>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#fff", fontWeight: "bold" }}>{activeSlide.askAmount}</span>
                  </div>
                )}
              </div>

              {/* Vector SVG Graphic Decoration block */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "1rem" }}>
                {renderSlideGraphic(activeSlide.graphicType)}
              </div>
            </div>

            {/* Slide Action Bars */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0c0c0c", border: "1px solid #1c1c1c", padding: "0.65rem 1rem", borderRadius: "8px" }}>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "8.5px", fontFamily: "monospace" }}>Tip: Click any header or bullet on the slide stage above to refine on the fly!</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button 
                  onClick={() => setActiveSlideIdx(prev => Math.max(prev - 1, 0))}
                  disabled={activeSlideIdx === 0}
                  style={{ background: "transparent", border: "1px solid #222", color: activeSlideIdx === 0 ? "rgba(255,255,255,0.15)" : "#fff", padding: "4px 8px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", borderRadius: "4px" }}
                >
                  ◀ PREV
                </button>
                <span style={{ alignSelf: "center", fontSize: "9.5px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", padding: "0 4px" }}>{activeSlideIdx + 1} / {slides.length}</span>
                <button 
                  onClick={() => setActiveSlideIdx(prev => Math.min(prev + 1, slides.length - 1))}
                  disabled={activeSlideIdx === slides.length - 1}
                  style={{ background: "transparent", border: "1px solid #222", color: activeSlideIdx === slides.length - 1 ? "rgba(255,255,255,0.15)" : "#fff", padding: "4px 8px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", borderRadius: "4px" }}
                >
                  NEXT ▶
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* FULLSCREEN VELOCITY PRESENTATION LAYER */}
      {isPresenting && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100.0vw", height: "100.0vh", background: theme.bg, zIndex: 10000, display: "flex", flexDirection: "column", padding: "2.5rem", boxSizing: "border-box" }}>
          {/* Header Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${theme.accentColor}22`, paddingBottom: "1.2rem", marginBottom: "2rem" }}>
            <span style={{ fontSize: "10px", color: theme.accentColor, fontFamily: "monospace", letterSpacing: "2px", fontWeight: "bold" }}>FORGE PRESENTATION SUITE</span>
            <span style={{ fontSize: "11px", color: "#fff", fontFamily: "monospace" }}>Slide {slides[activeSlideIdx].id} of {slides.length}</span>
            <button 
              onClick={() => setIsPresenting(false)}
              style={{ background: theme.accentColor, color: "#000", border: "none", borderRadius: "4px", padding: "6px 14px", fontSize: "10px", fontWeight: "bold", fontFamily: "monospace", cursor: "pointer" }}
            >
              EXIT PRESENTATION [ESC]
            </button>
          </div>

          {/* Core Body Container */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_240px] gap-6 items-center">
            <div style={{ textAlign: "left" }}>
              <h1 style={{ color: "#fff", fontSize: "2.5rem", fontWeight: "900", fontFamily: "monospace", marginBottom: "1rem", letterSpacing: "-0.5px" }}>{slides[activeSlideIdx].title}</h1>
              <p style={{ color: theme.mutedText, fontSize: "1.2rem", fontFamily: "monospace", lineHeight: "1.6", marginBottom: "2.5rem" }}>{slides[activeSlideIdx].subtitle}</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                {slides[activeSlideIdx].bullets.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
                    <span style={{ color: theme.accentColor, fontSize: "1.4rem", lineHeight: 1 }}>→</span>
                    <p style={{ color: "rgba(255,255,255,0.9)", fontSize: "1.150rem", margin: 0, lineHeight: "1.5", fontFamily: "monospace" }}>{b}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", alignSelf: "center", padding: "1.5rem", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
              {renderSlideGraphic(slides[activeSlideIdx].graphicType)}
            </div>
          </div>

          {/* Footer Timeline Nav */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "1.5rem" }}>
            <span style={{ fontSize: "10px", color: theme.mutedText, fontFamily: "monospace" }}>Use arrows below or keystrokes to shift slide positions</span>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button 
                onClick={() => setActiveSlideIdx(p => Math.max(p - 1, 0))}
                disabled={activeSlideIdx === 0}
                style={{ background: "transparent", border: `1px solid ${theme.accentColor}22`, color: "#fff", padding: "8px 18px", fontSize: "10px", fontWeight: "bold", cursor: "pointer", borderRadius: "5px" }}
              >
                ◀ BACK
              </button>
              <button 
                onClick={() => setActiveSlideIdx(p => Math.min(p + 1, slides.length - 1))}
                disabled={activeSlideIdx === slides.length - 1}
                style={{ background: theme.accentColor, color: "#000", border: 'none', padding: "8px 18px", fontSize: "10px", fontWeight: "bold", cursor: "pointer", borderRadius: "5px" }}
              >
                FORWARD ▶
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
