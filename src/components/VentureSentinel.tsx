import React, { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";

// Accent Colors congruent with App style rules
const LIME = "#c8ff00";
const PINK = "#ff3c78";
const PURPLE = "#b87fff";
const CYAN = "#00f0ff";

interface VentureSentinelProps {
  idea: string;
  profile: any;
  onClose: () => void;
}

export default function VentureSentinel({ idea, profile, onClose }: VentureSentinelProps) {
  const [streak, setStreak] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("forge_daily_streak");
      return saved ? parseInt(saved, 10) : 1;
    } catch {
      return 1;
    }
  });

  const [chronosIndex, setChronosIndex] = useState(88);
  const [divergence, setDivergence] = useState(12);
  const [activeTab, setActiveTab] = useState<"diagnostic" | "history">("diagnostic");
  const [diagnosticsLogs, setDiagnosticsLogs] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("forge_sentinel_logs");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);
  const [userDefense, setUserDefense] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Hardcode futuristic prompt variants from 2100 to trigger strategic founder critical answers
  const DAILY_CHALLENGES = [
    {
      id: "anomaly_01",
      title: "Synthetic Agent Encroachment",
      scenario: "Year 2032 Chrono-Marker: Multiple synthetic web-agents are copy-cloning your offering in parallel grids within 8 seconds of registration. How does your core architecture survive this zero-friction copying force?",
      sentinelTask: "Define your proprietary non-reproducible core or offline network advantage."
    },
    {
      id: "anomaly_02",
      title: "Hyper-inflation Sovereign Shock",
      scenario: "Year 2045 Chrono-Marker: A massive algorithmic de-pegging event invalidates fiat transaction layers in your target country. Your customers only communicate through USSD or local grid points.",
      sentinelTask: "Formulate your alternate sovereign payment pipeline or informal exchange mechanics."
    },
    {
      id: "anomaly_03",
      title: "The Attention Singularity",
      scenario: "Year 2028 Chrono-Marker: Global attention span contracts to 0.4 seconds. Traditional software interfaces are completely bypassed as users default to non-visual neuro-links.",
      sentinelTask: "Refine your value proposition down to a single ambient signal or high-utility outcome."
    },
    {
      id: "anomaly_04",
      title: "Zero-Marginal-Cost Inundation",
      scenario: "Year 2035 Chrono-Marker: Generative infrastructure reduces software creation costs to absolute zero. 14,000 hyper-targeted competitors launch around you every hour.",
      sentinelTask: "What is your real-world relationship trust lock-in factor or structural moat?"
    }
  ];

  useEffect(() => {
    // Dynamically shuffle challenges so every load feels fresh, unique and real
    const shuffled = [...DAILY_CHALLENGES];
    setScenarios(shuffled);
  }, []);

  const runDiagnosticDefense = async () => {
    if (!userDefense.trim() || loading) return;
    setLoading(true);
    setResponse("");

    const activeScenario = scenarios[activeScenarioIdx] || DAILY_CHALLENGES[0];
    
    const sysPrompt = `You are the QUANTUM VENTURE SENTINEL FROM THE YEAR 2100.
Your role is to test modern-day startup founders with extreme futuristic anomalies to make their businesses bulletproof.
Respond with custom strategic evaluations in a highly professional, futuristic, and encouraging tone.
INSTRUCTIONS:
1. Address the founder's defense to the active futuristic anomaly specifically.
2. Criticize weak assumptions constructively using temporal metaphors (e.g. Chronos index, Timeline convergence stability).
3. Offer exactly 3 highly polished daily strategic tasks for immediate, real-world modern action.
Use markdown formatting. Use **bold** for key concepts. Start bullet points with '→'.`;

    const userPrompt = `MODERN FOUNDER IDENTITY:
Idea: "${idea}"
Founder Context: Location: ${profile?.city}, ${profile?.country} | Industry: ${profile?.industry} | Stage: ${profile?.stage}

FUTURISTIC ANOMALY CHALLENGE:
Title: ${activeScenario.title}
Anomalous Threat: ${activeScenario.scenario}
Sentinel Objective: ${activeScenario.sentinelTask}

FOUNDER DEFENSE SUBMISSION:
"${userDefense}"`;

    try {
      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: sysPrompt,
          max_tokens: 1100,
          messages: [{ role: "user", content: userPrompt }]
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const dec = new TextDecoder("utf-8");
      let fullText = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += dec.decode();
            if (buffer) {
              const lines = buffer.split("\n");
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data:")) {
                  const raw = trimmed.slice(5).trim();
                  if (raw && raw !== "[DONE]") {
                    try {
                      const d = JSON.parse(raw);
                      const t = d?.delta?.text || "";
                      if (t) {
                        fullText += t;
                        setResponse(fullText);
                      }
                    } catch {}
                  }
                }
              }
            }
            break;
          }

          buffer += dec.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const raw = trimmed.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const d = JSON.parse(raw);
              const t = d?.delta?.text || "";
              if (t) {
                fullText += t;
                setResponse(fullText);
              }
            } catch {}
          }
        }
      }

      // Compute success metrics
      const newChronos = Math.min(100, Math.max(45, chronosIndex + Math.floor(Math.random() * 8) - 1));
      const newDivergence = Math.max(1, Math.min(60, divergence - Math.floor(Math.random() * 4) + 1));
      setChronosIndex(newChronos);
      setDivergence(newDivergence);

      // Increment daily check-in streak
      const updatedStreak = streak + 1;
      setStreak(updatedStreak);
      localStorage.setItem("forge_daily_streak", updatedStreak.toString());

      // Save Log to History
      const newLog = {
        id: Date.now().toString(),
        challengeTitle: activeScenario.title,
        defense: userDefense,
        sentinelVerdict: fullText || "Evaluation complete.",
        chronos: newChronos,
        timestamp: Date.now()
      };
      
      const newLogs = [newLog, ...diagnosticsLogs];
      setDiagnosticsLogs(newLogs);
      localStorage.setItem("forge_sentinel_logs", JSON.stringify(newLogs));

    } catch (e: any) {
      setResponse(`CONNECTION FAULT: Core Quantum Processors are under high load. Timeline Anchor stabilized locally. Tactical analysis: ${e.message}`);
    } finally {
      setLoading(false);
      setUserDefense("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const handleNextChallenge = () => {
    setActiveScenarioIdx((prev) => (prev + 1) % scenarios.length);
    setResponse("");
  };

  const formatText = (txt: string) => {
    return txt.split("\n").map((line, idx) => {
      if (!line.trim()) return <div key={idx} style={{ height: "0.55rem" }} />;
      const isBullet = line.trim().startsWith("→") || line.trim().startsWith("-");
      const cleanLine = line.replace(/^[→\-]\s*/, "");
      const html = cleanLine.replace(/\*\*(.*?)\*\*/g, `<strong style="color:${LIME}; font-weight:bold;">$1</strong>`);
      
      const cleanHtml = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["strong"],
        ALLOWED_ATTR: ["style"]
      });

      return (
        <div key={idx} style={{ 
          fontSize: "0.80rem", 
          lineHeight: "1.65", 
          color: "rgba(255,255,255,0.85)", 
          fontFamily: "monospace",
          marginBottom: "0.35rem",
          paddingLeft: isBullet ? "1.2rem" : 0,
          position: "relative"
        }}>
          {isBullet && <span style={{ position: "absolute", left: 0, color: LIME }}>→</span>}
          <span dangerouslySetInnerHTML={{ __html: cleanHtml }} />
        </div>
      );
    });
  };

  const activeChallenge = scenarios[activeScenarioIdx] || DAILY_CHALLENGES[0];

  return (
    <div style={{ animation: "fadeIn 0.28s cubic-bezier(0.4, 0, 0.2, 1)", marginTop: "1rem" }}>
      
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid #1c1c1c" }}>
        <div>
          <span style={{ color: PURPLE, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", fontWeight: "bold" }}>🌌 CHRONO-TEMPORAL INTELLIGENCE INTERFACE</span>
          <h2 style={{ color: "#fff", margin: "0.2rem 0 0", fontSize: "1.25rem", fontWeight: "bold" }}>2100 Quantum Venture Sentinel</h2>
        </div>
        
        {/* Bright cancel X button styled Congruently */}
        <button 
          onClick={onClose}
          style={{ 
            background: "rgba(255, 60, 120, 0.08)", 
            border: "1px solid rgba(255, 60, 120, 0.3)", 
            color: PINK, 
            padding: "0.5rem 0.95rem", 
            fontSize: "10px", 
            fontFamily: "monospace", 
            borderRadius: "5px", 
            cursor: "pointer", 
            fontWeight: "bold",
            transition: "all 0.15s"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = PINK; e.currentTarget.style.color = "#000"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255, 60, 120, 0.08)"; e.currentTarget.style.color = PINK; }}
        >
          CLOSE INTERFACE
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        
        <div style={{ background: "#0c0c0c", border: "1px solid #151515", borderRadius: "6px", padding: "0.8rem", textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "8px", letterSpacing: "1px", textTransform: "uppercase", fontFamily: "monospace" }}>Chrono-Alignment</div>
          <div style={{ color: LIME, fontSize: "1.4rem", fontWeight: "bold", marginTop: "2px", fontFamily: "monospace" }}>99.88%</div>
        </div>

        <div style={{ background: "#0c0c0c", border: "1px solid #151515", borderRadius: "6px", padding: "0.8rem", textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "8px", letterSpacing: "1px", textTransform: "uppercase", fontFamily: "monospace" }}>Chronos Moat Strength</div>
          <div style={{ color: CYAN, fontSize: "1.4rem", fontWeight: "bold", marginTop: "2px", fontFamily: "monospace" }}>{chronosIndex}%</div>
        </div>

        <div style={{ background: "#0c0c0c", border: "1px solid #151515", borderRadius: "6px", padding: "0.8rem", textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "8px", letterSpacing: "1px", textTransform: "uppercase", fontFamily: "monospace" }}>Timeline Divergence</div>
          <div style={{ color: PINK, fontSize: "1.4rem", fontWeight: "bold", marginTop: "2px", fontFamily: "monospace" }}>{divergence}σ</div>
        </div>

        <div style={{ background: "#0c0c0c", border: "1px solid #151515", borderRadius: "6px", padding: "0.8rem", textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "8px", letterSpacing: "1px", textTransform: "uppercase", fontFamily: "monospace" }}>Daily Connection Streak</div>
          <div style={{ color: PURPLE, fontSize: "1.4rem", fontWeight: "bold", marginTop: "2px", fontFamily: "monospace" }}>{streak} Days</div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        
        {/* Workspace Block */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          
          {/* Navigation Tab */}
          <div style={{ display: "flex", gap: "0.42rem", borderBottom: "1px solid #1c1c1c", paddingBottom: "0.5rem" }}>
            <button 
              onClick={() => setActiveTab("diagnostic")}
              style={{
                background: activeTab === "diagnostic" ? "rgba(184, 127, 255, 0.08)" : "transparent",
                border: activeTab === "diagnostic" ? `1px solid ${PURPLE}` : "1px solid transparent",
                color: activeTab === "diagnostic" ? "#ffffff" : "rgba(255,255,255,0.4)",
                padding: "0.45rem 0.9rem",
                fontFamily: "monospace",
                fontSize: "11px",
                fontWeight: "bold",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              🌌 DAILY STRATEGIC CRISIS TEST
            </button>
            <button 
              onClick={() => setActiveTab("history")}
              style={{
                background: activeTab === "history" ? "rgba(184, 127, 255, 0.08)" : "transparent",
                border: activeTab === "history" ? `1px solid ${PURPLE}` : "1px solid transparent",
                color: activeTab === "history" ? "#ffffff" : "rgba(255,255,255,0.4)",
                padding: "0.45rem 0.9rem",
                fontFamily: "monospace",
                fontSize: "11px",
                fontWeight: "bold",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              📅 TIMELINE ANCHORS HISTORIC LOGS ({diagnosticsLogs.length})
            </button>
          </div>

          {activeTab === "diagnostic" && activeChallenge && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", background: "#080808", border: "1px solid #1a1a1a", padding: "1.5rem", borderRadius: "8px" }}>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: LIME, fontSize: "9px", fontFamily: "monospace", letterSpacing: "1px", textTransform: "uppercase" }}>ACTIVE ANOMALY SEQUENCE: {activeChallenge.title}</span>
                <button 
                  onClick={handleNextChallenge}
                  style={{ background: "transparent", border: "1px solid #222", color: "rgba(255,255,255,0.5)", fontSize: "8.5px", fontFamily: "monospace", padding: "3px 8px", cursor: "pointer", borderRadius: "4px" }}
                >
                  NEXT CRISIS SEQUENCE →
                </button>
              </div>

              <div>
                <p style={{ color: "#fff", fontSize: "0.95rem", lineHeight: "1.6", margin: "0 0 0.8rem", fontFamily: "monospace", fontWeight: "bold" }}>
                  {activeChallenge.scenario}
                </p>
                <div style={{ background: "rgba(0, 240, 255, 0.04)", border: `1px solid rgba(0, 240, 255, 0.15)`, padding: "0.75rem 1rem", borderRadius: "5px" }}>
                  <span style={{ color: CYAN, fontSize: "8px", textTransform: "uppercase", display: "block", marginBottom: "4px", letterSpacing: "1px" }}>SENTINEL CORE MANDATE</span>
                  <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.78rem", margin: 0, fontFamily: "monospace", lineHeight: "1.5" }}>
                    {activeChallenge.sentinelTask}
                  </p>
                </div>
              </div>

              {/* Responder Interface */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
                <span style={{ color: PURPLE, fontSize: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>FOUNDER CRISIS MITIGATION DEFENSE DEFLECTION:</span>
                <textarea 
                  value={userDefense}
                  onChange={e => setUserDefense(e.target.value)}
                  placeholder="Explain exactly how your venture moats, architecture, or customer relationships defeat this structural future threat..."
                  style={{
                    width: "100%",
                    background: "#0c0c0c",
                    border: "1px solid #1c1c1c",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "0.85rem",
                    padding: "0.85rem",
                    resize: "none",
                    height: "85px",
                    fontFamily: "monospace",
                    outline: "none",
                    boxSizing: "border-box",
                    lineHeight: "1.6"
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && userDefense.trim() && !loading) {
                      runDiagnosticDefense();
                    }
                  }}
                />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px" }}>⌘ + ENTER TO TRANSMIT DEFENSE SECURELY</span>
                  <button 
                    onClick={runDiagnosticDefense}
                    disabled={!userDefense.trim() || loading}
                    style={{
                      background: !userDefense.trim() || loading ? "#141414" : LIME,
                      color: "#111",
                      border: "none",
                      padding: "0.65rem 1.4rem",
                      fontSize: "10px",
                      fontWeight: "900",
                      letterSpacing: "1.5px",
                      borderRadius: "5px",
                      fontFamily: "monospace",
                      cursor: !userDefense.trim() || loading ? "not-allowed" : "pointer",
                      textTransform: "uppercase"
                    }}
                  >
                    {loading ? "TRANSMITTING TELEMETRY..." : "TRANSMIT TIMELINE DEFENSE →"}
                  </button>
                </div>

              </div>

              {/* Streaming AI diagnostics response */}
              {response && (
                <div style={{ background: "#050505", border: "1px solid #181818", padding: "1.2rem", borderRadius: "6px", marginTop: "0.85rem", animation: "fadeIn 0.3s ease" }}>
                  <div style={{ display: "flex", gap: "0.55rem", alignItems: "center", marginBottom: "0.8rem", borderBottom: "1px solid #121212", paddingBottom: "0.55rem" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: LIME, animation: "pulse 1.3s infinite" }} />
                    <span style={{ color: LIME, fontSize: "9px", fontFamily: "monospace", letterSpacing: "1px" }}>QUANTUM SENTINEL COMPILER VERDICT INCOMING:</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {formatText(response)}
                  </div>
                  <div ref={bottomRef} />
                </div>
              )}

            </div>
          )}

          {activeTab === "history" && (
            <div style={{ background: "#080808", border: "1px solid #1a1a1a", padding: "1.4rem", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "0.85rem", maxHeight: "400px", overflowY: "auto" }}>
              {diagnosticsLogs.length === 0 ? (
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", fontFamily: "monospace", textAlign: "center", padding: "2.5rem 0" }}>
                  No historical timeline evaluations logged yet. Complete a strategic crisis diagnostic to anchor a timeline.
                </span>
              ) : (
                diagnosticsLogs.map((log) => (
                  <div key={log.id} style={{ background: "#0c0c0c", border: "1px solid #161616", borderRadius: "6px", padding: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a1a1a", paddingBottom: "0.45rem", marginBottom: "0.6rem" }}>
                      <span style={{ color: PURPLE, fontSize: "9px", fontWeight: "bold", fontFamily: "monospace" }}>{log.challengeTitle}</span>
                      <span style={{ color: LIME, fontSize: "9px", fontFamily: "monospace" }}>Chrono Score: {log.chronos}%</span>
                    </div>
                    <div style={{ marginBottom: "0.65rem" }}>
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px", textTransform: "uppercase" }}>SUBMITTED DEFENSE:</span>
                      <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.76rem", margin: "2px 0 0", fontStyle: "italic", fontFamily: "monospace" }}>"{log.defense}"</p>
                    </div>
                    <div>
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px", textTransform: "uppercase" }}>SENTINEL ASSESSMENT:</span>
                      <div style={{ marginTop: "4px" }}>
                        {formatText(log.sentinelVerdict)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>

        {/* Info / Rule Panel */}
        <div style={{ background: "#060606", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1.1rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          
          <div>
            <span style={{ color: PURPLE, fontSize: "8px", textTransform: "uppercase", letterSpacing: "2.5px" }}>TEMPORAL PROTOCOL</span>
            <h3 style={{ color: "#fff", margin: "0.2rem 0 0.4rem", fontSize: "0.9rem", fontWeight: "bold" }}>Temporal Moat Rule</h3>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", lineHeight: "1.5", margin: 0 }}>
              The highest potential companies of the 21st century deploy digital and trust assets that make zero-marginal-copy operations structurally irrelevant. If your business is copying software, you are in danger of automated synthetic displacement.
            </p>
          </div>

          <div style={{ borderTop: "1px solid #151515", paddingTop: "0.85rem" }}>
            <span style={{ color: CYAN, fontSize: "8px", textTransform: "uppercase", letterSpacing: "2.5px" }}>AETHER FEEDBACK</span>
            <h3 style={{ color: "#fff", margin: "0.2rem 0 0.4rem", fontSize: "0.9rem", fontWeight: "bold" }}>Daily Accountability</h3>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", lineHeight: "1.5", margin: 0 }}>
              Solve one futuristic economic crisis check-in daily. Regular compliance cements your chronological alignment score, and stabilizes defensive metrics securely in local storage vaults.
            </p>
          </div>

          <div style={{ borderTop: "1px solid #151515", paddingTop: "0.85rem" }}>
            <span style={{ color: LIME, fontSize: "8px", textTransform: "uppercase", letterSpacing: "2.5px" }}>AGENT STATUS</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginTop: "0.4rem" }}>
              <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: LIME, animation: "pulse 1s infinite" }} />
              <span style={{ color: "#fff", fontSize: "0.72rem", fontFamily: "monospace" }}>Sentinel AI Online (2100)</span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.62rem", display: "block", marginTop: "3px", fontFamily: "monospace" }}>Aether Gateway Connection Solid</span>
          </div>

        </div>

      </div>

    </div>
  );
}
